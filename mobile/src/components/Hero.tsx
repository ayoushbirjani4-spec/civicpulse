import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space } from '../theme';

/** The app's mark: a pulse line in a rounded square. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Ionicons name="pulse" size={size * 0.62} color={color.primary} />
    </View>
  );
}

/** Full-width teal header that runs under the status bar, with soft circles for depth. */
export function Hero({ children, tall }: { children: ReactNode; tall?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { paddingTop: insets.top + space.lg }, tall && styles.tall]}>
      <View style={[styles.circle, styles.circleA]} />
      <View style={[styles.circle, styles.circleB]} />
      {children}
    </View>
  );
}

export function HeroTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: color.primary,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl + space.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
    gap: space.lg,
  },
  tall: { paddingBottom: 64 },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  circleA: { width: 260, height: 260, top: -90, right: -80 },
  circleB: { width: 180, height: 180, bottom: -70, left: -50, backgroundColor: 'rgba(255,176,32,0.14)' },
  logo: { backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { gap: 6 },
  title: { fontSize: 30, fontWeight: '800', color: color.onPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: color.onPrimaryMuted, lineHeight: 22 },
});
