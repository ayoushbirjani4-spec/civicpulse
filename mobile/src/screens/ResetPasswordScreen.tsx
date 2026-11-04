import { useState } from 'react';

import { api } from '../api/client';
import {
  Button,
  CODE_STYLE,
  errorMessage,
  Field,
  FormHeader,
  Message,
  newPasswordProblem,
  PasswordRules,
  Screen,
} from '../components/ui';
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
  const [notice, setNotice] = useState<string | null>(null);

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
      <FormHeader
        icon="lock-open"
        title="Choose a new password"
        subtitle={`If ${email} has an account, a 6-digit code is on its way.`}
      />
      <Message text={notice} success />
      <Field
        label="Code from the email"
        style={CODE_STYLE}
        placeholder="000000"
        value={code}
        onChangeText={setCode}
        autoComplete="one-time-code"
        keyboardType="number-pad"
        maxLength={6}
      />
      <Field
        label="New password"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        secureTextEntry
      />
      <Field
        label="Confirm new password"
        icon="lock-closed-outline"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        secureTextEntry
      />
      <PasswordRules password={password} confirm={confirm} />
      <Message text={error} />
      <Button title="Set new password" icon="checkmark-circle" onPress={submit} busy={busy} />
      <Button title="Send a new code" icon="refresh" onPress={resend} busy={resending} link />
    </Screen>
  );
}
