import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { TextStyle } from 'react-native';

// Direction (unslop): dependable, street-level, quietly proud. The world is the street and the
// city works crew, so surfaces stay neutral, teal marks the one action that matters, and the
// road-marking yellow appears only on the progress track.

export const fontFiles = {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
};

export const family = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
};

export const color = {
  page: '#FAFAFA',
  card: '#FFFFFF',
  raised: '#F4F4F5',
  hairline: 'rgba(23,23,23,0.08)',
  border: 'rgba(23,23,23,0.14)',
  text: '#171717',
  text2: '#525252',
  muted: '#737373',
  accent: '#0A7C66',
  accentSoft: '#E8F3EF',
  onAccent: '#FFFFFF',
  positive: '#15803D',
  negative: '#DC2626',
  negativeSoft: '#FEF2F2',
  positiveSoft: '#F0FDF4',
  // Repair work in progress: the amber of a works sign, darkened to read on white.
  progress: '#B45309',
  asphalt: '#2B2B2B',
  marking: '#F2C230',
  markingOff: '#5A5A5A',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 };

export const radius = { small: 6, control: 10, card: 12, panel: 16 };

export const type: Record<'title' | 'heading' | 'body' | 'small' | 'label' | 'figure' | 'meta', TextStyle> = {
  title: { fontFamily: family.medium, fontSize: 28, lineHeight: 34, color: color.text },
  heading: { fontFamily: family.medium, fontSize: 18, lineHeight: 24, color: color.text },
  body: { fontFamily: family.regular, fontSize: 15, lineHeight: 22, color: color.text2 },
  small: { fontFamily: family.regular, fontSize: 13, lineHeight: 20, color: color.muted },
  label: { fontFamily: family.medium, fontSize: 13, lineHeight: 18, color: color.text2 },
  figure: { fontFamily: family.monoMedium, fontSize: 28, lineHeight: 32, color: color.text, fontVariant: ['tabular-nums'] },
  meta: { fontFamily: family.mono, fontSize: 12, lineHeight: 16, color: color.muted, fontVariant: ['tabular-nums'] },
};

export const ICON = 18;
