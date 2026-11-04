import NetInfo from '@react-native-community/netinfo';
import { File } from 'expo-file-system';
import { AppState } from 'react-native';

import { api, ApiError, NetworkError } from '../api/client';
import * as queue from './queue';

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 30 * 60_000;

/** Exponential backoff with a little jitter, so many phones coming back online do not retry in step. */
export function backoff(attempts: number) {
  const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
  return delay * (0.8 + Math.random() * 0.4);
}

/** Errors that will not change by trying again; anything else is retried later. */
function isFinal(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);
}

async function upload(item: queue.QueuedReport) {
  const form = new FormData();
  form.append('client_uuid', item.client_uuid);
  form.append('category_id', item.category_id);
  form.append('lat', String(item.lat));
  form.append('lng', String(item.lng));
  form.append('accuracy_m', String(item.accuracy_m));
  form.append('is_mocked', item.is_mocked ? 'true' : 'false');
  form.append('captured_at', item.captured_at);
  if (item.description) form.append('description', item.description);
  // Expo's fetch (the app's global fetch) cannot read React Native's { uri, name, type } shape;
  // it throws before sending. An expo-file-system File is a Blob it can read.
  form.append('photo', new File(item.photo_uri), 'photo.jpg');
  await api('/reports', { method: 'POST', body: form });
}

let running = false;

/**
 * Upload every report that is due, or every pending one when `now` is set (the user asked to retry).
 * The item leaves the queue only after the server confirms it.
 */
export async function processQueue(userId: string, { now = false } = {}) {
  if (running) return;
  running = true;
  try {
    for (const item of await queue.dueItems(userId, now ? Number.MAX_SAFE_INTEGER : Date.now())) {
      try {
        await upload(item);
        await queue.remove(item.client_uuid);
        try {
          new File(item.photo_uri).delete();
        } catch {
          // Already gone; nothing to clean up.
        }
      } catch (error) {
        if (isFinal(error)) {
          await queue.markFailed(item.client_uuid, (error as ApiError).code);
        } else {
          const attempts = item.attempts + 1;
          const reason =
            error instanceof NetworkError
              ? 'no_connection'
              : error instanceof ApiError
                ? error.code
                : String((error as Error)?.message ?? error).slice(0, 120);
          await queue.retryLater(item.client_uuid, attempts, Date.now() + backoff(attempts), reason);
          // Without a connection the next item will fail the same way.
          if (error instanceof NetworkError) break;
        }
      }
    }
  } finally {
    running = false;
  }
}

/** Retry whenever connectivity returns, the app comes to the foreground, or a minute passes. */
export function startUploader(userId: string) {
  const run = () => {
    processQueue(userId).catch((e) => console.warn('Upload queue failed', e));
  };
  run();
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (state.isConnected) run();
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') run();
  });
  const timer = setInterval(run, 60_000);
  return () => {
    unsubscribeNet();
    appState.remove();
    clearInterval(timer);
  };
}
