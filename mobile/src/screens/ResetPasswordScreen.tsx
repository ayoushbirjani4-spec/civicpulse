import { useState } from 'react';

import { api } from '../api/client';
import { Button, errorMessage, Field, Message, newPasswordProblem, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function ResetPasswordScreen({ navigation, route }: ScreenProps<'ResetPassword'>) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server answers the same for unknown emails, so this cannot say "we sent it".
  const [notice, setNotice] = useState<string | null>(`If ${email} has an account, a code is on its way.`);

  async function submit() {
    const problem = newPasswordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        auth: false,
        body: { email, code, new_password: password },
      });
      navigation.popTo('Login', { email, notice: 'Password changed. Log in with your new password.' });
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
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email } });
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
        label="Code from the email"
        value={code}
        onChangeText={setCode}
        autoComplete="one-time-code"
        keyboardType="number-pad"
        maxLength={6}
      />
      <Field
        label="New password (at least 8 characters)"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        secureTextEntry
      />
      <Field
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        secureTextEntry
      />
      <Message text={error} />
      <Button title="Set new password" onPress={submit} busy={busy} />
      <Button title="Send a new code" onPress={resend} busy={resending} secondary />
    </Screen>
  );
}
