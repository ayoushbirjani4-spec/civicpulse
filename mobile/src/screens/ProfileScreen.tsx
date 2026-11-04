import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, errorMessage, Field, Icon, ListRow, Message, RoadTrack, Screen, Text } from '../components/ui';
import { badges, Impact, nextRankLine, NO_IMPACT, rank } from '../impact';
import type { ScreenProps } from '../navigation';
import { color, family, ICON, radius, space, type } from '../theme';

export function ProfileScreen({ navigation }: ScreenProps<'Profile'>) {
  const { user, logout, updateDisplayName } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [impact, setImpact] = useState<Impact>(NO_IMPACT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Impact>('/me/impact').then(setImpact).catch(() => {});
    }, []),
  );

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await updateDisplayName(displayName);
      setSaved('Name saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const level = rank(impact.reports);
  const list = badges(impact);
  const earned = list.filter((b) => b.earned).length;

  return (
    <Screen>
      <View style={styles.who}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.display_name[0] ?? '?').toUpperCase()}</Text>
        </View>
        <View style={styles.flex1}>
          <Text style={type.heading}>{user?.display_name}</Text>
          <Text style={type.small}>{user?.email}</Text>
        </View>
      </View>

      <Card style={styles.rankCard}>
        <View style={styles.rankRow}>
          <Text style={styles.strong}>{level.name}</Text>
          <Text style={type.meta}>{nextRankLine(level)}</Text>
        </View>
        <RoadTrack value={level.progress} />
        <View style={styles.figures}>
          <Figure value={impact.reports} label="Reports" />
          <Figure value={impact.confirmations} label="Confirmed" />
          <Figure value={impact.in_repair} label="In repair" />
          <Figure value={impact.fixed} label="Fixed" accent />
        </View>
      </Card>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={type.heading}>Badges</Text>
          <Text style={type.meta}>
            {earned} of {list.length}
          </Text>
        </View>
        <View style={styles.grid}>
          {list.map((b) => (
            <View
              key={b.key}
              style={[styles.badge, !b.earned && styles.badgeLocked]}
              accessibilityLabel={`${b.title}, ${b.earned ? 'earned' : `locked: ${b.hint}`}`}
            >
              <Icon name={b.earned ? b.icon : 'lock-closed-outline'} size={ICON} color={b.earned ? color.text : color.muted} />
              <Text style={[styles.badgeTitle, !b.earned && styles.muted]} numberOfLines={1}>
                {b.title}
              </Text>
              <Text style={styles.badgeHint} numberOfLines={2}>
                {b.earned ? 'Earned' : b.hint}
              </Text>
            </View>
          ))}
        </View>
        <Text style={type.small}>Points, missions and the leaderboard come in a later update</Text>
      </View>

      <Card style={styles.nameCard}>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} />
        <Message text={error} />
        <Message text={saved} success />
        <Button title="Save name" secondary onPress={save} busy={busy} />
      </Card>

      <Card style={styles.list}>
        <ListRow icon="key-outline" title="Change password" onPress={() => navigation.navigate('ChangePassword')} />
        <ListRow icon="server-outline" title="Server address" onPress={() => navigation.navigate('Server')} />
        <ListRow icon="log-out-outline" title="Log out" danger last onPress={logout} />
      </Card>
    </Screen>
  );
}

function Figure({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, accent && styles.accent]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: family.medium, fontSize: 22, color: color.text },
  rankCard: { gap: space.md },
  rankRow: { gap: 2 },
  strong: { fontFamily: family.semibold, fontSize: 15, color: color.text },
  figures: {
    flexDirection: 'row',
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  figure: { flex: 1, gap: 2 },
  figureValue: { fontFamily: family.monoMedium, fontSize: 20, lineHeight: 24, color: color.text, fontVariant: ['tabular-nums'] },
  accent: { color: color.accent },
  section: { gap: space.md, marginTop: space.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.md,
    gap: space.xs,
  },
  badgeLocked: { backgroundColor: color.raised },
  badgeTitle: { fontFamily: family.medium, fontSize: 13, color: color.text, marginTop: space.xs },
  badgeHint: { fontSize: 12, lineHeight: 16, color: color.muted },
  muted: { color: color.muted },
  nameCard: { gap: space.md },
  list: { paddingVertical: space.xs },
});
