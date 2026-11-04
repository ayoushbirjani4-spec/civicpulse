import { useFocusEffect } from '@react-navigation/native';
import { File } from 'expo-file-system';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  errorMessage,
  Icon,
  ListRow,
  Message,
  RoadTrack,
  StatusDot,
  Text,
  Wordmark,
} from '../components/ui';
import {
  badges,
  categoryIcon,
  Impact,
  journey,
  Journey,
  nextRankLine,
  NO_IMPACT,
  rank,
  STAGES,
  ticket,
  timeAgo,
} from '../impact';
import type { ScreenProps } from '../navigation';
import { listQueued, onQueueChange, QueuedReport, remove } from '../reports/queue';
import { processQueue } from '../reports/uploader';
import { color, family, ICON, radius, space, type } from '../theme';

type ServerReport = {
  id: string;
  category_name: string;
  description: string | null;
  is_mocked: boolean;
  captured_at: string;
  state: string;
  pin_status?: string | null;
  photo_url: string | null;
};

function queuedJourney(item: QueuedReport): Journey {
  if (item.status === 'failed') return { stage: -1, label: 'Not accepted', tint: color.negative };
  if (item.attempts === 0) return { stage: -1, label: 'Uploading', tint: color.text2 };
  if (item.last_error === 'no_connection') return { stage: -1, label: 'Waiting for signal', tint: color.muted };
  return { stage: -1, label: 'Will retry', tint: color.muted };
}

export function MyReportsScreen({ navigation, route }: ScreenProps<'MyReports'>) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [queued, setQueued] = useState<QueuedReport[]>([]);
  const [server, setServer] = useState<ServerReport[]>([]);
  const [impact, setImpact] = useState<Impact>(NO_IMPACT);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQueued = useCallback(async () => {
    if (user) setQueued(await listQueued(user.id));
  }, [user]);

  const loadServer = useCallback(async () => {
    const [mine, totals] = await Promise.all([
      api<{ items: ServerReport[] }>('/reports/mine'),
      // A server from before /me/impact answers 404; the rest of the screen still works.
      api<Impact>('/me/impact').catch(() => null),
    ]);
    setServer(mine.items);
    if (totals) setImpact(totals);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setError(null);
    try {
      await processQueue(user.id, { now: true });
      await loadServer();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      await loadQueued();
      setRefreshing(false);
    }
  }, [user, loadQueued, loadServer]);

  // Coming back from a new report or the map shows fresh numbers without a spinner.
  useFocusEffect(
    useCallback(() => {
      loadQueued();
      loadServer().catch(() => {});
    }, [loadQueued, loadServer]),
  );

  useEffect(() => {
    refresh();
    // A finished upload moves an item from the queue to the server list.
    return onQueueChange(() => {
      loadQueued();
      loadServer().catch(() => {});
    });
  }, [refresh, loadQueued, loadServer]);

  async function discard(item: QueuedReport) {
    await remove(item.client_uuid);
    try {
      new File(item.photo_uri).delete();
    } catch {
      // Already gone.
    }
  }

  const name = user?.display_name ?? '';
  const first = name.split(' ')[0];
  const level = rank(impact.reports);
  const earned = badges(impact).filter((b) => b.earned).length;
  const total = queued.length + server.length;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + space.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[color.accent]} />}
    >
      <View style={styles.topRow}>
        <Wordmark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile and badges"
          hitSlop={8}
          onPress={() => navigation.navigate('Profile')}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{(first[0] ?? '?').toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={styles.rank}>
        <Text style={type.small}>{name}</Text>
        <Text style={type.title}>{level.name}</Text>
        <RoadTrack value={level.progress} />
        <Text style={type.small}>{nextRankLine(level)}</Text>
      </View>

      <Card style={styles.figures}>
        <Figure value={impact.reports} label="Reports sent" />
        <Figure value={impact.confirmations} label="Confirmed by others" />
        <Figure value={impact.fixed} label="Fixed" accent />
      </Card>

      {route.params?.thanks ? (
        <Card style={styles.thanks}>
          <View style={styles.flex1}>
            <Text style={styles.strong}>Thanks, {first}</Text>
            <Text style={type.small}>Your report is on its way to the repair map</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={12}
            onPress={() => navigation.setParams({ thanks: undefined })}
          >
            <Icon name="close" size={ICON} color={color.muted} />
          </Pressable>
        </Card>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('NewReport')}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <View style={styles.flex1}>
          <Text style={styles.ctaTitle}>Report a hazard</Text>
          <Text style={styles.ctaText}>Photo, place and type, about 30 seconds</Text>
        </View>
        <Icon name="camera-outline" size={ICON} color={color.onAccent} />
      </Pressable>

      <Card style={styles.links}>
        <ListRow icon="map-outline" title="Hazard map" detail="Reports near you" onPress={() => navigation.navigate('Map')} />
        <ListRow
          icon="ribbon-outline"
          title="Badges"
          detail={`${earned} of 6 earned`}
          last
          onPress={() => navigation.navigate('Profile')}
        />
      </Card>

      <Message text={error} />

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={type.heading}>Your reports</Text>
          {total ? <Text style={type.meta}>{total}</Text> : null}
        </View>

        {total === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.strong}>No reports yet</Text>
            <Text style={type.small}>
              Seen a pothole or a blocked drain? Your first report earns the First report badge.
            </Text>
          </Card>
        ) : null}

        {queued.map((item) => (
          <Ticket
            key={item.client_uuid}
            id={item.client_uuid}
            photo={item.photo_uri}
            title={item.category_name}
            when={item.captured_at}
            journey={queuedJourney(item)}
            note={
              item.status === 'failed'
                ? `The server did not accept it (${item.last_error})`
                : item.attempts > 0 && item.last_error !== 'no_connection'
                  ? `Last try failed (${item.last_error}). Pull down to retry.`
                  : null
            }
            action={item.status === 'failed' ? <Button title="Discard" link danger onPress={() => discard(item)} /> : null}
          />
        ))}
        {server.map((item) => (
          <Ticket
            key={item.id}
            id={item.id}
            photo={item.photo_url}
            title={item.category_name}
            when={item.captured_at}
            journey={journey(item.state, item.pin_status)}
            note={item.is_mocked ? 'Mock location was flagged on this report' : null}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function Figure({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.figure}>
      <Text style={[type.figure, accent && styles.accentFigure]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

type TicketProps = {
  id: string;
  photo: string | null;
  title: string;
  when: string;
  journey: Journey;
  note: string | null;
  action?: ReactNode;
};

/** A report as a repair job ticket: photo, ticket number and its road track. */
function Ticket({ id, photo, title, when, journey: j, note, action }: TicketProps) {
  return (
    <Card style={styles.ticket}>
      <View style={styles.ticketMain}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Icon name={categoryIcon(title)} size={ICON} color={color.muted} />
          </View>
        )}
        <View style={styles.ticketText}>
          <Text style={styles.strong} numberOfLines={1}>
            {title}
          </Text>
          <Text style={type.meta}>
            No. {ticket(id)} · {timeAgo(when)}
          </Text>
          <StatusDot label={j.label} tint={j.tint} />
        </View>
      </View>
      <RoadTrack value={(j.stage + 1) / STAGES.length} stops={STAGES} reached={j.stage} />
      {note ? <Text style={type.small}>{note}</Text> : null}
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.page },
  flex1: { flex: 1 },
  page: { paddingHorizontal: space.xl, paddingBottom: space.section, gap: space.lg },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: family.medium, fontSize: 15, color: color.text },
  rank: { gap: space.sm, marginTop: space.sm },
  figures: { flexDirection: 'row', gap: space.md },
  figure: { flex: 1, gap: space.xs },
  accentFigure: { color: color.accent },
  strong: { fontFamily: family.semibold, fontSize: 15, color: color.text },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.accent,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  ctaTitle: { fontFamily: family.semibold, fontSize: 17, color: color.onAccent },
  ctaText: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
  links: { paddingVertical: space.xs },
  section: { gap: space.md, marginTop: space.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  empty: { gap: space.xs },
  ticket: { padding: space.md, gap: space.md },
  ticketMain: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  photo: { width: 64, height: 64, borderRadius: radius.small, backgroundColor: color.raised },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  ticketText: { flex: 1, gap: space.xs },
});
