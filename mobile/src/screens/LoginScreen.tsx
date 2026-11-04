import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, errorMessage, Field, Icon, Message, RoadTrack, Screen, StatusDot, Text, Wordmark } from '../components/ui';
import { STAGES } from '../impact';
import type { ScreenProps } from '../navigation';
import { color, family, ICON, radius, space, type } from '../theme';

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
    <Screen top>
      <Wordmark />
      <View style={styles.intro}>
        <Text style={type.title}>Photograph a road hazard and follow it until it is fixed</Text>
        <Text style={type.body}>Your report goes on the city repair map with its photo and place</Text>
      </View>

      {/* What a report looks like once it is in: the product's own job ticket, not a feature list. */}
      <Card style={styles.sample} >
        <View style={styles.sampleRow} accessible accessibilityLabel="Example report: pothole near the bus stop, in repair">
          <View style={styles.sampleIcon}>
            <Icon name="warning-outline" size={ICON} color={color.muted} />
          </View>
          <View style={styles.sampleText}>
            <Text style={styles.sampleTitle}>Pothole near the bus stop</Text>
            <Text style={type.meta}>Example · reported 2 d ago</Text>
          </View>
          <StatusDot label="In repair" tint={color.progress} />
        </View>
        <RoadTrack value={2 / 3} stops={STAGES} reached={1} />
      </Card>

      <View style={styles.form}>
        <Message text={route.params?.notice ?? null} success />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
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
        <Button title="Create an account" secondary onPress={() => navigation.navigate('Register')} />
        <View style={styles.links}>
          <Button title="Forgot password?" link onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })} />
          <Button title="Server address" link onPress={() => navigation.navigate('Server')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm, marginTop: space.lg },
  sample: { gap: space.md, padding: space.md },
  sampleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sampleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.small,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleText: { flex: 1, gap: 2 },
  sampleTitle: { fontFamily: family.semibold, fontSize: 15, color: color.text },
  form: { gap: space.md, marginTop: space.sm },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
});
