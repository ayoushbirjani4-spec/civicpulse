import { Platform, ViewStyle } from 'react-native';

/** Design tokens. Screens take colours and sizes from here, never as raw values. */
export const color = {
  primary: '#0A7C66',
  primaryDark: '#06594A',
  primarySoft: '#E2F3EE',
  accent: '#FFB020',
  accentSoft: '#FFF3D6',
  ink: '#0F1B2D',
  text: '#3A4757',
  muted: '#6B7785',
  border: '#E1E7EC',
  bg: '#F2F5F7',
  card: '#FFFFFF',
  danger: '#D64545',
  dangerSoft: '#FDECEC',
  info: '#2F6FED',
  infoSoft: '#E8F0FE',
  success: '#15803D',
  successSoft: '#E6F5EA',
  onPrimary: '#FFFFFF',
  onPrimaryMuted: 'rgba(255,255,255,0.78)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

export const font = {
  title: { fontSize: 26, fontWeight: '800' as const, color: color.ink, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700' as const, color: color.ink },
  body: { fontSize: 15, color: color.text, lineHeight: 21 },
  small: { fontSize: 13, color: color.muted, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600' as const, color: color.text },
};

export const shadow: ViewStyle = Platform.select({
  android: { elevation: 2 },
  default: { shadowColor: '#0F1B2D', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
}) as ViewStyle;
