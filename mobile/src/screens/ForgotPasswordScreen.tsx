import { useState } from 'react';

import { api } from '../api/client';
import { Button, errorMessage, Field, FormHeader, Message, Screen } from '../components/ui';
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
      <FormHeader
        icon="key"
        title="Forgot your password?"
        subtitle="Enter your account's email. We will send a 6-digit code so you can choose a new one."
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
      <Message text={error} />
      <Button title="Send code" icon="send" onPress={submit} busy={busy} />
    </Screen>
  );
}
