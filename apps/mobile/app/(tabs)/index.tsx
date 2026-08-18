import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function MobileDashboard() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Operations Overview</Text>
        <Text style={styles.headerSubtitle}>Real-time participant data ingestion</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Active pipelines</Text>
          <Text style={styles.kpiValue}>6 / 7</Text>
          <Text style={styles.kpiSubtext}>● 1 failed today</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Failed integrations</Text>
          <Text style={[styles.kpiValue, { color: '#DC3154' }]}>1</Text>
          <Text style={styles.kpiSubtext}>Inkomoko MFI</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>System uptime (30d)</Text>
          <Text style={styles.kpiValue}>99.82%</Text>
          <Text style={styles.kpiSubtext}>+0.02pp vs prior month</Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Pending mappings</Text>
          <Text style={styles.kpiValue}>2</Text>
          <Text style={styles.kpiSubtext}>Draft v1.0 schema</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9', padding: 16 },
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderColor: '#DCE3E8',
    borderWidth: 1,
    marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#172033' },
  headerSubtitle: { fontSize: 13, color: '#526174', marginTop: 4 },
  grid: { gap: 12 },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderColor: '#DCE3E8',
    borderWidth: 1,
  },
  kpiLabel: { fontSize: 13, fontWeight: '600', color: '#526174' },
  kpiValue: { fontSize: 30, fontWeight: '700', color: '#172033', marginVertical: 6 },
  kpiSubtext: { fontSize: 12, color: '#7B8798' },
});
