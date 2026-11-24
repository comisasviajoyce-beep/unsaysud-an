/**
 * Server-only Supabase persistence bridge.
 * Local JSON files remain the first-connect seed and offline/self-hosted fallback.
 */
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const REST_URL = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/app_state` : "";
const writeQueues = new Map<string, Promise<void>>();
export function isSupabaseConfigured(): boolean { return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY); }
function getHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!isSupabaseConfigured()) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server.");
  return { apikey: SUPABASE_SECRET_KEY, Accept: "application/json", ...extra };
}
export async function readSupabaseState<T>(key: string): Promise<T | undefined> {
  if (!isSupabaseConfigured()) return undefined;
  const url = new URL(REST_URL); url.searchParams.set("key", `eq.${key}`); url.searchParams.set("select", "value");
  const response = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!response.ok) throw new Error(`Supabase read failed (${response.status}): ${await response.text()}`);
  const rows = (await response.json()) as Array<{ value: T }>;
  return rows.length ? rows[0].value : undefined;
}
export function writeSupabaseState<T>(key: string, value: T): Promise<void> {
  if (!isSupabaseConfigured()) return Promise.resolve();
  const snapshot = JSON.parse(JSON.stringify(value)) as T;
  const previous = writeQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const response = await fetch(`${REST_URL}?on_conflict=key`, {
      method: "POST", headers: getHeaders({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ key, value: snapshot, updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error(`Supabase write failed (${response.status}): ${await response.text()}`);
  });
  writeQueues.set(key, next);
  return next.finally(() => { if (writeQueues.get(key) === next) writeQueues.delete(key); });
}
export async function restoreOrSeedSupabaseState<T>(key: string, localValue: T): Promise<T> {
  if (!isSupabaseConfigured()) return localValue;
  const remoteValue = await readSupabaseState<T>(key);
  if (typeof remoteValue !== "undefined") return remoteValue;
  await writeSupabaseState(key, localValue); return localValue;
}
