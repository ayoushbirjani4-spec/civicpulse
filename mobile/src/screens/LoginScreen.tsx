import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Hero, HeroTitle, Logo } from '../components/Hero';
import { Button, Card, errorMessage, Field, Icon, Message, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { color, font, space } from '../theme';

const PROMISES = [
  { icon: 'camera' as const, text: 'Snap a road hazard in seconds' },
  { icon: 'map' as const, text: 'See it land on the city map' },
  { icon: 'checkmark-done' as const, text: 'Follow it until it is fixed' },
];

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

  const header = (
    <Hero tall>
      <View style={styles.brand}>
        <Logo />
        <Text style={styles.brandName}>CivicPulse</Text>
      </View>
      <HeroTitle title="Make your roads safer." subtitle="Spot it. Snap it. Get it fixed." />
      <View style={styles.promises}>
        {PROMISES.map((p) => (
          <View key={p.text} style={styles.promise}>
            <Icon name={p.icon} size={16} color={color.accent} />
            <Text style={styles.promiseText}>{p.text}</Text>
          </View>
        ))}
      </View>
    </Hero>
  );

  return (
    <Screen header={header}>
      <Card style={styles.card}>
        <Text style={font.heading}>Welcome back</Text>
        <Message text={route.params?.notice ?? null} success />
        <Field
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          icon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          secureTextEntry
        />
        <View style={styles.forgot}>
          <Button
            title="Forgot password?"
            link
            onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })}
          />
        </View>
        <Message text={error} />
        <Button title="Log in" icon="log-in-outline" onPress={submit} busy={busy} />
      </Card>
      <View style={styles.join}>
        <Text style={font.body}>New to CivicPulse?</Text>
        <Button title="Create a free account" secondary icon="person-add-outline" onPress={() => navigation.navigate('Register')} />
      </View>
      <Button title="Server address" link icon="server-outline" onPress={() => navigation.navigate('Server')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  brandName: { fontSize: 20, fontWeight: '800', color: color.onPrimary, letterSpacing: 0.2 },
  promises: { gap: space.sm },
  promise: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  promiseText: { color: color.onPrimary, fontSize: 14, fontWeight: '500' },
  card: { marginTop: -56, gap: space.md },
  forgot: { alignItems: 'flex-end', marginTop: -space.sm, marginBottom: -space.sm },
  join: { gap: space.sm, alignItems: 'stretch', marginTop: space.sm },
});
