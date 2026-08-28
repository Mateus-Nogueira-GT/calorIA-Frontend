import React from 'react';
import { View, ScrollView, StyleSheet, Alert, Linking } from 'react-native';
import { colors, radius, spacing } from '@theme';
import type { TabScreenProps } from '@navigation/types';
import { useProfile } from '../hooks/useProfile';
import { ProfileHeader } from '../components/ProfileHeader';
import { StreakBadge } from '../components/StreakBadge';
import { WeeklyCalorieChart } from '../components/WeeklyCalorieChart';
import { ProfileMenuItem } from '../components/ProfileMenuItem';
import { useAuthStore } from '@features/auth/store';

/**
 * Exigência do Google Play: a política precisa estar linkada na ficha da loja
 * E dentro do app. Só na loja não cumpre.
 */
const PRIVACY_POLICY_URL = 'https://caloriaoficial.com.br/politica-de-privacidade';

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
  const { user, weeklyData, streak, loading, handleLogout, handleDeleteAccount } = useProfile();
  const profilePreferences = useAuthStore((state) => state.profilePreferences);

  function confirmLogout() {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: handleLogout },
    ]);
  }

  async function deleteAccount() {
    try {
      await handleDeleteAccount();
    } catch {
      Alert.alert(
        'Não foi possível excluir',
        'Sua conta continua ativa. Tente novamente em instantes.',
      );
    }
  }

  async function openPrivacyPolicy() {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      Alert.alert('Não foi possível abrir', `Acesse pelo navegador: ${PRIVACY_POLICY_URL}`);
    }
  }

  /**
   * Dois passos de propósito: a exclusão é irreversível e fica ao lado do
   * "Sair" no menu. Um toque acidental não pode apagar a conta.
   */
  function confirmDeleteAccount() {
    Alert.alert(
      'Excluir conta',
      'Isso apaga permanentemente seu perfil, refeições, dietas e histórico. Não dá para desfazer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Tem certeza?', 'Esta é a última confirmação. Seus dados serão apagados.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Excluir conta', style: 'destructive', onPress: deleteAccount },
            ]),
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ProfileHeader name={user?.name ?? ''} email={user?.email ?? ''} avatarUri={user?.avatarUrl ?? undefined} />
      {streak > 0 && <StreakBadge days={streak} />}
      <View style={styles.section}>
        {!loading && weeklyData.length > 0 && <WeeklyCalorieChart data={weeklyData} />}
      </View>
      <View style={styles.menuCard}>
        <ProfileMenuItem
          label="👤 Editar perfil"
          description="Altere seu nome e foto de perfil"
          onPress={() => navigation.navigate('ProfileEdit')}
          testID="profile-edit-btn"
        />
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
        <ProfileMenuItem
          label="📈 Evolução"
          description="Acompanhe seu peso e o histórico de calorias"
          onPress={() => navigation.navigate('Evolution')}
          testID="profile-evolution-btn"
        />
        <ProfileMenuItem
          label="🔒 Política de privacidade"
          description="Como seus dados são coletados e usados"
          onPress={openPrivacyPolicy}
          testID="privacy-policy-btn"
        />
        <ProfileMenuItem label="🚪 Sair" onPress={confirmLogout} destructive testID="logout-btn" />
        <ProfileMenuItem
          label="🗑️ Excluir conta"
          description="Apaga permanentemente sua conta e todos os seus dados"
          onPress={confirmDeleteAccount}
          destructive
          testID="delete-account-btn"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  content: { padding: spacing.lg },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
  menuCard: { marginTop: spacing.lg, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
