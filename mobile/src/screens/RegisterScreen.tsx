import { useState } from 'react';

import { api } from '../api/client';
import { Button, errorMessage, Field, FormHeader, Message, newPasswordProblem, PasswordRules, Screen } from '../components/ui';
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
      <FormHeader
        icon="people"
        title="Join CivicPulse"
        subtitle="It takes a minute. Every hazard you report helps your city fix roads faster."
      />
      <Field
        label="Display name (shown on the leaderboard)"
        icon="person-outline"
        placeholder="e.g. Ayesha K."
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
      />
      <Field
        label="Email"
        icon="mail-outline"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        secureTextEntry
      />
      <Field
        label="Confirm password"
        icon="lock-closed-outline"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        secureTextEntry
      />
      <PasswordRules password={password} confirm={confirm} />
      <Message text={error} />
      <Button title="Create account" icon="sparkles" onPress={submit} busy={busy} />
    </Screen>
  );
}
