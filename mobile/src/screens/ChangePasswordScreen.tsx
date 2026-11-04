import { useState } from 'react';
import { Alert } from 'react-native';

import { api } from '../api/client';
import { Button, errorMessage, Field, FormHeader, Message, newPasswordProblem, PasswordRules, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function ChangePasswordScreen({ navigation }: ScreenProps<'ChangePassword'>) {
  const [current, setCurrent] = useState('');
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
      await api('/me/password', {
        method: 'POST',
        body: { current_password: current, new_password: password },
      });
      Alert.alert('Password changed', 'Use your new password next time you log in on another phone.');
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <FormHeader
        icon="shield-checkmark"
        title="Change password"
        subtitle="Other phones logged in to this account will be logged out. This phone stays logged in."
      />
      <Field
        label="Current password"
        icon="lock-closed-outline"
        value={current}
        onChangeText={setCurrent}
        autoComplete="current-password"
        secureTextEntry
      />
      <Field
        label="New password"
        icon="key-outline"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        secureTextEntry
      />
      <Field
        label="Confirm new password"
        icon="key-outline"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        secureTextEntry
      />
      <PasswordRules password={password} confirm={confirm} />
      <Message text={error} />
      <Button title="Change password" icon="checkmark-circle" onPress={submit} busy={busy} />
    </Screen>
  );
}
