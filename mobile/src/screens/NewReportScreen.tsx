import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { Button, errorMessage, Field, Message, Screen } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { Category, loadCategories } from '../reports/categories';
import { enqueue } from '../reports/queue';
import { processQueue } from '../reports/uploader';

type Fix = { lat: number; lng: number; accuracy: number; mocked: boolean };

const LOCATION_TIMEOUT_MS = 20_000;

async function currentFix(): Promise<Fix> {
  const precise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS));
  // getCurrentPositionAsync has no timeout of its own; fall back to a recent fix.
  const loc = (await Promise.race([precise, timeout])) ?? (await Location.getLastKnownPositionAsync({ maxAge: 60_000 }));
  if (!loc) throw new Error('no_location');
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 100,
    mocked: loc.mocked ?? false,
  };
}

export function NewReportScreen({ navigation }: ScreenProps<'NewReport'>) {
  const { user } = useAuth();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; takenAt: string } | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategories()
      .then(setCategories)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function locate() {
    setLocationError(null);
    // Foreground permission only: the app reads location while it is open, never in the background.
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationError('Location permission is needed so the reviewer knows where the hazard is. Allow it in Settings.');
      return;
    }
    try {
      setFix(await currentFix());
    } catch {
      setLocationError('Could not get your position. Move to open sky and try again.');
    }
  }

  async function capture() {
    if (!camera.current || !ready) return;
    const shot = await camera.current.takePictureAsync({ quality: 0.8, exif: false });
    if (!shot) return;
    setPhoto({ uri: shot.uri, takenAt: new Date().toISOString() });
    locate();
  }

  async function send() {
    if (!photo || !fix || !categoryId || !user) return;
    setBusy(true);
    setError(null);
    try {
      const clientUuid = Crypto.randomUUID();
      // The camera writes to the cache, which the system may clear; keep a copy until upload.
      const dir = new Directory(Paths.document, 'queue');
      dir.create({ idempotent: true, intermediates: true });
      const kept = new File(dir, `${clientUuid}.jpg`);
      await new File(photo.uri).copy(kept);
      await enqueue({
        client_uuid: clientUuid,
        user_id: user.id,
        category_id: categoryId,
        category_name: categories.find((c) => c.id === categoryId)?.name ?? 'Hazard',
        description: description.trim() || null,
        lat: fix.lat,
        lng: fix.lng,
        accuracy_m: Math.max(fix.accuracy, 1),
        is_mocked: fix.mocked ? 1 : 0,
        captured_at: photo.takenAt,
        photo_uri: kept.uri,
      });
      processQueue(user.id).catch(() => {});
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!cameraPermission) return <View style={styles.fill} />;
  if (!cameraPermission.granted) {
    return (
      <Screen>
        <Text style={styles.text}>CivicPulse needs the camera to photograph the hazard. Photos are taken in the app only.</Text>
        <Button title="Allow camera" onPress={requestCameraPermission} />
      </Screen>
    );
  }

  if (!photo) {
    return (
      <View style={styles.fill}>
        <CameraView ref={camera} style={styles.fill} facing="back" onCameraReady={() => setReady(true)} />
        <Text style={styles.tip}>Stand about 2 m away and include a kerb, wall or drain cover.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Take photo" style={styles.shutter} onPress={capture} />
      </View>
    );
  }

  return (
    <Screen>
      <Image source={{ uri: photo.uri }} style={styles.preview} />
      <Button title="Retake" secondary onPress={() => setPhoto(null)} />
      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected: c.id === categoryId }}
            onPress={() => setCategoryId(c.id)}
            style={[styles.chip, c.id === categoryId && styles.chipOn]}
          >
            <Text style={c.id === categoryId ? styles.chipTextOn : undefined}>{c.name}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Note (optional)" value={description} onChangeText={setDescription} maxLength={1000} multiline />
      <Message
        text={fix ? `Position recorded, accurate to about ${Math.round(fix.accuracy)} m${fix.mocked ? ' (mock location detected)' : ''}.` : locationError ?? 'Getting your position...'}
        success={!!fix}
      />
      {locationError ? <Button title="Try location again" secondary onPress={locate} /> : null}
      <Message text={error} />
      <Button title="Send" onPress={send} busy={busy} disabled={!fix || !categoryId} />
      <Text style={styles.hint}>With no signal, the report waits on this phone and uploads later.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  text: { fontSize: 16 },
  tip: { position: 'absolute', top: 16, left: 16, right: 16, color: '#fff', textAlign: 'center', fontSize: 15 },
  shutter: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 6,
    borderColor: '#fff',
    backgroundColor: '#ffffff55',
  },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: '#ddd' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#0b6e4f', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: '#0b6e4f' },
  chipTextOn: { color: '#fff' },
  hint: { color: '#555', fontSize: 13, marginTop: 8 },
});
