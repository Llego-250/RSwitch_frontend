import { View, Text, StyleSheet, FlatList } from 'react-native';

const ALERTS = [
  { id: '1', inst: 'Inkomoko MFI', title: 'Quarterly prudential return submission validation failed', sev: 'FAILED' },
  { id: '2', inst: 'MTN Mobile Money', title: 'Transaction volume error rate spike (+4.2%)', sev: 'WARNING' },
];

export default function MobileAlerts() {
  return (
    <View style={styles.container}>
      <FlatList
        data={ALERTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.badge}>{item.sev}</Text>
              <Text style={styles.inst}>{item.inst}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9', padding: 16 },
  card: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DCE3E8', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge: { fontSize: 11, fontWeight: '700', color: '#DC3154', backgroundColor: '#FDECEF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  inst: { fontSize: 12, fontWeight: '600', color: '#172033' },
  title: { fontSize: 13, color: '#526174', leading: 18 },
});
