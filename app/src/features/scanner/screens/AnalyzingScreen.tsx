import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@theme';
import { Button } from '@shared/components/Button';
import { AnalyzingAnimation } from '../components/AnalyzingAnimation';
import { useScannerStore } from '../store';
import { useIsGuestScanner } from '../mode';
import type { ScannerStackScreenProps } from '@navigation/types';

const cancelLabel = 'Cancelar análise';
const backLabel = 'Voltar';

type Props = ScannerStackScreenProps<'Analyzing'>;

/**
 * R7 — SEM limite de largura, por design.
 * Full-bleed junto com a CaptureScreen — é a continuação visual dela.
 * Exceção registrada em ScreenShell.test.tsx.
 */
export function AnalyzingScreen({ navigation, route }: Props): React.JSX.Element {
  const analyze = useScannerStore((s) => s.analyze);
  const cancelAnalyze = useScannerStore((s) => s.cancelAnalyze);
  const isAnalyzing = useScannerStore((s) => s.isAnalyzing);
  const error = useScannerStore((s) => s.error);
  const guest = useIsGuestScanner();

  useEffect(() => {
    let active = true;
    analyze(route.params.image, { guest }).then(() => {
      const state = useScannerStore.getState();
      if (active && !state.error && !state.isAnalyzing && state.items.length > 0)
        navigation.replace('ScanResult');
    });
    return () => {
      active = false;
    };
  }, [analyze, guest, navigation, route.params.image]);

  return (
    <SafeAreaView style={styles.safe}>
      {error && !isAnalyzing ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Button onPress={() => navigation.goBack()}>{backLabel}</Button>
        </View>
      ) : (
        <View style={styles.analyzing}>
          <AnalyzingAnimation />
          <Button
            variant="secondary"
            onPress={() => {
              cancelAnalyze();
              navigation.goBack();
            }}
          >
            {cancelLabel}
          </Button>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  analyzing: { flex: 1, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  safe: { flex: 1, backgroundColor: colors.brandBackground, justifyContent: 'center' },
  errorBox: { padding: spacing.xxl, gap: spacing.lg, alignItems: 'center' },
  errorText: { fontSize: typography.fontSize.base, color: colors.brandText, textAlign: 'center' },
});
