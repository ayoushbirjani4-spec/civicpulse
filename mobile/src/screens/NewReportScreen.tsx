import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { Button, Card, errorMessage, Field, FormHeader, Icon, Message, Screen } from '../components/ui';
import { categoryIcon } from '../impact';
import type { ScreenProps } from '../navigation';
import { Category, loadCategories } from '../reports/categories';
import { enqueue } from '../reports/queue';
import { processQueue } from '../reports/uploader';
import { color, font, radius, space } from '../theme';

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
    const shot = await camera.current.takePictureAsync({ quality: 0.6, exif: false });
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
      navigation.popTo('MyReports', { thanks: true });
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
        <FormHeader
          icon="camera"
          title="Allow the camera"
          subtitle="CivicPulse needs the camera to photograph the hazard. Photos are taken in the app only."
        />
        <Button title="Allow camera" icon="camera-outline" onPress={requestCameraPermission} />
      </Screen>
    );
  }

  if (!photo) {
    return (
      <View style={styles.fill}>
        <CameraView ref={camera} style={styles.fill} facing="back" onCameraReady={() => setReady(true)} />
        <View style={styles.tip}>
          <Icon name="bulb" size={18} color={color.accent} />
          <Text style={styles.tipText}>Stand about 2 m away and include a kerb, wall or drain cover.</Text>
        </View>
        <View style={styles.shutterBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
            onPress={capture}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <Text style={styles.shutterText}>Tap to take the photo</Text>
        </View>
      </View>
    );
  }

  const locating = !fix && !locationError;
  return (
    <Screen>
      <View>
        <Image source={{ uri: photo.uri }} style={styles.preview} />
        <Pressable accessibilityRole="button" style={styles.retake} onPress={() => setPhoto(null)}>
          <Icon name="camera-reverse" size={16} color={color.onPrimary} />
          <Text style={styles.retakeText}>Retake</Text>
        </Pressable>
      </View>

      <Card style={styles.section}>
        <Text style={font.heading}>What is it?</Text>
        <View style={styles.chips}>
          {categories.map((c) => {
            const on = c.id === categoryId;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setCategoryId(c.id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Icon name={categoryIcon(c.name)} size={16} color={on ? color.onPrimary : color.primary} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={[styles.section, styles.locationRow]}>
        <View
          style={[
            styles.locationIcon,
            { backgroundColor: fix ? color.successSoft : locating ? color.infoSoft : color.dangerSoft },
          ]}
        >
          <Icon
            name={fix ? 'location' : locating ? 'navigate' : 'location-outline'}
            size={22}
            color={fix ? color.success : locating ? color.info : color.danger}
          />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.locationTitle}>
            {fix ? 'Location locked' : locating ? 'Finding your position...' : 'No location yet'}
          </Text>
          <Text style={font.small}>
            {fix
              ? `Accurate to about ${Math.round(fix.accuracy)} m${fix.mocked ? '. Mock location detected.' : ''}`
              : (locationError ?? 'Stay where the hazard is for a moment.')}
          </Text>
          {locationError ? <Button title="Try again" link icon="refresh" onPress={locate} /> : null}
        </View>
      </Card>

      <Field
        label="Note (optional)"
        icon="create-outline"
        placeholder="e.g. Deep pothole near the bus stop"
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
        multiline
      />
      <Message text={error} />
      <Button title="Send report" icon="send" onPress={send} busy={busy} disabled={!fix || !categoryId} />
      <View style={styles.hintRow}>
        <Icon name="cloud-offline-outline" size={16} color={color.muted} />
        <Text style={[font.small, styles.flex1]}>With no signal, the report waits on this phone and uploads later.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  flex1: { flex: 1 },
  tip: {
    position: 'absolute',
    top: space.lg,
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(15,27,45,0.72)',
    borderRadius: radius.md,
    padding: space.md,
  },
  tipText: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 19 },
  shutterBar: { position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center', gap: space.sm },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: color.accent },
  shutterText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: color.border },
  retake: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,27,45,0.7)',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  retakeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  section: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: color.primarySoft,
    backgroundColor: color.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  chipOn: { backgroundColor: color.primary, borderColor: color.primary },
  chipText: { color: color.primaryDark, fontWeight: '600', fontSize: 14 },
  chipTextOn: { color: color.onPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start' },
  locationIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  locationTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
