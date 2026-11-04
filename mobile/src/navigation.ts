import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStack = {
  Login: { email?: string; notice?: string } | undefined;
  Register: undefined;
  VerifyCode: { email: string };
  ForgotPassword: { email?: string } | undefined;
  ResetPassword: { email: string };
  MyReports: undefined;
  NewReport: undefined;
  Profile: undefined;
  ChangePassword: undefined;
  Map: undefined;
};

export type ScreenProps<Name extends keyof RootStack> = NativeStackScreenProps<RootStack, Name>;
