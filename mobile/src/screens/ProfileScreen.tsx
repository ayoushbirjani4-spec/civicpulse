import { useState } from 'react';
import { Text } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { Button, errorMessage, Field, Message, Screen } from '../components/ui';

export function ProfileScreen() {
  const { user, logout, updateDisplayName } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await updateDisplayName(displayName);
      setSaved('Saved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text>{user?.email}</Text>
      <Text>Role: {user?.role}</Text>
      <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} />
      <Message text={error} />
      <Message text={saved} success />
      <Button title="Save" onPress={save} busy={busy} />
      <Button title="Log out" onPress={logout} secondary />
    </Screen>
  );
}
