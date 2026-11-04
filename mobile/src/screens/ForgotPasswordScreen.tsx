import { useState } from 'react';
import { Text } from 'react-native';

import { api } from '../api/client';
import { Button, errorMessage, Field, Message, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function ForgotPasswordScreen({ navigation, route }: ScreenProps<'ForgotPassword'>) {
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email: email.trim() } });
      navigation.replace('ResetPassword', { email: email.trim() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text>Enter your account's email. We will send a 6-digit code to choose a new password.</Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Message text={error} />
      <Button title="Send code" onPress={submit} busy={busy} />
    </Screen>
  );
}
