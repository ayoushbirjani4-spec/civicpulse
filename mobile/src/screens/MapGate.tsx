import { isRunningInExpoGo } from 'expo';
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// MapLibre is native code that Expo Go does not include. Importing it at the top of App.tsx
// would crash the whole app in Expo Go, so the map module is loaded only when it can work.
let MapScreen: ComponentType | null = null;

export function MapGate() {
  if (isRunningInExpoGo()) {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>The map does not work in Expo Go</Text>
        <Text style={styles.text}>
          You opened CivicPulse inside Expo Go, which does not include the map library. Reporting and My Reports
          still work here. To see the map, close Expo Go and open the CivicPulse app itself from your phone's app
          list.
        </Text>
      </View>
    );
  }
  MapScreen ??= require('./MapScreen').MapScreen as ComponentType;
  return <MapScreen />;
}

const styles = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  text: { fontSize: 15, color: '#333', lineHeight: 21 },
});
