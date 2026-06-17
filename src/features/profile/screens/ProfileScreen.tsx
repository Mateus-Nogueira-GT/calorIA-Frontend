import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useProfile } from '../hooks/useProfile';
import { ProfileHeader } from '../components/ProfileHeader';
import { StreakBadge } from '../components/StreakBadge';
import { WeeklyCalorieChart } from '../components/WeeklyCalorieChart';
import { ProfileMenuItem } from '../components/ProfileMenuItem';
import { Text } from '@shared/components';

export function ProfileScreen(): React.JSX.Element {
  const { user, weeklyData, streak, loading, handleLogout } = useProfile();
  const insets = useSafeAreaInsets();

  function confirmLogout() {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: handleLogout },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) + 16, paddingBottom: Math.max(insets.bottom, 18) + 96 }]}
    >
      <View style={styles.shell}>
        <Text style={styles.pageTitle}>Perfil</Text>
        <ProfileHeader name={user?.name ?? ''} email={user?.email ?? ''} />
        {streak > 0 && <StreakBadge days={streak} />}
        <View style={styles.section}>
          {!loading && weeklyData.length > 0 ? (
            <WeeklyCalorieChart data={weeklyData} />
          ) : (
            <View style={styles.chartFallback}>
              <Text style={styles.chartFallbackTitle}>Esta semana</Text>
              <Text style={styles.chartFallbackText}>Carregando seu progresso semanal.</Text>
            </View>
          )}
        </View>
        <View style={styles.settingsBlock}>
          <Text style={styles.settingsTitle}>Configuracoes</Text>
          <View style={styles.menuCard}>
            <ProfileMenuItem label="Metas e objetivos" icon='targets' onPress={() => {}} />
            <ProfileMenuItem label="Personalidade do Coach" icon='coach' onPress={() => {}} />
            <ProfileMenuItem label="Sair" icon='logout' onPress={confirmLogout} destructive testID="logout-btn" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground },
  content: { paddingHorizontal: 16 },
  shell: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  pageTitle: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
    marginBottom: 18,
  },
  section: { marginTop: 28 },
  chartFallback: {
    backgroundColor: colors.brandSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  chartFallbackTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  chartFallbackText: {
    marginTop: 8,
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
  },
  settingsBlock: { marginTop: 28 },
  settingsTitle: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
    marginBottom: 10,
  },
  menuCard: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    overflow: 'hidden',
  },
});
