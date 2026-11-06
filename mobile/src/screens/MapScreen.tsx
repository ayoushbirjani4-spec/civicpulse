import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, UserLocation } from '@maplibre/maplibre-react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '../api/client';
import { errorMessage, Icon, StatusDot, Text } from '../components/ui';
import { Category, loadCategories } from '../reports/categories';
import { color, family, ICON, radius, space, type } from '../theme';

// M4: hazards near the user. One pin per hazard; the badge counts distinct people.

const SUKKUR_CENTER: [number, number] = [68.86, 27.7]; // [lng, lat]

// OpenStreetMap raster tiles: free, no key, attribution must stay visible.
const OSM_STYLE = {
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

type PinStatus = 'open' | 'pending_repair' | 'closed';

type PinProps = {
  id: string;
  status: PinStatus;
  severity: number | null;
  supporter_count: number;
  category_id: string;
  category_name: string;
  follows_pin_id: string | null;
  thumbnail_url: string | null;
  photo_urls?: string[];
};

type PinCollection = {
  type: 'FeatureCollection';
  features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: PinProps }[];
  truncated?: boolean;
};

const EMPTY: PinCollection = { type: 'FeatureCollection', features: [] };

const STATUS_LABEL: Record<PinStatus, string> = {
  open: 'Open',
  pending_repair: 'Repair pending',
  closed: 'Closed',
};
const ALL_STATUSES: PinStatus[] = ['open', 'pending_repair', 'closed'];
// The same meanings as a report's status line: open is a live hazard, amber is repair work, green is fixed.
const STATUS_COLOR: Record<PinStatus, string> = { open: color.negative, pending_repair: color.progress, closed: color.positive };
// Closed pins are hidden until the user asks for them.
const DEFAULT_STATUSES: PinStatus[] = ['open', 'pending_repair'];

/** Map bounds as "minLng,minLat,maxLng,maxLat". MapLibre v11 gives [west, south, east, north];
 *  two corner points ([[lng, lat], [lng, lat]], either order) are accepted too. */
function toBbox(bounds: unknown): string | null {
  if (!Array.isArray(bounds)) return null;
  const flat: unknown[] = bounds.length === 2 ? bounds.flat() : bounds;
  if (flat.length !== 4 || !flat.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [a, b, c, d] = flat as number[];
  // Corner pairs are [lng, lat, lng, lat]; the flat form is already [west, south, east, north].
  const [w, s, e, n] = [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
  return [w, s, e, n].map((x) => x.toFixed(5)).join(',');
}

export function MapScreen() {
  const mapRef = useRef<ComponentRef<typeof MapLibreMap>>(null);
  const cameraRef = useRef<ComponentRef<typeof Camera>>(null);
  const sourceRef = useRef<ComponentRef<typeof GeoJSONSource>>(null);
  const bboxRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest request may update the map; older answers are dropped.
  const requestRef = useRef(0);

  const [pins, setPins] = useState<PinCollection>(EMPTY);
  const [selected, setSelected] = useState<PinProps | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<PinStatus[]>(DEFAULT_STATUSES);
  const [showMe, setShowMe] = useState(false);

  useEffect(() => {
    // Without categories the map still works; the category chips just stay hidden.
    loadCategories().then(setCategories, () => {});
  }, []);

  const loadPins = useCallback(async () => {
    const bbox = bboxRef.current;
    if (!bbox) return;
    const request = ++requestRef.current;
    if (statuses.length === 0) {
      setPins(EMPTY);
      // This replaces any request still in flight, so it must clear that request's spinner too.
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({ bbox, status: statuses.join(',') });
    if (categoryId) params.set('category', categoryId);

    setLoading(true);
    setError(null);
    try {
      const data = await api<PinCollection>(`/pins?${params.toString()}`);
      if (request === requestRef.current) setPins(data);
    } catch (e) {
      if (request === requestRef.current) setError(errorMessage(e));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [statuses, categoryId]);

  // Fetch again when a filter changes, and when the user comes back from reporting a hazard.
  useFocusEffect(
    useCallback(() => {
      loadPins();
    }, [loadPins]),
  );

  // Location is read only while this screen is open, as for reporting.
  const centreOnMe = useCallback(async (askIfNeeded: boolean) => {
    const current = await Location.getForegroundPermissionsAsync();
    const granted = current.granted || (askIfNeeded && (await Location.requestForegroundPermissionsAsync()).granted);
    setShowMe(granted);
    if (!granted) {
      if (askIfNeeded) setError('Allow location in Settings to centre the map on you.');
      return;
    }
    const here =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    cameraRef.current?.flyTo({ center: [here.coords.longitude, here.coords.latitude], zoom: 15, duration: 600 });
  }, []);

  useEffect(() => {
    // Start near the user when they have already allowed location; otherwise stay on Sukkur.
    centreOnMe(false).catch(() => {});
  }, [centreOnMe]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const onMapReady = useCallback(async () => {
    bboxRef.current = toBbox(await mapRef.current?.getBounds());
    loadPins();
  }, [loadPins]);

  // Panning fires many events; wait until the map settles before asking the server.
  const onRegionDidChange = useCallback(
    (event: { nativeEvent: { bounds: unknown } }) => {
      const bbox = toBbox(event.nativeEvent.bounds);
      if (bbox) bboxRef.current = bbox;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(loadPins, 400);
    },
    [loadPins],
  );

  const onPinPress = useCallback(async (event: any) => {
    // Keep the tap from reaching the map, whose own onPress closes the sheet.
    event.stopPropagation?.();
    const feature = event.nativeEvent?.features?.[0];
    if (!feature) return;
    if (feature.properties?.cluster) {
      const zoom = await sourceRef.current?.getClusterExpansionZoom(feature.properties.cluster_id);
      cameraRef.current?.setStop({ center: feature.geometry.coordinates, zoom: zoom ?? 15, duration: 500 });
      return;
    }
    const pin = feature.properties as PinProps;
    setSelected(pin);
    // The detail route adds the pin's recent photos; the sheet already shows what the list had.
    try {
      const detail = await api<{ properties: PinProps }>(`/pins/${pin.id}`);
      setSelected((current) => (current?.id === pin.id ? detail.properties : current));
    } catch {
      // Keep the summary from the list.
    }
  }, []);

  const toggleStatus = (status: PinStatus) =>
    setStatuses((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));

  return (
    <View style={styles.flex}>
      <MapLibreMap
        ref={mapRef}
        style={styles.flex}
        mapStyle={OSM_STYLE}
        onDidFinishLoadingMap={onMapReady}
        onRegionDidChange={onRegionDidChange}
        onPress={() => setSelected(null)}
      >
        <Camera ref={cameraRef} initialViewState={{ center: SUKKUR_CENTER, zoom: 13 }} />
        {showMe ? <UserLocation accuracy /> : null}

        <GeoJSONSource
          id="pins"
          ref={sourceRef}
          data={pins}
          cluster
          clusterRadius={40}
          clusterMaxZoom={15}
          onPress={onPinPress}
        >
          <Layer
            id="cluster-circle"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': color.text,
              'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#fff',
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': ['Open Sans Semibold'],
              'text-size': 12,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#fff' }}
          />
          <Layer
            id="pin-circle"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': [
                'match',
                ['get', 'status'],
                'pending_repair',
                STATUS_COLOR.pending_repair,
                'closed',
                STATUS_COLOR.closed,
                STATUS_COLOR.open,
              ],
              'circle-radius': 14,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#fff',
            }}
          />
          {/* The badge: how many different people reported this hazard. */}
          <Layer
            id="pin-supporters"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'text-field': ['to-string', ['get', 'supporter_count']],
              'text-font': ['Open Sans Semibold'],
              'text-size': 12,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#fff' }}
          />
        </GeoJSONSource>
      </MapLibreMap>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {ALL_STATUSES.map((s) => (
            <Chip
              key={s}
              label={STATUS_LABEL[s]}
              dot={STATUS_COLOR[s]}
              active={statuses.includes(s)}
              onPress={() => toggleStatus(s)}
            />
          ))}
        </ScrollView>
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Chip label="All" active={categoryId === null} onPress={() => setCategoryId(null)} />
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
        )}
        {loading && <ActivityIndicator style={styles.loader} color={color.accent} />}
        {pins.truncated ? <Text style={styles.notice}>Showing the newest 500 hazards here. Zoom in to see the rest.</Text> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Centre the map on my location"
        style={styles.meButton}
        onPress={() => centreOnMe(true).catch(() => setError('Could not find your position.'))}
      >
        <Icon name="locate-outline" size={ICON} color={color.text2} />
        <Text style={styles.meText}>Near me</Text>
      </Pressable>

      <Text style={styles.attribution}>{'© OpenStreetMap contributors'}</Text>

      {error && (
        <Pressable accessibilityRole="button" style={styles.error} onPress={loadPins}>
          <Text style={styles.errorText}>{error} Tap to retry</Text>
        </Pressable>
      )}

      {selected && (
        <View style={styles.sheet}>
          {selected.photo_urls && selected.photo_urls.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
              {selected.photo_urls.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photo} />
              ))}
            </ScrollView>
          ) : selected.thumbnail_url ? (
            <Image source={{ uri: selected.thumbnail_url }} style={styles.thumb} />
          ) : null}
          <View style={styles.sheetHead}>
            <Text style={styles.title}>{selected.category_name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={() => setSelected(null)}>
              <Icon name="close" size={ICON} color={color.muted} />
            </Pressable>
          </View>
          <View style={styles.facts}>
            <StatusDot
              label={STATUS_LABEL[selected.status] ?? selected.status}
              tint={STATUS_COLOR[selected.status] ?? color.muted}
            />
            <Text style={type.meta}>
              {selected.supporter_count} reported · {selected.severity != null ? `severity ${selected.severity}/5` : 'not rated yet'}
            </Text>
          </View>
          {selected.follows_pin_id ? (
            <Text style={styles.follows}>Reported again where a hazard was marked repaired</Text>
          ) : null}
          {/* Starts a confirm mission once M10 exists. */}
          <Pressable accessibilityRole="button" disabled style={styles.button}>
            <Text style={styles.buttonText}>Confirm this hazard, coming with missions</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

type ChipProps = { label: string; active: boolean; onPress: () => void; dot?: string };

function Chip({ label, active, onPress, dot }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const FLOAT = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { position: 'absolute', top: space.md, left: space.md, right: space.md },
  chipRow: { marginTop: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.hairline,
    marginRight: space.sm,
    ...FLOAT,
  },
  chipActive: { backgroundColor: color.text, borderColor: color.text },
  chipText: { fontFamily: family.medium, fontSize: 13, color: color.text },
  chipTextActive: { color: color.card },
  dot: { width: 8, height: 8, borderRadius: 4 },
  loader: { marginTop: space.sm, alignSelf: 'center' },
  attribution: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    fontSize: 10,
    color: color.text2,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 4,
  },
  error: {
    position: 'absolute',
    top: 112,
    left: space.xl,
    right: space.xl,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.md,
    borderRadius: radius.control,
    ...FLOAT,
  },
  errorText: { color: color.negative, textAlign: 'center', fontFamily: family.medium, fontSize: 14 },
  sheet: {
    position: 'absolute',
    bottom: space.xxl,
    left: space.lg,
    right: space.lg,
    backgroundColor: color.card,
    padding: space.md,
    borderRadius: 20,
    gap: space.md,
    ...FLOAT,
  },
  thumb: { width: '100%', height: 152, borderRadius: radius.small + 2 },
  photoRow: { marginBottom: 0 },
  photo: { width: 160, height: 120, borderRadius: radius.small + 2, marginRight: space.sm },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  title: { flex: 1, fontFamily: family.semibold, fontSize: 17, color: color.text },
  facts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs },
  follows: { ...type.small, color: color.progress, paddingHorizontal: space.xs },
  notice: {
    marginTop: space.sm,
    alignSelf: 'center',
    backgroundColor: color.card,
    color: color.text2,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.small,
    fontSize: 12,
    overflow: 'hidden',
  },
  meButton: {
    position: 'absolute',
    right: space.md,
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 40,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    ...FLOAT,
  },
  meText: { color: color.text, fontFamily: family.medium, fontSize: 14 },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: color.raised,
  },
  buttonText: { color: color.muted, fontFamily: family.medium, fontSize: 14 },
});
