import React, { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authService } from '@shared/services/auth.service';
import { useAuthStore } from '@features/auth/store';
import { Button, Input, Text } from '@shared/components';
import { colors } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function RegisterScreen({ navigation }: AuthStackScreenProps<'Register'>): React.JSX.Element {
  const setPendingAuth = useAuthStore((s) => s.setPendingAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  function validateName(v: string) {
    setNameError(v.length < 2 ? 'Nome deve ter no mínimo 2 caracteres' : '');
  }
  function validateEmail(v: string) {
    setEmailError(!isValidEmail(v) ? 'E-mail inválido' : '');
  }
  function validatePassword(v: string) {
    setPasswordError(v.length < 8 ? 'Senha deve ter no mínimo 8 caracteres' : '');
  }

  const isFormValid =
    name.length >= 2 && isValidEmail(email) && password.length >= 8;

  async function handleRegister() {
    setLoading(true);
    try {
      const res = await authService.register({ name, email, password });
      setPendingAuth(res.token, res.user);
      navigation.navigate('ProfileSetup');
    } catch {
      Alert.alert('Erro', 'Não foi possível criar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const { idToken } = await GoogleSignin.signIn();
      const res = await authService.loginWithGoogle(idToken ?? '');
      setPendingAuth(res.token, res.user);
      navigation.navigate('ProfileSetup');
    } catch {
      Alert.alert('Erro', 'Login com Google falhou.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="heading2" style={styles.title}>Criar conta</Text>

      <Input
        label="Nome completo"
        placeholder="Seu nome completo"
        value={name}
        onChangeText={setName}
        onBlur={() => validateName(name)}
        error={nameError}
        autoCapitalize="words"
      />
      <Input
        label="E-mail"
        placeholder="seu@email.com"
        value={email}
        onChangeText={setEmail}
        onBlur={() => validateEmail(email)}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input
        label="Senha"
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChangeText={setPassword}
        onBlur={() => validatePassword(password)}
        error={passwordError}
        secureTextEntry
      />

      <Button
        onPress={handleRegister}
        loading={loading}
        disabled={!isFormValid}
        size="lg"
        style={styles.btn}
      >
        Criar conta
      </Button>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text variant="caption" style={styles.orText}>ou</Text>
        <View style={styles.line} />
      </View>

      <Button variant="secondary" onPress={handleGoogle} size="lg" style={styles.btn}>
        Continuar com Google
      </Button>

      {Platform.OS === 'ios' && (
        <Button variant="secondary" onPress={() => {}} size="lg" style={styles.btn}>
          Continuar com Apple
        </Button>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.footer}>
        <Text variant="caption">
          Já tem conta?{' '}
          <Text variant="caption" color={colors.primary}>
            Entrar
          </Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, backgroundColor: colors.background, flexGrow: 1 },
  title: { marginBottom: 32 },
  btn: { marginBottom: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textDisabled },
  footer: { alignItems: 'center', marginTop: 24 },
});
