import { View, Text, StyleSheet } from 'react-native';

export default function MobileProfile() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>Active Institution & Role</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Active Role:</Text>
          <Text style={styles.val}>Compliance User</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Scope:</Text>
          <Text style={styles.val}>All Institutions</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Authentication:</Text>
          <Text style={styles.val}>MFA Enforced (JWT)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F9', padding: 16 },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#DCE3E8' },
  name: { fontSize: 16, fontWeight: '700', color: '#172033', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, color: '#7B8798' },
  val: { fontSize: 13, fontWeight: '600', color: '#172033' },
});
