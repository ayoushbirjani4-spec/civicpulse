import { useFocusEffect } from '@react-navigation/native';
import { File } from 'expo-file-system';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Hero } from '../components/Hero';
import { Button, Card, Chip, errorMessage, Icon, IconName, Message, ProgressBar } from '../components/ui';
import { badges, categoryIcon, greeting, Impact, NO_IMPACT, rank, reportStatus, Status, timeAgo } from '../impact';
import type { ScreenProps } from '../navigation';
import { listQueued, onQueueChange, QueuedReport, remove } from '../reports/queue';
import { processQueue } from '../reports/uploader';
import { color, font, radius, shadow, space } from '../theme';

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

function queuedStatus(item: QueuedReport): Status {
  if (item.status === 'failed') return { label: 'Not accepted', icon: 'close-circle', fg: color.danger, bg: color.dangerSoft };
  if (item.attempts === 0) return { label: 'Uploading', icon: 'cloud-upload', fg: color.info, bg: color.infoSoft };
  if (item.last_error === 'no_connection') return { label: 'Waiting for signal', icon: 'cloud-offline', fg: color.muted, bg: color.border };
  return { label: 'Will retry', icon: 'refresh', fg: color.muted, bg: color.border };
}

export function MyReportsScreen({ navigation, route }: ScreenProps<'MyReports'>) {
  const { user } = useAuth();
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

  const name = user?.display_name.split(' ')[0] ?? '';
  const level = rank(impact.reports);
  const earned = badges(impact).filter((b) => b.earned).length;
  const total = queued.length + server.length;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[color.primary]} />}
    >
      <Hero>
        <View style={styles.topRow}>
          <View style={styles.flex1}>
            <Text style={styles.hello}>{greeting()},</Text>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile and badges"
            onPress={() => navigation.navigate('Profile')}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{(name[0] ?? '?').toUpperCase()}</Text>
          </Pressable>
        </View>
        <View style={styles.rankBox}>
          <View style={styles.rankRow}>
            <Icon name="trophy" size={18} color={color.accent} />
            <Text style={styles.rankName}>{level.name}</Text>
          </View>
          <ProgressBar value={level.progress} track="rgba(255,255,255,0.22)" />
          <Text style={styles.rankHint}>
            {level.next
              ? `${level.toNext} more ${level.toNext === 1 ? 'report' : 'reports'} to become ${level.next}`
              : 'Top rank reached. Thank you for looking after your city!'}
          </Text>
        </View>
      </Hero>

      <View style={styles.body}>
        <Card style={styles.stats}>
          <Stat icon="camera" value={impact.reports} label="Reports" tint={color.primary} />
          <View style={styles.statDivider} />
          <Stat icon="people" value={impact.confirmations} label="Backed you" tint={color.info} />
          <View style={styles.statDivider} />
          <Stat icon="checkmark-done" value={impact.fixed} label="Fixed" tint={color.success} />
        </Card>

        {route.params?.thanks ? (
          <View style={styles.thanks}>
            <Icon name="sparkles" size={22} color="#9A6700" />
            <View style={styles.flex1}>
              <Text style={styles.thanksTitle}>Thank you, {name}!</Text>
              <Text style={styles.thanksText}>Your report is on its way to the city repair map.</Text>
            </View>
            <Pressable accessibilityLabel="Dismiss" hitSlop={10} onPress={() => navigation.setParams({ thanks: undefined })}>
              <Icon name="close" size={20} color="#9A6700" />
            </Pressable>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('NewReport')}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <View style={styles.ctaIcon}>
            <Icon name="camera" size={28} color={color.primaryDark} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.ctaTitle}>Report a hazard</Text>
            <Text style={styles.ctaText}>Photo, place and type. About 30 seconds.</Text>
          </View>
          <Icon name="arrow-forward" size={22} color={color.onPrimary} />
        </Pressable>

        <View style={styles.tiles}>
          <Tile icon="map" title="Hazard map" text="See what is near you" onPress={() => navigation.navigate('Map')} />
          <Tile icon="ribbon" title="Badges" text={`${earned} of 6 earned`} onPress={() => navigation.navigate('Profile')} />
        </View>

        <Message text={error} />

        <View style={styles.sectionRow}>
          <Text style={font.heading}>Your reports</Text>
          {total ? <Text style={font.small}>{total}</Text> : null}
        </View>

        {total === 0 ? (
          <Card style={styles.empty}>
            <Icon name="trail-sign" size={40} color={color.primary} />
            <Text style={font.heading}>No reports yet</Text>
            <Text style={[font.body, styles.center]}>
              Seen a pothole or a blocked drain? Your first report earns the First report badge.
            </Text>
          </Card>
        ) : null}

        {queued.map((item) => (
          <ReportRow
            key={item.client_uuid}
            photo={item.photo_uri}
            title={item.category_name}
            when={item.captured_at}
            status={queuedStatus(item)}
            note={
              item.status === 'failed'
                ? `The server did not accept it (${item.last_error}).`
                : item.attempts > 0 && item.last_error !== 'no_connection'
                  ? `Last try failed (${item.last_error}). Pull down to retry.`
                  : null
            }
            action={item.status === 'failed' ? <Button title="Discard" link danger icon="trash-outline" onPress={() => discard(item)} /> : null}
          />
        ))}
        {server.map((item) => (
          <ReportRow
            key={item.id}
            photo={item.photo_url}
            title={item.category_name}
            when={item.captured_at}
            status={reportStatus(item.state, item.pin_status)}
            note={item.is_mocked ? 'Mock location was flagged on this report.' : null}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function Stat({ icon, value, label, tint }: { icon: IconName; value: number; label: string; tint: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={20} color={tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Tile({ icon, title, text, onPress }: { icon: IconName; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileIcon}>
        <Icon name={icon} size={22} color={color.primary} />
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={font.small}>{text}</Text>
    </Pressable>
  );
}

type RowProps = { photo: string | null; title: string; when: string; status: Status; note: string | null; action?: ReactNode };

function ReportRow({ photo, title, when, status, note, action }: RowProps) {
  return (
    <Card style={styles.report}>
      <View style={styles.reportMain}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Icon name={categoryIcon(title)} size={24} color={color.primary} />
          </View>
        )}
        <View style={styles.reportText}>
          <View style={styles.reportTitleRow}>
            <Icon name={categoryIcon(title)} size={15} color={color.muted} />
            <Text style={styles.reportTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text style={font.small}>{timeAgo(when)}</Text>
          <Chip label={status.label} icon={status.icon} fg={status.fg} bg={status.bg} />
        </View>
      </View>
      {note ? <Text style={[font.small, styles.note]}>{note}</Text> : null}
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  flex1: { flex: 1 },
  scroll: { paddingBottom: space.xxl },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hello: { color: color.onPrimaryMuted, fontSize: 15 },
  name: { color: color.onPrimary, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: color.ink },
  rankBox: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, padding: space.md, gap: space.sm },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rankName: { color: color.onPrimary, fontSize: 16, fontWeight: '700' },
  rankHint: { color: color.onPrimaryMuted, fontSize: 13 },
  body: { paddingHorizontal: space.xl, gap: space.md },
  stats: { marginTop: -40, flexDirection: 'row', alignItems: 'center', paddingVertical: space.lg },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: color.ink },
  statLabel: { fontSize: 12, color: color.muted, fontWeight: '600' },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: color.border },
  thanks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.accentSoft,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  thanksTitle: { fontSize: 16, fontWeight: '700', color: '#7A5200' },
  thanksText: { fontSize: 14, color: '#7A5200' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.primaryDark,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow,
  },
  ctaIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: { color: color.onPrimary, fontSize: 18, fontWeight: '800' },
  ctaText: { color: color.onPrimaryMuted, fontSize: 13, marginTop: 2 },
  tiles: { flexDirection: 'row', gap: space.md },
  tile: { flex: 1, backgroundColor: color.card, borderRadius: radius.lg, padding: space.lg, gap: 4, ...shadow },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  tileTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.sm },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  report: { padding: space.md, gap: space.sm },
  reportMain: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: color.primarySoft },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  reportText: { flex: 1, gap: 4 },
  reportTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reportTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: color.ink },
  note: { color: color.text },
});
