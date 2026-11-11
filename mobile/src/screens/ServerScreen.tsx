import { useEffect, useState } from 'react';

import { findServer, getApiUrl, NetworkError, setApiUrl } from '../api/client';
import { Button, errorMessage, Field, FormHeader, Message, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function ServerScreen({ navigation }: ScreenProps<'Server'>) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  useEffect(() => {
    getApiUrl().then(setUrl);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      await setApiUrl(url);
      navigation.goBack();
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? `No CivicPulse server answered at ${url.trim()}. Check the address and that the laptop is on the same Wi-Fi.`
          : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }

  async function find() {
    setSearching(true);
    setError(null);
    setFound(null);
    try {
      const address = await findServer(url);
      if (address) {
        setUrl(address);
        setFound(`Found and saved the server at ${address}`);
      } else {
        setError('No CivicPulse server found on this Wi-Fi network. Check that the laptop is on and the server is running.');
      }
    } finally {
      setSearching(false);
    }
  }

  return (
    <Screen>
      <FormHeader
        title="Server address"
        subtitle="The laptop running the CivicPulse server, on the same Wi-Fi. The app looks for it by itself when the address changes; you can also search now or type the address."
      />
      <Field
        label="Server address"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.7:8000"
      />
      <Message text={error} />
      <Message text={found} success />
      <Button title="Find automatically" onPress={find} busy={searching} disabled={busy} />
      <Button title="Check and save" secondary onPress={save} busy={busy} disabled={searching} />
    </Screen>
  );
}
