import { View, Text, StyleSheet, FlatList } from 'react-native';

const PIPELINES = [
  { id: 'j1', name: 'bk-core-nightly-ingest', inst: 'Bank of Kigali', status: 'Running', records: '128.4k' },
  { id: 'j3', name: 'inkomoko-mfi-quarterly', inst: 'Inkomoko MFI', status: 'Failed', records: '0' },
  { id: 'j4', name: 'mtn-momo-hourly-pull', inst: 'MTN Mobile Money', status: 'Completed', records: '45.2k' },
];

export default function MobilePipelines() {
  return (
    <View style={styles.container}>
      <FlatList
        data={PIPELINES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
            <Text style={styles.inst}>{item.inst}</Text>
            <Text style={styles.meta}>Records Processed: {item.records}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9', padding: 16 },
  card: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DCE3E8', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: '#172033', flex: 1 },
  inst: { fontSize: 13, color: '#526174', marginTop: 4 },
  meta: { fontSize: 12, color: '#168FA8', marginTop: 6, fontWeight: '600' },
  status: { fontSize: 12, fontWeight: '700', color: '#168FA8' },
});
