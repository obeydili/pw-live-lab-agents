/**
 * handoff.ts: the one way an agent tells the QA-Co-Pilot Hub "my part is done".
 *
 * It updates work/<dev|qa>/<ID>/status.json (the file the Hub's Orchestration page watches), so agents never
 * hand-edit JSON. Agents can hand off, ask Omer a question (or the Developer, with --for developer), or record
 * that they started. The Developer answers its questions with --answer. Only Omer approves gates, in the Hub.
 * This script can't approve anything.
 *
 *   node agents/bin/handoff.ts --ticket DEV-01 --role developer --done --summary "Plan written" --report PLAN.md
 *   node agents/bin/handoff.ts --ticket DEV-01 --role sdet --done --bug BUG-1 --summary "Filter returns 500" --report SDET-NOTES.md
 *   node agents/bin/handoff.ts --ticket DEV-01 --role reviewer --done --verdict go --summary "..." --report REVIEW.md
 *   node agents/bin/handoff.ts --ticket DEV-01 --role test-planner --blocked --summary "Q1: max note length?"
 *   node agents/bin/handoff.ts --ticket DEV-01 --role sdet --blocked --for developer --summary "Q1: how do I see a cancelled order's events?" --report SDET-NOTES.md
 *   node agents/bin/handoff.ts --ticket DEV-01 --role developer --answer --summary "Use GET /api/test/events" --report FEATURE-SPEC.md
 *   node agents/bin/handoff.ts --ticket DEV-01 --show
 *
 * Runs with plain Node 24 (built-in type stripping) or `npx tsx`. Node built-ins only, no packages.
 * Never reads .env, never runs git, never touches anything outside work/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// ---------- Schema (keep identical to the Hub's lib/orchestration.ts) ----------

export const SCHEMA = "orchestration/v1";
export const ROLES = ["developer", "test-planner", "sdet", "reviewer"] as const;
export type Role = (typeof ROLES)[number];
export type Actor = Role | "omer" | "system";
export type TicketType = "dev" | "qa";
export const STAGES = ["filed", "dev_plan", "dev_build", "test_plan", "sdet_plan", "sdet", "bug_fix", "review", "done"] as const;
export type Stage = (typeof STAGES)[number];
export type GateId = "plan" | "move_to_qa" | "test_plan" | "go_no_go";
export type Waiting = "agent" | "omer";
/** Who an agent's question is for. Omer by default; "developer" sends it to the Developer (Claude) through Omer. */
export type AskTarget = "omer" | "developer";
export type Verdict = "go" | "no-go";
export type HistoryAction =
  | "filed" | "started" | "done" | "blocked" | "unblocked" | "bug" | "approved" | "changes_requested" | "moved" | "note";

export interface HistoryEntry {
  at: string;
  role: Actor;
  action: HistoryAction;
  /** The stage the action happened in. */
  stage: Stage;
  summary: string;
  /** Relative to the workspace root, e.g. "work/dev/DEV-01/PLAN.md". */
  reportFile?: string;
  verdict?: Verdict;
  bugs?: string[];
  /** On a "blocked" entry: the question went to the Developer, not Omer. */
  to?: "developer";
}

export interface GateRecord {
  approved: boolean;
  by: "omer";
  at: string;
  note?: string;
}

export interface TicketStatus {
  schema: typeof SCHEMA;
  id: string;
  type: TicketType;
  title: string;
  stage: Stage;
  /** Whose move it is: the stage owner's agent, or Omer (a gate, a question, or the next start). A question for the
   * Developer also waits on "omer": he relays it to the Developer's session. */
  waiting: Waiting;
  /** The owner agent said it started and hasn't handed off yet. */
  working: boolean;
  /** Set when an agent asked a question; cleared by the Hub's "Answered" or, for a question to the Developer, by
   * the Developer's --answer. */
  blocked: { question: string; at: string; to?: "developer" } | null;
  /** The Reviewer's latest verdict (Omer still decides at the go_no_go gate). */
  verdict: Verdict | null;
  openBugs: string[];
  /** Bumped on every write; the Hub sends it back so a stale click can't overwrite an agent's update. */
  rev: number;
  createdAt: string;
  updatedAt: string;
  gates: Partial<Record<GateId, GateRecord>>;
  history: HistoryEntry[];
}

export interface StageRule {
  owner: Role | "omer";
  /** Omer's approval needed after the owner hands off. No gate: the ticket moves on by itself. */
  gate?: GateId;
  /** Where "done" (no gate) or "approve" goes. */
  next?: Stage;
  /** Where "request changes" / No-Go can send it back; the first is the default. */
  changes?: Stage[];
}

export const FLOWS: Record<TicketType, Partial<Record<Stage, StageRule>>> = {
  dev: {
    filed: { owner: "omer", next: "dev_plan" },
    dev_plan: { owner: "developer", gate: "plan", next: "dev_build", changes: ["dev_plan"] },
    dev_build: { owner: "developer", gate: "move_to_qa", next: "test_plan", changes: ["dev_build"] },
    test_plan: { owner: "test-planner", gate: "test_plan", next: "sdet", changes: ["test_plan"] },
    sdet: { owner: "sdet", next: "review" },
    bug_fix: { owner: "developer", next: "sdet" },
    review: { owner: "reviewer", gate: "go_no_go", next: "done", changes: ["sdet", "bug_fix"] },
    done: { owner: "omer" },
  },
  qa: {
    filed: { owner: "omer", next: "sdet_plan" },
    sdet_plan: { owner: "sdet", gate: "plan", next: "sdet", changes: ["sdet_plan"] },
    sdet: { owner: "sdet", next: "review" },
    review: { owner: "reviewer", gate: "go_no_go", next: "done", changes: ["sdet"] },
    done: { owner: "omer" },
  },
};

export const GATE_LABELS: Record<GateId, string> = {
  plan: "Plan approval",
  move_to_qa: "Move to QA",
  test_plan: "Test plan approval",
  go_no_go: "Go / No-Go",
};

const ROLE_LABELS: Record<Role, string> = {
  developer: "Developer",
  "test-planner": "Test Planner",
  sdet: "SDET",
  reviewer: "Reviewer",
};

export const TICKET_ID = /^(DEV|QA)-\d{1,4}$/;
export const BUG_ID = /^BUG-\d{1,4}$/;
const REPORT_NAME = /^[A-Z][A-Z0-9-]*\.md$/;
export const MAX_SUMMARY = 280;
const LOCK_STALE_MS = 10_000;
const LOCK_RETRIES = 50;
const LOCK_WAIT_MS = 100;

// ---------- Pure logic (the Hub's tests can import this) ----------

export class HandoffError extends Error {}

export const typeOf = (id: string): TicketType => (id.startsWith("DEV-") ? "dev" : "qa");

export const ruleOf = (status: Pick<TicketStatus, "type" | "stage">): StageRule => {
  const rule = FLOWS[status.type][status.stage];
  if (!rule) throw new HandoffError(`Stage "${status.stage}" is not part of a ${status.type.toUpperCase()} ticket.`);
  return rule;
};

export const newStatus = (id: string, title: string, now: string): TicketStatus => ({
  schema: SCHEMA,
  id,
  type: typeOf(id),
  title,
  stage: "filed",
  waiting: "omer",
  working: false,
  blocked: null,
  verdict: null,
  openBugs: [],
  rev: 0,
  createdAt: now,
  updatedAt: now,
  gates: {},
  history: [{ at: now, role: "system", action: "filed", stage: "filed", summary: "Ticket filed." }],
});

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

export interface AgentAction {
  role: Role;
  kind: "start" | "done" | "blocked" | "answer";
  summary?: string;
  reportFile?: string;
  verdict?: Verdict;
  bugs?: string[];
  /** For "blocked": who the question is for (default Omer). */
  to?: AskTarget;
}

const checkSummary = (raw: string | undefined): string => {
  const summary = oneLine(raw ?? "");
  if (!summary) throw new HandoffError("--summary is required: one or two sentences for the card.");
  if (summary.length > MAX_SUMMARY) throw new HandoffError(`--summary is ${summary.length} characters; keep it to ${MAX_SUMMARY}. Details go in the report file.`);
  return summary;
};

/** Applies one agent action to a status and returns the new status. Throws HandoffError if it isn't allowed. */
export const applyAgentAction = (current: TicketStatus, action: AgentAction, now: string): TicketStatus => {
  const status: TicketStatus = structuredClone(current);
  const push = (entry: Omit<HistoryEntry, "at" | "role">) => status.history.push({ at: now, role: action.role, ...entry });

  // The Developer answers a question an agent sent it, whatever the stage; the agent that asked carries on.
  if (action.kind === "answer") {
    if (action.role !== "developer") throw new HandoffError("Only the Developer answers with --answer. Omer answers in the Hub.");
    if (status.blocked?.to !== "developer") throw new HandoffError(`${status.id} has no open question for the Developer.`);
    const summary = checkSummary(action.summary);
    status.blocked = null;
    status.waiting = "agent";
    status.working = false;
    push({ action: "unblocked", stage: status.stage, summary, reportFile: action.reportFile });
    status.rev = current.rev + 1;
    status.updatedAt = now;
    return status;
  }

  // A ticket filed in the Hub (or created by this script) that Omer hasn't moved yet: an agent that owns the
  // first working stage may start it from a terminal. Omer started that agent, so this counts as his move.
  if (status.stage === "filed") {
    const first = ruleOf(status).next;
    if (first && ruleOf({ type: status.type, stage: first }).owner === action.role) {
      status.stage = first;
      status.waiting = "agent";
      status.history.push({ at: now, role: "system", action: "moved", stage: first, summary: `Started from a terminal by the ${ROLE_LABELS[action.role]}.` });
    }
  }

  const rule = ruleOf(status);
  if (rule.owner !== action.role) {
    const owner = rule.owner === "omer" ? "Omer" : `the ${ROLE_LABELS[rule.owner]}`;
    throw new HandoffError(`${status.id} is in stage "${status.stage}", which belongs to ${owner}, not the ${ROLE_LABELS[action.role]}.`);
  }
  if (status.waiting !== "agent") {
    if (status.blocked?.to === "developer") throw new HandoffError(`${status.id} is waiting on the Developer's answer to your question. Stop here until it comes.`);
    const why = status.blocked ? "your question" : rule.gate ? GATE_LABELS[rule.gate] : "his next step";
    throw new HandoffError(`${status.id} is already waiting on Omer (${why}). Stop here until he replies.`);
  }

  if (action.kind === "start") {
    status.working = true;
    push({ action: "started", stage: status.stage, summary: action.summary ? oneLine(action.summary) : `${ROLE_LABELS[action.role]} started.` });
  } else {
    const summary = checkSummary(action.summary);

    if (action.kind === "blocked") {
      const toDeveloper = action.to === "developer";
      if (toDeveloper && action.role === "developer") throw new HandoffError("The Developer can't ask itself. Leave out --for to ask Omer.");
      status.working = false;
      status.waiting = "omer";
      status.blocked = toDeveloper ? { question: summary, at: now, to: "developer" } : { question: summary, at: now };
      push({ action: "blocked", stage: status.stage, summary, reportFile: action.reportFile, ...(toDeveloper ? { to: "developer" as const } : {}) });
    } else {
      const bugs = action.bugs ?? [];
      if (action.role === "reviewer" && !action.verdict) throw new HandoffError("The Reviewer must pass --verdict go or --verdict no-go.");
      if (action.role !== "reviewer" && action.verdict) throw new HandoffError("Only the Reviewer gives a verdict.");
      status.working = false;
      status.blocked = null;
      if (action.verdict) status.verdict = action.verdict;
      const from = status.stage;

      if (status.type === "dev" && from === "sdet" && bugs.length > 0) {
        // App bugs go back to the Developer before review.
        status.openBugs = [...new Set([...status.openBugs, ...bugs])];
        status.stage = "bug_fix";
        status.waiting = "agent";
        push({ action: "bug", stage: from, summary, reportFile: action.reportFile, bugs });
      } else {
        if (from === "bug_fix") {
          status.openBugs = bugs.length > 0 ? status.openBugs.filter(bug => !bugs.includes(bug)) : [];
        } else if (bugs.length > 0) {
          // Recorded on the card (a QA ticket has no Developer stage); Omer decides what to do with them.
          status.openBugs = [...new Set([...status.openBugs, ...bugs])];
        }
        push({ action: "done", stage: from, summary, reportFile: action.reportFile, verdict: action.verdict, bugs: bugs.length > 0 ? bugs : undefined });
        if (rule.gate) {
          status.waiting = "omer";
        } else if (rule.next) {
          status.stage = rule.next;
          status.waiting = "agent";
        }
      }
    }
  }

  status.rev = current.rev + 1;
  status.updatedAt = now;
  return status;
};

/** Validates untrusted JSON (a status.json anyone could have edited) into a TicketStatus. */
export const parseStatus = (raw: unknown): TicketStatus => {
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  if (!isRecord(raw)) throw new HandoffError("status.json must be a JSON object.");
  if (raw.schema !== SCHEMA) throw new HandoffError(`status.json schema must be "${SCHEMA}".`);
  if (typeof raw.id !== "string" || !TICKET_ID.test(raw.id)) throw new HandoffError("status.json id is not a DEV-/QA- ticket id.");
  if (raw.type !== typeOf(raw.id)) throw new HandoffError("status.json type doesn't match its id.");
  if (typeof raw.stage !== "string" || !(STAGES as readonly string[]).includes(raw.stage)) throw new HandoffError("status.json stage is unknown.");
  if (raw.waiting !== "agent" && raw.waiting !== "omer") throw new HandoffError("status.json waiting must be agent or omer.");
  if (!Number.isInteger(raw.rev)) throw new HandoffError("status.json rev must be an integer.");
  if (!Array.isArray(raw.history) || !isRecord(raw.gates)) throw new HandoffError("status.json needs history and gates.");
  const status = raw as unknown as TicketStatus;
  ruleOf(status);
  return {
    ...status,
    working: status.working === true,
    blocked: isRecord(raw.blocked)
      ? { question: String(raw.blocked.question ?? ""), at: String(raw.blocked.at ?? ""), ...(raw.blocked.to === "developer" ? { to: "developer" as const } : {}) }
      : null,
    verdict: raw.verdict === "go" || raw.verdict === "no-go" ? raw.verdict : null,
    openBugs: Array.isArray(raw.openBugs) ? raw.openBugs.filter((bug): bug is string => typeof bug === "string" && BUG_ID.test(bug)) : [],
  };
};

/** "Waiting on Omer: Plan approval" / "Next: SDET" / "Done". */
export const describeStatus = (status: TicketStatus): string => {
  const rule = ruleOf(status);
  if (status.stage === "done") return "Done.";
  if (status.blocked) {
    const from = rule.owner === "omer" ? "team" : ROLE_LABELS[rule.owner];
    return status.blocked.to === "developer" ? `Waiting on the Developer: question from the ${from}.` : `Waiting on Omer: question from the ${from}.`;
  }
  if (status.waiting === "omer") return rule.gate ? `Waiting on Omer: ${GATE_LABELS[rule.gate]}.` : "Waiting on Omer to start it.";
  if (rule.owner === "omer") return "Waiting on Omer.";
  return `${status.working ? "In progress" : "Next"}: ${ROLE_LABELS[rule.owner]} (${status.stage}).`;
};

// ---------- Files ----------

const defaultRoot = (): string => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ticketDirOf = (root: string, id: string): string => path.join(root, "work", typeOf(id), id);

const toPosix = (p: string): string => p.split(path.sep).join("/");

const titleFromTicket = (ticketFile: string, id: string): string => {
  const firstHeading = fs.readFileSync(ticketFile, "utf8").split("\n").find(line => line.startsWith("# "));
  const title = firstHeading?.slice(2).replace(new RegExp(`^${id}\\s*[:·-]\\s*`), "").trim();
  return title || id;
};

/** A report name like PLAN.md, inside the ticket folder, that really exists (no claiming a report you didn't write). */
const resolveReport = (root: string, ticketDir: string, name: string): string => {
  if (!REPORT_NAME.test(name)) throw new HandoffError(`--report must be a file name in the ticket folder like PLAN.md or REVIEW.md, not "${name}".`);
  const file = path.join(ticketDir, name);
  if (!fs.existsSync(file)) throw new HandoffError(`${toPosix(path.relative(root, file))} doesn't exist. Write it first, then hand off.`);
  return toPosix(path.relative(root, file));
};

const withLock = <T>(file: string, work: () => T): T => {
  const lock = `${file}.lock`;
  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (age > LOCK_STALE_MS) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      if (attempt >= LOCK_RETRIES) throw new HandoffError(`${path.basename(file)} is locked by another writer. Try again in a moment.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_WAIT_MS);
    }
  }
  try {
    return work();
  } finally {
    fs.rmSync(lock, { force: true });
  }
};

/** Temp file + rename, so the Hub never reads half a file. */
const writeStatus = (file: string, status: TicketStatus): void => {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
};

// ---------- CLI ----------

const USAGE = `Usage:
  node agents/bin/handoff.ts --ticket <DEV-n|QA-n> --role <developer|test-planner|sdet|reviewer> --done --summary "<1-2 sentences>" [--report FILE.md] [--verdict go|no-go] [--bug BUG-n ...]
  node agents/bin/handoff.ts --ticket <ID> --role <role> --blocked --summary "<your question for Omer>" [--report FILE.md]
  node agents/bin/handoff.ts --ticket <ID> --role <role> --blocked --for developer --summary "<your question about the app>" [--report FILE.md]
  node agents/bin/handoff.ts --ticket <ID> --role developer --answer --summary "<your answer>" [--report FILE.md]
  node agents/bin/handoff.ts --ticket <ID> --role <role> --start
  node agents/bin/handoff.ts --ticket <ID> --show`;

const parseCli = (argv: string[]) =>
  parseArgs({
    args: argv,
    options: {
      ticket: { type: "string" },
      role: { type: "string" },
      done: { type: "boolean" },
      blocked: { type: "boolean" },
      start: { type: "boolean" },
      answer: { type: "boolean" },
      for: { type: "string" },
      show: { type: "boolean" },
      summary: { type: "string" },
      report: { type: "string" },
      verdict: { type: "string" },
      bug: { type: "string", multiple: true },
      root: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

export const main = (argv: string[], now: () => string = () => new Date().toISOString()): number => {
  let parsed: ReturnType<typeof parseCli>;
  try {
    parsed = parseCli(argv);
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const values = parsed.values;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  try {
    const id = values.ticket ?? "";
    if (!TICKET_ID.test(id)) throw new HandoffError(`--ticket must look like DEV-01 or QA-01.\n\n${USAGE}`);
    const root = values.root ? path.resolve(values.root) : defaultRoot();
    const ticketDir = ticketDirOf(root, id);
    const ticketFile = path.join(ticketDir, "TICKET.md");
    if (!fs.existsSync(ticketFile)) throw new HandoffError(`${toPosix(path.relative(root, ticketFile))} not found. Is this the right ticket id?`);
    const statusFile = path.join(ticketDir, "status.json");

    const read = (): TicketStatus =>
      fs.existsSync(statusFile)
        ? parseStatus(JSON.parse(fs.readFileSync(statusFile, "utf8")))
        : newStatus(id, titleFromTicket(ticketFile, id), now());

    if (values.show) {
      const status = read();
      const last = status.history[status.history.length - 1];
      console.log(`${status.id} · ${status.title}\nStage: ${status.stage} · ${describeStatus(status)}${status.openBugs.length ? `\nOpen bugs: ${status.openBugs.join(", ")}` : ""}${last ? `\nLast: ${last.role} ${last.action}: ${last.summary}` : ""}`);
      return 0;
    }

    const kinds = (["done", "blocked", "start", "answer"] as const).filter(kind => values[kind]);
    if (kinds.length !== 1) throw new HandoffError(`Pass exactly one of --done, --blocked, --start, --answer (or --show).\n\n${USAGE}`);
    const to = values.for;
    if (to !== undefined && kinds[0] !== "blocked") throw new HandoffError("--for goes with --blocked only.");
    if (to !== undefined && to !== "omer" && to !== "developer") throw new HandoffError("--for must be omer or developer.");
    const role = values.role ?? "";
    if (!(ROLES as readonly string[]).includes(role)) throw new HandoffError(`--role must be one of: ${ROLES.join(", ")}.`);
    const verdict = values.verdict;
    if (verdict !== undefined && verdict !== "go" && verdict !== "no-go") throw new HandoffError("--verdict must be go or no-go.");
    const bugs = values.bug ?? [];
    for (const bug of bugs) {
      if (!BUG_ID.test(bug)) throw new HandoffError(`--bug must look like BUG-3, not "${bug}".`);
      if (!fs.existsSync(path.join(root, "work", "bugs", `${bug}.md`))) throw new HandoffError(`work/bugs/${bug}.md doesn't exist. File the bug first.`);
    }
    const reportFile = values.report ? resolveReport(root, ticketDir, values.report) : undefined;

    const updated = withLock(statusFile, () => {
      const next = applyAgentAction(read(), { role: role as Role, kind: kinds[0], summary: values.summary, reportFile, verdict, bugs, to: to as AskTarget | undefined }, now());
      writeStatus(statusFile, next);
      return next;
    });
    console.log(`${updated.id} updated. ${describeStatus(updated)} The Hub's Orchestration board shows it now.`);
    return 0;
  } catch (error) {
    if (error instanceof HandoffError || error instanceof SyntaxError) {
      console.error(`handoff: ${error.message}`);
      return 1;
    }
    throw error;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
