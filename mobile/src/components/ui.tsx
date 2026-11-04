import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { ApiError, NetworkError } from '../api/client';
import { color, font, radius, shadow, space } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Big spaced digits for 6-digit email codes. */
export const CODE_STYLE = { fontSize: 24, letterSpacing: 10, fontWeight: '700' as const, textAlign: 'center' as const };
export { Ionicons as Icon };

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_already_registered: 'This email already has an account. Log in instead.',
  invalid_code: 'That code is not correct.',
  code_expired: 'That code has expired. Send a new one.',
  code_locked: 'Too many wrong tries. Send a new code.',
  account_disabled: 'This account has been disabled.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  invalid_input: 'Please check what you entered. Passwords need at least 8 characters.',
  weak_password: 'That password is too easy to guess. Try a longer phrase of unrelated words.',
  password_contains_email: 'Your password must not contain your email address.',
  wrong_password: 'Your current password is not correct.',
  same_password: 'The new password must be different from the current one.',
  bad_server_address: 'Enter an address like http://192.168.1.3:8000',
  password_too_simple: 'Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.',
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
  if (password !== confirm) return 'The two passwords do not match.';
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
            name={r.ok ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={r.ok ? color.success : color.muted}
          />
          <Text style={[styles.rule, r.ok && styles.ruleOk]}>{r.label}</Text>
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

/** A scrolling page. `header` is drawn edge to edge above the padded content. */
export function Screen({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        <View style={styles.screen}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Title block at the top of a form screen. */
export function FormHeader({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <View style={styles.formHeader}>
      <View style={styles.formIcon}>
        <Ionicons name={icon} size={26} color={color.primary} />
      </View>
      <Text style={font.title}>{title}</Text>
      {subtitle ? <Text style={font.body}>{subtitle}</Text> : null}
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; icon?: IconName };

export function Field({ label, icon, secureTextEntry, style, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.field}>
      <Text style={font.label}>{label}</Text>
      <View style={[styles.inputBox, focused && styles.inputFocused, input.multiline && styles.inputMulti]}>
        {icon ? <Ionicons name={icon} size={18} color={focused ? color.primary : color.muted} /> : null}
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
            hitSlop={10}
            onPress={() => setHidden(!hidden)}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={color.muted} />
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
  /** Outlined instead of filled. */
  secondary?: boolean;
  /** Text only, for low-priority links. */
  link?: boolean;
  danger?: boolean;
  icon?: IconName;
};

export function Button({ title, onPress, busy, disabled, secondary, link, danger, icon }: ButtonProps) {
  const filled = !secondary && !link;
  const tint = filled ? color.onPrimary : danger ? color.danger : color.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        filled && (danger ? styles.dangerFill : styles.primaryFill),
        secondary && [styles.outline, danger && styles.dangerOutline],
        link && styles.link,
        pressed && styles.pressed,
        (busy || disabled) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tint} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={20} color={tint} /> : null}
          <Text style={[styles.buttonText, { color: tint }, link && styles.linkText]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Message({ text, success }: { text: string | null; success?: boolean }) {
  if (!text) return null;
  return (
    <View style={[styles.message, success ? styles.messageOk : styles.messageError]} accessibilityLiveRegion="polite">
      <Ionicons
        name={success ? 'checkmark-circle' : 'alert-circle'}
        size={18}
        color={success ? color.success : color.danger}
      />
      <Text style={[styles.messageText, { color: success ? color.success : color.danger }]}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A small coloured label, such as a report's status. */
export function Chip({ label, icon, fg, bg, center }: { label: string; icon?: IconName; fg: string; bg: string; center?: boolean }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }, center && styles.chipCenter]}>
      {icon ? <Ionicons name={icon} size={13} color={fg} /> : null}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, tint = color.accent, track = color.border }: { value: number; tint?: string; track?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.track, { backgroundColor: track }]} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(pct), min: 0, max: 100 }}>
      <View style={[styles.bar, { width: `${pct}%`, backgroundColor: tint }]} />
    </View>
  );
}

/** A tappable row for settings-style lists. */
export function ListRow({ icon, title, onPress, danger, last }: { icon: IconName; title: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  const tint = danger ? color.danger : color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? color.dangerSoft : color.primarySoft }]}>
        <Ionicons name={icon} size={18} color={danger ? color.danger : color.primary} />
      </View>
      <Text style={[styles.rowTitle, { color: tint }]}>{title}</Text>
      {danger ? null : <Ionicons name="chevron-forward" size={18} color={color.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  scroll: { flexGrow: 1, paddingBottom: space.xxl },
  screen: { padding: space.xl, gap: space.md },
  formHeader: { gap: space.sm, marginBottom: space.sm },
  formIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  field: { gap: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: color.card,
    minHeight: 52,
  },
  inputFocused: { borderColor: color.primary },
  inputMulti: { alignItems: 'flex-start', paddingVertical: space.sm },
  input: { flex: 1, fontSize: 16, color: color.ink, paddingVertical: space.md },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  primaryFill: { backgroundColor: color.primary },
  dangerFill: { backgroundColor: color.danger },
  outline: { borderWidth: 1.5, borderColor: color.primary, backgroundColor: color.card },
  dangerOutline: { borderColor: color.danger },
  link: { minHeight: 40 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: 16, fontWeight: '700' },
  linkText: { fontSize: 15, fontWeight: '600' },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  messageOk: { backgroundColor: color.successSoft },
  messageError: { backgroundColor: color.dangerSoft },
  messageText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  rules: { gap: 6, padding: space.md, borderRadius: radius.md, backgroundColor: color.card },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rule: { fontSize: 13, color: color.muted },
  ruleOk: { color: color.success, fontWeight: '600' },
  card: { backgroundColor: color.card, borderRadius: radius.lg, padding: space.lg, ...shadow },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipCenter: { alignSelf: 'center' },
  chipText: { fontSize: 12, fontWeight: '700' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  rowPressed: { opacity: 0.6 },
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '500' },
});
