import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import type { RootStack } from './src/navigation';
import { startUploader } from './src/reports/uploader';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { ServerScreen } from './src/screens/ServerScreen';
import { MapGate } from './src/screens/MapGate';
import { MyReportsScreen } from './src/screens/MyReportsScreen';
import { NewReportScreen } from './src/screens/NewReportScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { VerifyCodeScreen } from './src/screens/VerifyCodeScreen';
import { color, family, fontFiles } from './src/theme';

const Stack = createNativeStackNavigator<RootStack>();

function Routes() {
  const { loading, user } = useAuth();

  // Queued reports upload in the background for whoever is logged in.
  useEffect(() => (user ? startUploader(user.id) : undefined), [user?.id]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={color.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={SCREEN}>
      {user ? (
        <>
          <Stack.Screen name="MyReports" component={MyReportsScreen} options={{ ...NO_HEADER, title: 'Home' }} />
          <Stack.Screen name="NewReport" component={NewReportScreen} options={{ title: 'New report' }} />
          <Stack.Screen name="Map" component={MapGate} options={{ title: 'Hazard map' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Your profile' }} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: '' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ ...NO_HEADER, title: 'Log in' }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: '' }} />
          <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} options={{ title: '' }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: '' }} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: '' }} />
        </>
      )}
      <Stack.Screen name="Server" component={ServerScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  // Plex is bundled with the app, so this resolves in a moment and never needs the network.
  const [fontsReady] = useFonts(fontFiles);
  if (!fontsReady) return <View style={styles.loading} />;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Routes />
        </NavigationContainer>
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const SCREEN = {
  headerStyle: { backgroundColor: color.page },
  headerShadowVisible: false,
  headerTintColor: color.text,
  headerTitleStyle: { fontFamily: family.semibold, fontSize: 17 },
  contentStyle: { backgroundColor: color.page },
  statusBarStyle: 'dark' as const,
};

// Screens that start with their own title block instead of a navigation header.
const NO_HEADER = { headerShown: false };

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.page },
});
