import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStack = {
  Login: { email?: string; notice?: string } | undefined;
  Register: undefined;
  VerifyCode: { email: string };
  MyReports: undefined;
  NewReport: undefined;
  Profile: undefined;
};

export type ScreenProps<Name extends keyof RootStack> = NativeStackScreenProps<RootStack, Name>;
