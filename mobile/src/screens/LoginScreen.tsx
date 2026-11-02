import { useState } from 'react';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, errorMessage, Field, Message, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function LoginScreen({ navigation, route }: ScreenProps<'Login'>) {
  const { login } = useAuth();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'email_not_verified') {
        navigation.navigate('VerifyCode', { email: email.trim() });
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Message text={route.params?.notice ?? null} success />
      <Field
        label="Email"
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
        autoComplete="current-password"
        secureTextEntry
      />
      <Message text={error} />
      <Button title="Log in" onPress={submit} busy={busy} />
      <Button title="Create an account" onPress={() => navigation.navigate('Register')} secondary />
    </Screen>
  );
}
