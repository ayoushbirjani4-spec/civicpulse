// Web preview only: SecureStore backed by memory. ?guest shows the logged-out screens.
import './fake-api';

const guest = new URLSearchParams(globalThis.location?.search ?? '').has('guest');
const store = new Map(
  guest
    ? []
    : [
        ['civicpulse.access_token', 'a'],
        ['civicpulse.refresh_token', 'r'],
        ['civicpulse.user', JSON.stringify({ id: 'u1', email: 'ayesha@example.com', display_name: 'Ayesha Khan', role: 'citizen', email_verified: true, created_at: '2026-10-01T10:00:00Z' })],
      ],
);

export const getItemAsync = async (k) => store.get(k) ?? null;
export const setItemAsync = async (k, v) => void store.set(k, v);
export const deleteItemAsync = async (k) => void store.delete(k);
