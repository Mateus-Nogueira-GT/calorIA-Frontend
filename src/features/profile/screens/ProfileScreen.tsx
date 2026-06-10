import React from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { colors } from '@theme';
import { useProfile } from '../hooks/useProfile';
import { ProfileHeader } from '../components/ProfileHeader';
import { StreakBadge } from '../components/StreakBadge';
import { WeeklyCalorieChart } from '../components/WeeklyCalorieChart';
import { ProfileMenuItem } from '../components/ProfileMenuItem';

export function ProfileScreen(): React.JSX.Element {
  const { user, weeklyData, streak, loading, handleLogout } = useProfile();

  function confirmLogout() {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: handleLogout },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ProfileHeader name={user?.name ?? ''} email={user?.email ?? ''} />
      {streak > 0 && <StreakBadge days={streak} />}
      <View style={styles.section}>
        {!loading && weeklyData.length > 0 && <WeeklyCalorieChart data={weeklyData} />}
      </View>
      <View style={styles.menuCard}>
        <ProfileMenuItem label="🎯 Metas e objetivos" onPress={() => {}} />
        <ProfileMenuItem label="🤖 Personalidade do Coach" onPress={() => {}} />
        <ProfileMenuItem label="🚪 Sair" onPress={confirmLogout} destructive testID="logout-btn" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  content: { padding: 16 },
  section: { marginTop: 20, marginBottom: 8 },
  menuCard: { marginTop: 16, backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
