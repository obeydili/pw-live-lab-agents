// Starts the app on a free port for one test file: const app = await startApp(); … await app.close().
import { createApp } from '../server.js';
import seed from '../data/seed.json' with { type: 'json' };

/** A seed user's password, read from the app's own seed data so no test names a credential. */
export const passwordOf = username => {
  const user = seed.users.find(candidate => candidate.username === username);
  if (!user) throw new Error(`No seed user ${username}`);
  return user.password;
};

export const startApp = async options => {
  const server = createApp(options).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  /** Signs in through the API and returns the Bearer token. */
  const login = async (username, password = passwordOf(username)) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (response.status !== 200) throw new Error(`login ${username} failed: ${response.status}`);
    return (await response.json()).token;
  };

  /** fetch against the app, with JSON in and out; `token` adds the Bearer header. */
  const request = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (a page, a CSV): keep the text.
    }
    return { status: response.status, headers: response.headers, body: json, text };
  };

  const close = () => new Promise(resolve => server.close(resolve));
  return { baseUrl, close, login, request };
};
