import { useState } from 'react';

import { api } from '../api/client';
import { Button, errorMessage, Field, Message, newPasswordProblem, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function RegisterScreen({ navigation }: ScreenProps<'Register'>) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const problem = newPasswordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/register', {
        method: 'POST',
        auth: false,
        body: { email: email.trim(), password, display_name: displayName },
      });
      navigation.replace('VerifyCode', { email: email.trim() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Field
        label="Display name (shown on the leaderboard)"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Password (at least 8 characters)"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        secureTextEntry
      />
      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        secureTextEntry
      />
      <Message text={error} />
      <Button title="Create account" onPress={submit} busy={busy} />
    </Screen>
  );
}
