// Web preview only: answers the app's API calls with sample data so screens can be checked on a laptop.
const user = {
  id: 'u1',
  email: 'ayesha@example.com',
  display_name: 'Ayesha Khan',
  role: 'citizen',
  email_verified: true,
  created_at: '2026-10-01T10:00:00Z',
};
const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const reports = [
  { id: 'r1', category_name: 'Pothole', state: 'received', pin_status: 'open', captured_at: ago(0.3), photo_url: 'https://picsum.photos/seed/road1/200', is_mocked: false, description: null },
  { id: 'r2', category_name: 'Blocked drain', state: 'received', pin_status: 'pending_repair', captured_at: ago(26), photo_url: 'https://picsum.photos/seed/drain2/200', is_mocked: false, description: null },
  { id: 'r3', category_name: 'Waterlogged road', state: 'merged', pin_status: 'closed', captured_at: ago(24 * 6), photo_url: null, is_mocked: false, description: null },
  { id: 'r4', category_name: 'Fallen branch or debris', state: 'rejected', pin_status: 'open', captured_at: ago(24 * 12), photo_url: 'https://picsum.photos/seed/tree4/200', is_mocked: true, description: null },
];
const categories = [
  { id: 'c1', slug: 'pothole', name: 'Pothole', department: 'roads' },
  { id: 'c2', slug: 'waterlogged_road', name: 'Waterlogged road', department: 'water' },
  { id: 'c3', slug: 'blocked_drain', name: 'Blocked drain', department: 'water' },
  { id: 'c4', slug: 'debris', name: 'Fallen branch or debris', department: 'roads' },
  { id: 'c5', slug: 'other', name: 'Other', department: 'roads' },
];
const pin = (id, lng, lat, status, n, cat) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { id, status, severity: n > 2 ? 4 : null, supporter_count: n, category_id: 'c1', category_name: cat, follows_pin_id: null, thumbnail_url: `https://picsum.photos/seed/${id}/400/240` },
});
const pins = {
  type: 'FeatureCollection',
  truncated: false,
  features: [
    pin('p1', 68.852, 27.708, 'open', 3, 'Pothole'),
    pin('p2', 68.866, 27.701, 'pending_repair', 1, 'Blocked drain'),
    pin('p3', 68.845, 27.695, 'open', 5, 'Waterlogged road'),
    pin('p4', 68.873, 27.713, 'closed', 2, 'Pothole'),
  ],
};
const impact = { reports: 7, hazards: 7, confirmations: 3, in_repair: 1, fixed: 2 };
const empty = new URLSearchParams(globalThis.location?.search ?? '').has('new');

function route(method, path) {
  if (path.startsWith('/auth/login')) return [200, { access_token: 'a', refresh_token: 'r', token_type: 'bearer', user }];
  if (path.startsWith('/me/impact')) return [200, empty ? { reports: 0, hazards: 0, confirmations: 0, in_repair: 0, fixed: 0 } : impact];
  if (path.startsWith('/me')) return [200, user];
  if (path.startsWith('/reports/mine')) return [200, { items: empty ? [] : reports, limit: 20, offset: 0 }];
  if (path.startsWith('/categories')) return [200, categories];
  if (path.startsWith('/pins/')) return [200, pins.features.find((f) => path.includes(f.properties.id)) ?? pins.features[0]];
  if (path.startsWith('/pins')) return [200, pins];
  if (path.startsWith('/health')) return [200, { status: 'ok' }];
  if (method === 'POST') return [204, null];
  return [404, { detail: 'not_found' }];
}

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!/:8000\//.test(url)) return realFetch(input, init);
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const [status, body] = route((init.method ?? 'GET').toUpperCase(), path);
  await new Promise((r) => setTimeout(r, 250));
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};
