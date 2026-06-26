import React, { useEffect, useState } from 'react';
import { ActivityIndicator, NativeSyntheticEvent, Platform, StyleSheet, TextInput, TextInputKeyPressEventData, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '@theme';

interface Props {
  onSend: (text: string) => Promise<boolean>;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props): React.JSX.Element {
  const [text, setText] = useState('');
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const syncInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset);
    };

    syncInset();
    viewport.addEventListener('resize', syncInset);
    viewport.addEventListener('scroll', syncInset);

    return () => {
      viewport.removeEventListener('resize', syncInset);
      viewport.removeEventListener('scroll', syncInset);
    };
  }, []);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    const sent = await onSend(trimmed);
    if (sent) {
      setText('');
    }
  }

  function handleKeyPress(event: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (Platform.OS !== 'web') return;
    const nativeEvent = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; preventDefault?: () => void };
    if (nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
      nativeEvent.preventDefault?.();
      void handleSend();
    }
  }

  return (
    <View style={[styles.container, { paddingBottom: spacing.md + keyboardInset }]}>
      <TextInput
        style={styles.input}
        placeholder="Pergunte ao Coach..."
        placeholderTextColor={colors.brandTextMuted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => void handleSend()}
        onKeyPress={handleKeyPress}
        returnKeyType="send"
        multiline
        maxLength={500}
        editable={!disabled}
        blurOnSubmit={false}
        textAlignVertical='top'
        accessibilityLabel='Campo de mensagem do Coach IA'
      />
      <TouchableOpacity
        style={[styles.sendBtn, (!text.trim() || disabled) && styles.sendBtnDisabled]}
        onPress={() => void handleSend()}
        disabled={!text.trim() || disabled}
        testID="chat-send-btn"
        accessibilityRole='button'
        accessibilityLabel='Enviar mensagem para o Coach IA'
      >
        {disabled ? <ActivityIndicator size='small' color={colors.brandAnchor} /> : <View style={styles.sendGlyph} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
    backgroundColor: colors.brandBackground,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.brandText,
    lineHeight: typography.fontSize.base * 1.45,
    maxHeight: 128,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.brandTrack },
  sendGlyph: {
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.brandAnchor,
    transform: [{ rotate: '45deg' }],
    marginRight: 2,
  },
});
