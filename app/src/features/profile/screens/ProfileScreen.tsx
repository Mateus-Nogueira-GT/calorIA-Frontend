import React from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { colors } from '@theme';
import type { TabScreenProps } from '@navigation/types';
import { useProfile } from '../hooks/useProfile';
import { ProfileHeader } from '../components/ProfileHeader';
import { StreakBadge } from '../components/StreakBadge';
import { WeeklyCalorieChart } from '../components/WeeklyCalorieChart';
import { ProfileMenuItem } from '../components/ProfileMenuItem';
import { useAuthStore } from '@features/auth/store';

const goalLabels = {
  lose_weight: 'Perder peso',
  gain_muscle: 'Ganhar massa',
  maintain: 'Manter peso',
  health: 'Melhorar saude',
} as const;

const coachPersonalityLabels = {
  motivational: 'Motivador',
  direct: 'Direto',
  empathetic: 'Empatico',
  scientific: 'Cientifico',
} as const;

export function ProfileScreen({ navigation }: TabScreenProps<'Profile'>): React.JSX.Element {
  const { user, weeklyData, streak, loading, handleLogout } = useProfile();
  const profilePreferences = useAuthStore((state) => state.profilePreferences);

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
        <ProfileMenuItem
          label="🎯 Metas e objetivos"
          description={profilePreferences.goal ? goalLabels[profilePreferences.goal] : 'Defina o foco principal do seu plano'}
          onPress={() => navigation.navigate('ProfileGoals')}
          testID="profile-goals-btn"
        />
        <ProfileMenuItem
          label="🤖 Personalidade do Coach"
          description={profilePreferences.coachPersonality ? coachPersonalityLabels[profilePreferences.coachPersonality] : 'Escolha como seu coach deve falar com voce'}
          onPress={() => navigation.navigate('ProfileCoachPersonality')}
          testID="profile-coach-personality-btn"
        />
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
