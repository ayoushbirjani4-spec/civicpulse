import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Chip, errorMessage, Field, Icon, ListRow, Message, Screen } from '../components/ui';
import { badges, Impact, NO_IMPACT, rank } from '../impact';
import type { ScreenProps } from '../navigation';
import { color, font, radius, space } from '../theme';

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
      setSaved('Saved.');
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
      <Card style={styles.who}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.display_name[0] ?? '?').toUpperCase()}</Text>
        </View>
        <Text style={font.title}>{user?.display_name}</Text>
        <Text style={font.small}>{user?.email}</Text>
        <Chip label={level.name} icon="trophy" fg="#7A5200" bg={color.accentSoft} center />
        <View style={styles.numbers}>
          <Figure value={impact.reports} label="Reports" />
          <Figure value={impact.confirmations} label="Backed you" />
          <Figure value={impact.in_repair} label="In repair" />
          <Figure value={impact.fixed} label="Fixed" />
        </View>
      </Card>

      <View style={styles.sectionRow}>
        <Text style={font.heading}>Badges</Text>
        <Text style={font.small}>
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
            <View style={[styles.badgeIcon, b.earned ? styles.badgeIconOn : styles.badgeIconOff]}>
              <Icon name={b.earned ? b.icon : 'lock-closed'} size={22} color={b.earned ? color.primaryDark : color.muted} />
            </View>
            <Text style={[styles.badgeTitle, !b.earned && styles.muted]} numberOfLines={1}>
              {b.title}
            </Text>
            <Text style={styles.badgeHint} numberOfLines={2}>
              {b.earned ? 'Earned' : b.hint}
            </Text>
          </View>
        ))}
      </View>
      <Text style={font.small}>Points, missions and the leaderboard are coming in a later update.</Text>

      <Card style={styles.section}>
        <Field
          label="Display name"
          icon="person-outline"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
        />
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

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.number}>
      <Text style={styles.numberValue}>{value}</Text>
      <Text style={styles.numberLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  who: { alignItems: 'center', gap: 6 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: color.ink },
  numbers: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  number: { flex: 1, alignItems: 'center' },
  numberValue: { fontSize: 20, fontWeight: '800', color: color.ink },
  numberLabel: { fontSize: 11, color: color.muted, fontWeight: '600' },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  badge: {
    width: '30.5%',
    flexGrow: 1,
    backgroundColor: color.card,
    borderRadius: radius.lg,
    padding: space.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: color.primarySoft,
  },
  badgeLocked: { borderColor: color.border, backgroundColor: '#F8FAFB' },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeIconOn: { backgroundColor: color.accent },
  badgeIconOff: { backgroundColor: color.border },
  badgeTitle: { fontSize: 13, fontWeight: '700', color: color.ink },
  badgeHint: { fontSize: 11, color: color.muted, textAlign: 'center' },
  muted: { color: color.muted },
  section: { gap: space.md },
  list: { paddingVertical: space.xs },
});
