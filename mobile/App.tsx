import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import type { RootStack } from './src/navigation';
import { startUploader } from './src/reports/uploader';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { MapGate } from './src/screens/MapGate';
import { MyReportsScreen } from './src/screens/MyReportsScreen';
import { NewReportScreen } from './src/screens/NewReportScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { VerifyCodeScreen } from './src/screens/VerifyCodeScreen';

const Stack = createNativeStackNavigator<RootStack>();

function Routes() {
  const { loading, user } = useAuth();

  // Queued reports upload in the background for whoever is logged in.
  useEffect(() => (user ? startUploader(user.id) : undefined), [user?.id]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {user ? (
        <>
          <Stack.Screen
            name="MyReports"
            component={MyReportsScreen}
            options={({ navigation }) => ({
              title: 'My reports',
              headerRight: () => (
                <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Profile')}>
                  <Text style={styles.headerLink}>Profile</Text>
                </Pressable>
              ),
            })}
          />
          <Stack.Screen name="NewReport" component={NewReportScreen} options={{ title: 'New report' }} />
          <Stack.Screen name="Map" component={MapGate} options={{ title: 'Hazard map' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change password' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Log in' }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
          <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} options={{ title: 'Verify email' }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Forgot password' }} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'New password' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Routes />
      </NavigationContainer>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerLink: { color: '#0b6e4f', fontSize: 16, fontWeight: '600' },
});
