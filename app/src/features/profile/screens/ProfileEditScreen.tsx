import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, typography } from '@theme';
import { Button } from '@shared/components';
import type { RootStackScreenProps } from '@navigation/types';
import { useAuthStore } from '@features/auth/store';
import { profileService } from '@shared/services/profile.service';
import { pickImage } from '@shared/services/image-picker.service';

const EMOJI_OPTIONS = ['🙂', '😎', '🦊', '🐼', '🐯', '🍎', '🥑', '💪', '🔥', '⭐', '🌱', '🏆'];

/**
 * O catch engolia tudo num alerta só: timeout de rede, 502 do Storage e 422 de
 * imagem inválida viravam a mesma frase, e o usuário não sabia se tentava de
 * novo, trocava de foto ou desistia.
 */
function describeUploadError(error: unknown): string {
  const e = error as {
    response?: { status?: number; data?: { error?: string; message?: string } };
    code?: string;
    message?: string;
  };

  const isTimeout =
    e?.code === 'ECONNABORTED' ||
    e?.code === 'ERR_NETWORK' ||
    (typeof e?.message === 'string' && /timeout|network/i.test(e.message));
  if (isTimeout) {
    return 'A conexão demorou demais para enviar a foto. Tente de novo com um sinal melhor.';
  }

  if (e?.response?.status === 422) {
    return 'Não conseguimos ler essa imagem. Tente escolher outra foto.';
  }
  if (e?.response?.status === 502) {
    return 'Nosso servidor de imagens falhou. Tente de novo em alguns instantes.';
  }

  const fromServer = e?.response?.data?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;

  return 'Não foi possível enviar a foto. Tente novamente.';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'U';
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export function ProfileEditScreen({ navigation }: RootStackScreenProps<'ProfileEdit'>): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [name, setName] = useState(user?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(user?.avatarEmoji ?? null);
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingEmoji, setSavingEmoji] = useState(false);

  // Hidrata foto/emoji atuais do backend (login não traz avatar).
  useEffect(() => {
    let active = true;
    profileService
      .getMe()
      .then((p) => {
        if (!active) return;
        setAvatarUrl(p.avatar_url);
        setAvatarEmoji(p.avatar_emoji);
        if (p.full_name) setName(p.full_name);
        updateUser({ name: p.full_name ?? undefined, avatarUrl: p.avatar_url, avatarEmoji: p.avatar_emoji });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [updateUser]);

  const nameChanged = name.trim().length >= 2 && name.trim() !== (user?.name ?? '');

  async function handleSaveName() {
    if (!nameChanged || savingName) return;
    setSavingName(true);
    try {
      const p = await profileService.updateProfile({ full_name: name.trim() });
      updateUser({ name: p.full_name ?? name.trim() });
      Alert.alert('Pronto', 'Nome atualizado.');
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o nome. Tente novamente.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePhoto() {
    if (uploadingPhoto) return;
    try {
      const dataUrl = await pickImage('gallery');
      if (!dataUrl) return;
      setUploadingPhoto(true);
      const p = await profileService.uploadAvatar(dataUrl);
      setAvatarUrl(p.avatar_url);
      updateUser({ avatarUrl: p.avatar_url });
    } catch (error) {
      Alert.alert('Erro', describeUploadError(error));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePickEmoji(emoji: string) {
    if (savingEmoji) return;
    setSavingEmoji(true);
    try {
      // Selecionar um emoji remove a foto para que o emoji seja exibido.
      const p = await profileService.updateProfile({ avatar_emoji: emoji, avatar_url: null });
      setAvatarEmoji(p.avatar_emoji);
      setAvatarUrl(p.avatar_url);
      updateUser({ avatarEmoji: p.avatar_emoji, avatarUrl: p.avatar_url });
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o avatar. Tente novamente.');
    } finally {
      setSavingEmoji(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarBlock}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} accessibilityLabel='Foto de perfil' />
        ) : avatarEmoji ? (
          <View style={styles.avatarEmojiWrap}>
            <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
          </View>
        ) : (
          <View style={styles.avatarInitialsWrap}>
            <Text style={styles.avatarInitials}>{initialsOf(name)}</Text>
          </View>
        )}

        <Pressable onPress={handleChangePhoto} disabled={uploadingPhoto} style={styles.photoBtn} testID='change-photo-btn'>
          {uploadingPhoto ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (
            <Text style={styles.photoBtnText}>📷 Escolher foto da galeria</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.label}>Ou escolha um emoji</Text>
      <View style={styles.emojiGrid}>
        {EMOJI_OPTIONS.map((e) => {
          const active = !avatarUrl && avatarEmoji === e;
          return (
            <Pressable
              key={e}
              onPress={() => handlePickEmoji(e)}
              disabled={savingEmoji}
              style={[styles.emojiCell, active && styles.emojiCellActive]}
              accessibilityRole='button'
              accessibilityState={{ selected: active }}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Nome</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder='Seu nome'
        placeholderTextColor={colors.brandTextMuted}
        maxLength={100}
      />

      <View style={styles.footer}>
        <Button onPress={handleSaveName} disabled={!nameChanged} loading={savingName}>
          Salvar nome
        </Button>
        <Button variant='ghost' onPress={() => navigation.goBack()}>
          Voltar
        </Button>
      </View>
    </ScrollView>
  );
}

const AVATAR = 96;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: 20, gap: 16 },
  avatarBlock: { alignItems: 'center', gap: 12 },
  avatarImage: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: colors.brandMutedSurface },
  avatarEmojiWrap: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.brandSupportSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 48 },
  avatarInitialsWrap: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.brandAnchor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: typography.fontSize.xxl, fontFamily: typography.fontFamily.extraBold, color: colors.brandBackground },
  photoBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  photoBtnText: { fontSize: typography.fontSize.base, color: colors.brandPrimary, fontFamily: typography.fontFamily.semiBold },
  label: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emojiCell: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brandDivider,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCellActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSupportSoft },
  emojiText: { fontSize: 24 },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 14,
    fontSize: typography.fontSize.md,
    color: colors.brandText,
  },
  footer: { marginTop: 8, gap: 8 },
});
