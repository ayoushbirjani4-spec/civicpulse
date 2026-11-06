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
        title="Create your account"
        subtitle="You need an account to send reports and follow their repair"
      />
      <Field
        label="Display name (shown on the leaderboard)"
        placeholder="e.g. Ayesha K."
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
      />
      <Field
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Password"
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
      <PasswordRules password={password} confirm={confirm} />
      <Message text={error} />
      <Button title="Create account" onPress={submit} busy={busy} />
      <Button title="Server address" link onPress={() => navigation.navigate('Server')} />
    </Screen>
  );
}
