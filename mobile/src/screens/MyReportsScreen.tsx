import { File } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, errorMessage, Message } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { listQueued, onQueueChange, QueuedReport, remove } from '../reports/queue';
import { processQueue } from '../reports/uploader';

type ServerReport = {
  id: string;
  category_name: string;
  description: string | null;
  accuracy_m: number;
  is_mocked: boolean;
  captured_at: string;
  state: string;
};

type Row =
  | { kind: 'queued'; key: string; item: QueuedReport }
  | { kind: 'server'; key: string; item: ServerReport };

const STATE_LABEL: Record<string, string> = { received: 'Received', merged: 'Added to an existing hazard', rejected: 'Rejected' };

export function MyReportsScreen({ navigation }: ScreenProps<'MyReports'>) {
  const { user } = useAuth();
  const [queued, setQueued] = useState<QueuedReport[]>([]);
  const [server, setServer] = useState<ServerReport[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQueued = useCallback(async () => {
    if (user) setQueued(await listQueued(user.id));
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    setError(null);
    try {
      await processQueue(user.id);
      setServer((await api<{ items: ServerReport[] }>('/reports/mine')).items);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      await loadQueued();
      setRefreshing(false);
    }
  }, [user, loadQueued]);

  useEffect(() => {
    refresh();
    // A finished upload moves an item from the queue to the server list.
    return onQueueChange(() => {
      loadQueued();
      api<{ items: ServerReport[] }>('/reports/mine')
        .then((r) => setServer(r.items))
        .catch(() => {});
    });
  }, [refresh, loadQueued]);

  async function discard(item: QueuedReport) {
    await remove(item.client_uuid);
    try {
      new File(item.photo_uri).delete();
    } catch {
      // Already gone.
    }
  }

  const rows: Row[] = [
    ...queued.map((item) => ({ kind: 'queued' as const, key: item.client_uuid, item })),
    ...server.map((item) => ({ kind: 'server' as const, key: item.id, item })),
  ];

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <Button title="Report a hazard" onPress={() => navigation.navigate('NewReport')} />
        <Button title="Hazard map" secondary onPress={() => navigation.navigate('Map')} />
        <Message text={error} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No reports yet.</Text>}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            <Text style={styles.title}>{row.item.category_name}</Text>
            <Text style={styles.meta}>{new Date(row.item.captured_at).toLocaleString()}</Text>
            {row.kind === 'queued' ? (
              row.item.status === 'failed' ? (
                <>
                  <Text style={styles.failed}>Not accepted by the server ({row.item.last_error}).</Text>
                  <Button title="Discard" secondary onPress={() => discard(row.item)} />
                </>
              ) : (
                <Text style={styles.waiting}>
                  {row.item.attempts === 0 ? 'Uploading...' : 'Waiting for signal, will upload automatically.'}
                </Text>
              )
            ) : (
              <Text style={styles.done}>
                {STATE_LABEL[row.item.state] ?? row.item.state}
                {row.item.is_mocked ? ' · mock location flagged' : ''}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { paddingHorizontal: 20, paddingTop: 8 },
  empty: { textAlign: 'center', marginTop: 40, color: '#555' },
  row: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e6e9' },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#555', fontSize: 13, marginTop: 2 },
  waiting: { color: '#8a5a00', marginTop: 4 },
  failed: { color: '#b3261e', marginTop: 4 },
  done: { color: '#0b6e4f', marginTop: 4 },
});
