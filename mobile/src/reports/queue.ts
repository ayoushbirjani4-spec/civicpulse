import * as SQLite from 'expo-sqlite';

/** A report saved on the phone that the server has not confirmed yet. */
export type QueuedReport = {
  client_uuid: string;
  user_id: string;
  category_id: string;
  category_name: string;
  description: string | null;
  lat: number;
  lng: number;
  accuracy_m: number;
  is_mocked: number;
  captured_at: string;
  photo_uri: string;
  attempts: number;
  next_attempt_at: number;
  status: 'pending' | 'failed';
  last_error: string | null;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db() {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync('civicpulse.db');
    await d.execAsync(`
      CREATE TABLE IF NOT EXISTS queue (
        client_uuid TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        category_name TEXT NOT NULL,
        description TEXT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy_m REAL NOT NULL,
        is_mocked INTEGER NOT NULL,
        captured_at TEXT NOT NULL,
        photo_uri TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `);
    return d;
  })();
  return dbPromise;
}

const listeners = new Set<() => void>();
/** Screens subscribe so they redraw when the queue changes. Returns an unsubscribe function. */
export function onQueueChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const changed = () => listeners.forEach((l) => l());

export async function enqueue(item: Omit<QueuedReport, 'attempts' | 'next_attempt_at' | 'status' | 'last_error'>) {
  await (await db()).runAsync(
    `INSERT INTO queue (client_uuid, user_id, category_id, category_name, description, lat, lng,
       accuracy_m, is_mocked, captured_at, photo_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.client_uuid, item.user_id, item.category_id, item.category_name, item.description, item.lat, item.lng,
     item.accuracy_m, item.is_mocked, item.captured_at, item.photo_uri],
  );
  changed();
}

export async function listQueued(userId: string) {
  return (await db()).getAllAsync<QueuedReport>(
    'SELECT * FROM queue WHERE user_id = ? ORDER BY captured_at DESC',
    [userId],
  );
}

export async function dueItems(userId: string, now: number) {
  return (await db()).getAllAsync<QueuedReport>(
    "SELECT * FROM queue WHERE user_id = ? AND status = 'pending' AND next_attempt_at <= ? ORDER BY captured_at",
    [userId, now],
  );
}

export async function remove(clientUuid: string) {
  await (await db()).runAsync('DELETE FROM queue WHERE client_uuid = ?', [clientUuid]);
  changed();
}

export async function retryLater(clientUuid: string, attempts: number, nextAttemptAt: number, error: string) {
  await (await db()).runAsync(
    'UPDATE queue SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE client_uuid = ?',
    [attempts, nextAttemptAt, error, clientUuid],
  );
  changed();
}

export async function markFailed(clientUuid: string, error: string) {
  await (await db()).runAsync("UPDATE queue SET status = 'failed', last_error = ? WHERE client_uuid = ?", [
    error,
    clientUuid,
  ]);
  changed();
}

export async function getCached(key: string): Promise<string | null> {
  const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setCached(key: string, value: string) {
  await (await db()).runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
}
