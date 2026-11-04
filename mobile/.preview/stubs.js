// Web preview only: stand-ins for phone-only modules (SQLite, files, camera, location, MapLibre).
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Pressable, Text, View } from 'react-native';

// expo-sqlite
export async function openDatabaseAsync() {
  return {
    execAsync: async () => {},
    runAsync: async () => ({ changes: 0 }),
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
  };
}

// expo-file-system
const join = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
export class File {
  constructor(...parts) {
    this.uri = join(parts);
  }
  get name() {
    return this.uri.split('/').pop();
  }
  copy() {}
  delete() {}
}
export class Directory {
  constructor(...parts) {
    this.uri = join(parts);
  }
  create() {}
}
export const Paths = { document: { uri: 'file:///doc' }, cache: { uri: 'file:///cache' } };

// expo-camera
export function useCameraPermissions() {
  return [{ granted: true }, async () => ({ granted: true })];
}
export const CameraView = forwardRef(function CameraView({ style, onCameraReady }, ref) {
  useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: 'https://picsum.photos/seed/pothole9/800/600' }) }));
  useEffect(() => onCameraReady?.(), []);
  return <View style={[style, { backgroundColor: '#2b3440' }]} />;
});

// expo-location
export const Accuracy = { High: 4 };
const here = { coords: { latitude: 27.705, longitude: 68.857, accuracy: 6 }, mocked: false };
export const getForegroundPermissionsAsync = async () => ({ status: 'granted' });
export const requestForegroundPermissionsAsync = async () => ({ status: 'granted' });
export const getCurrentPositionAsync = () => new Promise((r) => setTimeout(() => r(here), 900));
export const getLastKnownPositionAsync = async () => here;

// @maplibre/maplibre-react-native: a flat "map" with the pins drawn as tappable dots.
const BOUNDS = [68.83, 27.69, 68.89, 27.72];
export const Map = forwardRef(function Map({ style, children, onDidFinishLoadingMap, onPress }, ref) {
  useImperativeHandle(ref, () => ({ getBounds: async () => [[BOUNDS[2], BOUNDS[3]], [BOUNDS[0], BOUNDS[1]]] }));
  useEffect(() => {
    setTimeout(() => onDidFinishLoadingMap?.(), 50);
  }, []);
  return (
    <Pressable style={[style, { backgroundColor: '#e8eee9' }]} onPress={onPress}>
      {[20, 45, 70].map((t) => (
        <View key={t} style={{ position: 'absolute', top: `${t}%`, left: 0, right: 0, height: 10, backgroundColor: '#fff' }} />
      ))}
      {[30, 65].map((l) => (
        <View key={l} style={{ position: 'absolute', left: `${l}%`, top: 0, bottom: 0, width: 12, backgroundColor: '#fff' }} />
      ))}
      {children}
    </Pressable>
  );
});
export const Camera = forwardRef(function Camera(_, ref) {
  useImperativeHandle(ref, () => ({ flyTo() {}, setStop() {} }));
  return null;
});
export const UserLocation = () => null;
export const Layer = () => null;
const COLORS = { open: '#E5484D', pending_repair: '#2F6FED', closed: '#15803D' };
export const GeoJSONSource = forwardRef(function GeoJSONSource({ data, onPress }, ref) {
  useImperativeHandle(ref, () => ({ getClusterExpansionZoom: async () => 15 }));
  return (data?.features ?? []).map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const left = ((lng - BOUNDS[0]) / (BOUNDS[2] - BOUNDS[0])) * 100;
    const top = (1 - (lat - BOUNDS[1]) / (BOUNDS[3] - BOUNDS[1])) * 100;
    return (
      <Pressable
        key={f.properties.id}
        onPress={(e) => onPress?.({ stopPropagation: () => e.stopPropagation?.(), nativeEvent: { features: [f] } })}
        style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS[f.properties.status], borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{f.properties.supporter_count}</Text>
      </Pressable>
    );
  });
});
