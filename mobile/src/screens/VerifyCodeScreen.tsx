import { useState } from 'react';

import { api } from '../api/client';
import { Button, errorMessage, Field, Message, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function VerifyCodeScreen({ navigation, route }: ScreenProps<'VerifyCode'>) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(`We emailed a 6-digit code to ${email}.`);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/verify-email', { method: 'POST', auth: false, body: { email, code } });
      navigation.popTo('Login', { email, notice: 'Email verified. You can log in now.' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    setError(null);
    try {
      await api('/auth/resend-code', { method: 'POST', auth: false, body: { email } });
      setCode('');
      setNotice(`We sent a new code to ${email}. Only the newest code works.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      <Message text={notice} success />
      <Field
        label="Verification code"
        value={code}
        onChangeText={setCode}
        autoComplete="one-time-code"
        keyboardType="number-pad"
        maxLength={6}
      />
      <Message text={error} />
      <Button title="Verify" onPress={submit} busy={busy} />
      <Button title="Send a new code" onPress={resend} busy={resending} secondary />
    </Screen>
  );
}
