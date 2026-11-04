import { useEffect, useState } from 'react';

import { getApiUrl, setApiUrl } from '../api/client';
import { Button, errorMessage, Field, FormHeader, Message, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';

export function ServerScreen({ navigation }: ScreenProps<'Server'>) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApiUrl().then(setUrl);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setApiUrl(url);
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
        title="Server address"
        subtitle="The laptop running the CivicPulse server, on the same Wi-Fi. On the laptop, run ipconfig and use its IPv4 address with port 8000."
      />
      <Field
        label="Server address"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.3:8000"
      />
      <Message text={error} />
      <Button title="Check and save" onPress={save} busy={busy} />
    </Screen>
  );
}
