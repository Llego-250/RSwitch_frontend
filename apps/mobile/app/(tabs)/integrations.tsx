import { View, Text, StyleSheet, FlatList } from 'react-native';

const SOURCES = [
  { id: 'int-001', name: 'Core Banking Data Exchange', inst: 'Bank of Kigali', mode: 'Automated API', status: 'Healthy' },
  { id: 'int-002', name: 'Mobile Money Switch Feed', inst: 'MTN Mobile Money', mode: 'Automated API', status: 'Healthy' },
  { id: 'int-004', name: 'Quarterly Prudential Return', inst: 'Inkomoko MFI', mode: 'Manual Upload', status: 'Failed' },
  { id: 'int-005', name: 'Teacher Savings Data Pull', inst: 'Umwalimu SACCO', mode: 'Automated API', status: 'Healthy' },
];

export default function MobileIntegrations() {
  return (
    <View style={styles.container}>
      <FlatList
        data={SOURCES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <View style={[styles.badge, item.status === 'Failed' ? styles.badgeFail : styles.badgeOk]}>
                <Text style={[styles.badgeText, item.status === 'Failed' ? styles.badgeTextFail : styles.badgeTextOk]}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.inst}>{item.inst}</Text>
            <Text style={styles.meta}>ID: {item.id} · Mode: {item.mode}</Text>
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
  name: { fontSize: 15, fontWeight: '700', color: '#172033', flex: 1 },
  inst: { fontSize: 13, color: '#526174', marginTop: 4 },
  meta: { fontSize: 11, fontFamily: 'System', color: '#7B8798', marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeOk: { backgroundColor: '#E8F7F1' },
  badgeFail: { backgroundColor: '#FDECEF' },
  badgeTextOk: { color: '#16A979', fontSize: 11, fontWeight: '600' },
  badgeTextFail: { color: '#DC3154', fontSize: 11, fontWeight: '600' },
});
