import React, { useEffect, useState } from 'react';
import { ActivityIndicator, NativeSyntheticEvent, Platform, StyleSheet, Text, TextInput, TextInputKeyPressEventData, TouchableOpacity, View } from 'react-native';
import { screenShellStyle } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import { useVoiceMessage } from '../hooks/useVoiceMessage';

interface Props {
  onSend: (text: string) => Promise<boolean>;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props): React.JSX.Element {
  const [text, setText] = useState('');
  const [keyboardInset, setKeyboardInset] = useState(0);
  const voice = useVoiceMessage({ onSend, disabled });
  const isRecording = voice.status === 'recording';
  const isTranscribing = voice.status === 'transcribing';
  // Campo vazio + voz disponível → o botão de enviar vira microfone.
  const showMic = voice.isSupported && !text.trim();

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

  function renderActionButton(): React.JSX.Element {
    if (isTranscribing) {
      return (
        <View style={[styles.sendBtn, styles.sendBtnDisabled]} testID="chat-transcribing-indicator" accessibilityLabel="Transcrevendo áudio">
          <ActivityIndicator size="small" color={colors.brandAnchor} />
        </View>
      );
    }
    if (isRecording) {
      return (
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={() => void voice.stop()}
          testID="chat-mic-stop-btn"
          accessibilityRole="button"
          accessibilityLabel="Parar e enviar áudio"
        >
          <View style={styles.stopGlyph} />
        </TouchableOpacity>
      );
    }
    if (showMic) {
      const micDisabled = disabled || voice.status === 'starting';
      return (
        <TouchableOpacity
          style={[styles.sendBtn, micDisabled && styles.sendBtnDisabled]}
          onPress={() => void voice.start()}
          disabled={micDisabled}
          testID="chat-mic-btn"
          accessibilityRole="button"
          accessibilityLabel="Gravar áudio para o Coach IA"
          accessibilityState={{ disabled: micDisabled }}
        >
          {micDisabled ? <ActivityIndicator size="small" color={colors.brandAnchor} /> : <MicGlyph />}
        </TouchableOpacity>
      );
    }
    return (
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
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: spacing.md + keyboardInset }]}>
      {isRecording ? (
        <View style={styles.recordingBar}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => void voice.cancel()}
            testID="chat-mic-cancel-btn"
            accessibilityRole="button"
            accessibilityLabel="Cancelar gravação"
          >
            <Text style={styles.cancelText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingLabel}>Gravando</Text>
          <Text style={styles.recordingTimer} testID="chat-mic-timer">
            {formatElapsed(voice.elapsedSeconds)}
          </Text>
        </View>
      ) : (
        <TextInput
          style={styles.input}
          placeholder={isTranscribing ? 'Transcrevendo áudio...' : 'Pergunte ao Coach...'}
          placeholderTextColor={colors.brandTextMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void handleSend()}
          onKeyPress={handleKeyPress}
          returnKeyType="send"
          multiline
          maxLength={500}
          editable={!disabled && !isTranscribing}
          blurOnSubmit={false}
          textAlignVertical='top'
          accessibilityLabel='Campo de mensagem do Coach IA'
        />
      )}
      {renderActionButton()}
    </View>
  );
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function MicGlyph(): React.JSX.Element {
  return (
    <View style={styles.micGlyph}>
      <View style={styles.micCapsule} />
      <View style={styles.micCradle} />
      <View style={styles.micStem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...screenShellStyle,
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
  stopGlyph: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.brandAnchor,
  },
  micGlyph: { alignItems: 'center' },
  micCapsule: {
    width: 10,
    height: 15,
    borderRadius: 5,
    backgroundColor: colors.brandAnchor,
  },
  micCradle: {
    width: 16,
    height: 8,
    marginTop: -5,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: colors.brandAnchor,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  micStem: {
    width: 2,
    height: 3,
    backgroundColor: colors.brandAnchor,
  },
  recordingBar: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    paddingHorizontal: spacing.sm,
  },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandMutedSurface,
  },
  cancelText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.base,
    color: colors.brandText,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  recordingLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.base,
    color: colors.brandText,
  },
  recordingTimer: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.base,
    color: colors.brandText,
    fontVariant: ['tabular-nums'],
    marginRight: spacing.sm,
  },
});
