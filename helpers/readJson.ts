import type { JsonResponse } from '../types/api';

export async function readJson<T>(res: JsonResponse): Promise<T> {
  return (await res.json()) as T;
}
