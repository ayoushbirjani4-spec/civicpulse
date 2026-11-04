import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, NetworkError } from '../api/client';
import { color, family, ICON, radius, space, type } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons as Icon };

/** Big digits for 6-digit email codes. */
export const CODE_STYLE = { fontFamily: family.monoMedium, fontSize: 24, letterSpacing: 6, textAlign: 'center' as const };

/**
 * Text in IBM Plex. A fontWeight in a style picks the matching Plex file, because Android
 * cannot fake weights for a custom font.
 */
export function Text({ style, ...props }: TextProps) {
  const { fontWeight, fontFamily, ...rest } = StyleSheet.flatten(style) ?? {};
  const weight = fontWeight === 'bold' ? 700 : Number(fontWeight) || 400;
  const picked = fontFamily ?? (weight >= 600 ? family.semibold : weight >= 500 ? family.medium : family.regular);
  return <RNText {...props} style={[styles.text, rest, { fontFamily: picked }]} />;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password',
  email_already_registered: 'This email already has an account. Log in instead.',
  invalid_code: 'That code is not correct',
  code_expired: 'That code has expired. Send a new one.',
  code_locked: 'Too many wrong tries. Send a new code.',
  account_disabled: 'This account has been disabled',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  invalid_input: 'Check what you entered. Passwords need at least 8 characters.',
  weak_password: 'That password is easy to guess. Try a longer phrase of unrelated words.',
  password_contains_email: 'Your password must not contain your email address',
  wrong_password: 'Your current password is not correct',
  same_password: 'The new password must be different from the current one',
  bad_server_address: 'Enter an address like http://192.168.1.3:8000',
  password_too_simple: 'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol',
};

// The same rule the server enforces in password_problem (api/app/security.py).
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'A number (0–9)', test: (p) => /[0-9]/.test(p) },
  { label: 'A symbol, such as ! @ # - _', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

/** Checks the phone can do before asking the server. Returns a message, or null if fine. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (!PASSWORD_RULES.every((r) => r.test(password))) return MESSAGES.password_too_simple;
  if (password !== confirm) return 'The two passwords do not match';
  return null;
}

/** A live checklist under a new-password field, ticking each rule as it is met. */
export function PasswordRules({ password, confirm }: { password: string; confirm: string }) {
  const rows = [...PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(password) }))];
  if (confirm.length > 0) rows.push({ label: 'Both passwords match', ok: password === confirm });
  return (
    <View accessibilityLabel="Password requirements" style={styles.rules}>
      {rows.map((r) => (
        <View key={r.label} style={styles.ruleRow}>
          <Ionicons
            name={r.ok ? 'checkmark-circle-outline' : 'ellipse-outline'}
            size={16}
            color={r.ok ? color.positive : color.muted}
          />
          <Text style={[type.small, r.ok && styles.ruleOk]}>{r.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) return 'Could not reach the server. Check your connection.';
  if (error instanceof ApiError) return MESSAGES[error.code] ?? 'Something went wrong. Try again.';
  return 'Something went wrong. Try again.';
}

/** A scrolling page. `top` pads for the status bar on screens without a header. */
export function Screen({ children, top }: { children: ReactNode; top?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.screen, top && { paddingTop: insets.top + space.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Title block at the top of a form screen. */
export function FormHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.formHeader}>
      <Text style={type.title}>{title}</Text>
      {subtitle ? <Text style={type.body}>{subtitle}</Text> : null}
    </View>
  );
}

/** The product name in the interface family, next to a flat pulse mark. */
export function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <View style={styles.mark}>
        <Ionicons name="pulse" size={16} color={color.onAccent} />
      </View>
      <Text style={styles.wordmarkText}>CivicPulse</Text>
    </View>
  );
}

export function Field({ label, secureTextEntry, style, ...input }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <View style={[styles.inputBox, focused && styles.inputFocused, input.multiline && styles.inputMulti]}>
        <TextInput
          style={[styles.input, style]}
          accessibilityLabel={label}
          placeholderTextColor={color.muted}
          secureTextEntry={secureTextEntry && hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...input}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
            onPress={() => setHidden(!hidden)}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={ICON} color={color.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** A raised neutral button instead of the accent fill. */
  secondary?: boolean;
  /** Text only, for low-priority actions. */
  link?: boolean;
  danger?: boolean;
};

export function Button({ title, onPress, busy, disabled, secondary, link, danger }: ButtonProps) {
  const filled = !secondary && !link;
  const tint = filled ? color.onAccent : danger ? color.negative : link ? color.accent : color.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        filled && styles.primary,
        secondary && styles.secondary,
        link && styles.link,
        pressed && styles.pressed,
        (busy || disabled) && styles.disabled,
      ]}
    >
      {busy ? <ActivityIndicator color={tint} /> : <Text style={[styles.buttonText, { color: tint }]}>{title}</Text>}
    </Pressable>
  );
}

export function Message({ text, success }: { text: string | null; success?: boolean }) {
  if (!text) return null;
  return (
    <View style={[styles.message, success ? styles.messageOk : styles.messageError]} accessibilityLiveRegion="polite">
      <Ionicons
        name={success ? 'checkmark-circle-outline' : 'alert-circle-outline'}
        size={ICON}
        color={success ? color.positive : color.negative}
      />
      <Text style={[styles.messageText, { color: success ? color.positive : color.negative }]}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | (ViewStyle | false)[] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A status word with a small dot in its meaning's colour. */
export function StatusDot({ label, tint }: { label: string; tint: string }) {
  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[styles.statusText, { color: tint }]}>{label}</Text>
    </View>
  );
}

const DASHES = 12;

/**
 * The signature detail: a strip of asphalt whose centre line is painted in as progress is made.
 * Used for a report's journey (Reported, In repair, Fixed) and for rank progress, nowhere else.
 */
export function RoadTrack({ value, stops, reached = -1 }: { value: number; stops?: string[]; reached?: number }) {
  const painted = Math.round(Math.max(0, Math.min(1, value)) * DASHES);
  return (
    <View style={styles.trackWrap}>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round(value * 100), min: 0, max: 100 }}
      >
        {Array.from({ length: DASHES }, (_, i) => (
          <View key={i} style={[styles.dash, { backgroundColor: i < painted ? color.marking : color.markingOff }]} />
        ))}
      </View>
      {stops ? (
        <View style={styles.stops}>
          {stops.map((s, i) => (
            <Text key={s} style={[type.meta, i <= reached && styles.stopReached]}>
              {s}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A tappable row for settings-style lists. */
export function ListRow({
  icon,
  title,
  detail,
  onPress,
  danger,
  last,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={ICON} color={danger ? color.negative : color.muted} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && { color: color.negative }]}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
      {danger ? null : <Ionicons name="chevron-forward" size={ICON} color={color.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { color: color.text, fontSize: 15 },
  flex: { flex: 1, backgroundColor: color.page },
  screen: { flexGrow: 1, padding: space.xl, paddingBottom: space.section, gap: space.lg },
  formHeader: { gap: space.sm, marginBottom: space.sm },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: {
    width: 28,
    height: 28,
    borderRadius: radius.small,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkText: { fontFamily: family.semibold, fontSize: 17, color: color.text },
  field: { gap: space.sm },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    backgroundColor: color.card,
    minHeight: 48,
  },
  inputFocused: { borderColor: color.accent },
  inputMulti: { alignItems: 'flex-start', paddingVertical: space.xs },
  input: { flex: 1, fontSize: 16, color: color.text, paddingVertical: space.md, fontFamily: family.regular },
  button: {
    minHeight: 48,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  primary: { backgroundColor: color.accent },
  secondary: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.hairline },
  link: { minHeight: 40, paddingHorizontal: 0 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  buttonText: { fontFamily: family.medium, fontSize: 15 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.control },
  messageOk: { backgroundColor: color.positiveSoft },
  messageError: { backgroundColor: color.negativeSoft },
  messageText: { flex: 1, fontSize: 14, lineHeight: 20 },
  rules: { gap: space.xs },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ruleOk: { color: color.positive },
  card: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    padding: space.lg,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: family.medium, fontSize: 13 },
  trackWrap: { gap: 6 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: color.asphalt,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  dash: { flex: 1, height: 2, borderRadius: 1 },
  stops: { flexDirection: 'row', justifyContent: 'space-between' },
  stopReached: { color: color.text2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingVertical: space.sm },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: color.text },
});
