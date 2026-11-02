import { Camera, GeoJSONSource, Layer, Map as MapLibreMap } from '@maplibre/maplibre-react-native';
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import { errorMessage } from '../components/ui';
import { Category, loadCategories } from '../reports/categories';

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
  thumbnail_url: string | null;
};

type PinCollection = {
  type: 'FeatureCollection';
  features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: PinProps }[];
};

const EMPTY: PinCollection = { type: 'FeatureCollection', features: [] };

const STATUS_LABEL: Record<PinStatus, string> = {
  open: 'Open',
  pending_repair: 'Repair pending',
  closed: 'Closed',
};
const ALL_STATUSES: PinStatus[] = ['open', 'pending_repair', 'closed'];
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

  // A changed filter fetches again for the same view.
  useEffect(() => {
    loadPins();
  }, [loadPins]);

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
    setSelected(feature.properties as PinProps);
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
              'circle-color': '#455a64',
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
              'circle-color': ['match', ['get', 'status'], 'pending_repair', '#ff9800', 'closed', '#9e9e9e', '#d32f2f'],
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
            <Chip key={s} label={STATUS_LABEL[s]} active={statuses.includes(s)} onPress={() => toggleStatus(s)} />
          ))}
        </ScrollView>
        {categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Chip label="All" active={categoryId === null} onPress={() => setCategoryId(null)} />
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
            ))}
          </ScrollView>
        )}
        {loading && <ActivityIndicator style={styles.loader} />}
      </View>

      <Text style={styles.attribution}>{'© OpenStreetMap contributors'}</Text>

      {error && (
        <Pressable accessibilityRole="button" style={styles.error} onPress={loadPins}>
          <Text style={styles.errorText}>{error} Tap to retry.</Text>
        </Pressable>
      )}

      {selected && (
        <View style={styles.sheet}>
          {selected.thumbnail_url ? <Image source={{ uri: selected.thumbnail_url }} style={styles.thumb} /> : null}
          <Text style={styles.title}>{selected.category_name}</Text>
          <Text>Status: {STATUS_LABEL[selected.status] ?? selected.status}</Text>
          <Text>Severity: {selected.severity != null ? `${selected.severity} / 5` : 'Not analysed yet'}</Text>
          <Text>Supporters: {selected.supporter_count}</Text>
          <View style={styles.sheetButtons}>
            {/* Starts a confirm mission once M10 exists. */}
            <Pressable accessibilityRole="button" disabled style={[styles.button, styles.buttonDisabled]}>
              <Text style={styles.buttonText}>Confirm (coming soon)</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => setSelected(null)}>
              <Text style={styles.buttonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const PRIMARY = '#0b6e4f';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { position: 'absolute', top: 10, left: 10, right: 10 },
  chipRow: { marginTop: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#b5bdc4',
    marginRight: 6,
    elevation: 2,
  },
  chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { color: '#333', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  loader: { marginTop: 6, alignSelf: 'center' },
  attribution: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    fontSize: 10,
    color: '#333',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 4,
  },
  error: { position: 'absolute', top: 100, left: 20, right: 20, backgroundColor: '#b3261e', padding: 10, borderRadius: 8 },
  errorText: { color: '#fff', textAlign: 'center' },
  sheet: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    elevation: 5,
    gap: 2,
  },
  thumb: { width: '100%', height: 140, borderRadius: 8, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  sheetButtons: { flexDirection: 'row', marginTop: 10, gap: 8 },
  button: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: PRIMARY },
  buttonDisabled: { backgroundColor: '#90a4ae' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
