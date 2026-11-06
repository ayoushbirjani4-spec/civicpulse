import type { IconName } from './components/ui';
import { color } from './theme';

/** Totals from GET /me/impact. */
export type Impact = { reports: number; hazards: number; confirmations: number; in_repair: number; fixed: number };

export const NO_IMPACT: Impact = { reports: 0, hazards: 0, confirmations: 0, in_repair: 0, fixed: 0 };

// Ranks only count the user's own accepted reports. Real points arrive with M10, where the server
// decides them; these are a progress marker, not a score.
const RANKS = [
  { min: 0, name: 'New volunteer' },
  { min: 1, name: 'Spotter' },
  { min: 5, name: 'Road Scout' },
  { min: 15, name: 'Street Guardian' },
  { min: 40, name: 'City Champion' },
];

export function rank(reports: number) {
  let index = 0;
  while (index + 1 < RANKS.length && reports >= RANKS[index + 1].min) index++;
  const next = RANKS[index + 1];
  const current = RANKS[index];
  return {
    name: current.name,
    next: next?.name ?? null,
    toNext: next ? next.min - reports : 0,
    progress: next ? (reports - current.min) / (next.min - current.min) : 1,
  };
}

export function nextRankLine(level: ReturnType<typeof rank>) {
  if (!level.next) return 'Top rank reached';
  return `${level.toNext} more ${level.toNext === 1 ? 'report' : 'reports'} to ${level.next}`;
}

export type Badge = { key: string; title: string; hint: string; icon: IconName; earned: boolean };

export function badges(i: Impact): Badge[] {
  return [
    { key: 'first', title: 'First report', hint: 'Send your first report', icon: 'camera-outline', earned: i.reports >= 1 },
    { key: 'five', title: 'Five hazards', hint: 'Report 5 hazards', icon: 'flag-outline', earned: i.hazards >= 5 },
    { key: 'backed', title: 'Backed up', hint: 'Someone else reports your hazard', icon: 'people-outline', earned: i.confirmations >= 1 },
    { key: 'repair', title: 'In repair', hint: 'A hazard you reported goes into repair', icon: 'construct-outline', earned: i.in_repair + i.fixed >= 1 },
    { key: 'fixed', title: 'Got it fixed', hint: 'A hazard you reported is fixed', icon: 'checkmark-done-outline', earned: i.fixed >= 1 },
    { key: 'guardian', title: 'Guardian', hint: 'Report 15 hazards', icon: 'shield-checkmark-outline', earned: i.hazards >= 15 },
  ];
}

export const STAGES = ['Reported', 'In repair', 'Fixed'];

/**
 * Where a report is on its way to a repair. `stage` is the last stop reached (-1 for none),
 * `label` and `tint` describe it in words for the status line.
 */
export type Journey = { stage: number; label: string; tint: string };

export function journey(state: string, pinStatus: string | null | undefined): Journey {
  if (state === 'rejected') return { stage: -1, label: 'Not accepted', tint: color.negative };
  if (pinStatus === 'closed') return { stage: 2, label: 'Fixed', tint: color.positive };
  if (pinStatus === 'pending_repair') return { stage: 1, label: 'In repair', tint: color.progress };
  return { stage: 0, label: 'On the map', tint: color.text2 };
}

// Matched by name so queued reports, which only keep the category name, get the same icon.
const CATEGORY_ICONS: [string, IconName][] = [
  ['pothole', 'warning-outline'],
  ['water', 'water-outline'],
  ['drain', 'funnel-outline'],
  ['debris', 'leaf-outline'],
  ['branch', 'leaf-outline'],
];

export function categoryIcon(name: string): IconName {
  const n = name.toLowerCase();
  return CATEGORY_ICONS.find(([word]) => n.includes(word))?.[1] ?? 'help-circle-outline';
}

/** A short job-ticket number from a report id, like 4A65. */
export function ticket(id: string) {
  return id.replace(/[^0-9a-f]/gi, '').slice(0, 4).toUpperCase();
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}
