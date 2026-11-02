import { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
} from 'react-native';

import { ApiError, NetworkError } from '../api/client';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_already_registered: 'This email already has an account. Log in instead.',
  invalid_code: 'That code is not correct.',
  code_expired: 'That code has expired. Send a new one.',
  code_locked: 'Too many wrong tries. Send a new code.',
  account_disabled: 'This account has been disabled.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  invalid_input: 'Please check what you entered. Passwords need at least 8 characters.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) return 'Could not reach the server. Check your connection.';
  if (error instanceof ApiError) return MESSAGES[error.code] ?? 'Something went wrong. Try again.';
  return 'Something went wrong. Try again.';
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} accessibilityLabel={label} {...input} />
    </>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
};

export function Button({ title, onPress, busy, secondary }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondary, busy && styles.busy]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? PRIMARY : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Message({ text, success }: { text: string | null; success?: boolean }) {
  if (!text) return null;
  return <Text style={[styles.message, success && styles.success]}>{text}</Text>;
}

const PRIMARY = '#0b6e4f';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: 20, gap: 8 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#b5bdc4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    alignItems: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 8,
    marginTop: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: PRIMARY },
  busy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryText: { color: PRIMARY },
  message: { color: '#b3261e', fontSize: 14, marginTop: 8 },
  success: { color: PRIMARY },
});
