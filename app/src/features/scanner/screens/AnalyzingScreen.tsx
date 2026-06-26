import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@theme';
import { Button } from '@shared/components/Button';
import { AnalyzingAnimation } from '../components/AnalyzingAnimation';
import { useScannerStore } from '../store';
import type { ScannerStackScreenProps } from '@navigation/types';

type Props = ScannerStackScreenProps<'Analyzing'>;

export function AnalyzingScreen({ navigation, route }: Props): React.JSX.Element {
  const analyze = useScannerStore((s) => s.analyze);
  const isAnalyzing = useScannerStore((s) => s.isAnalyzing);
  const error = useScannerStore((s) => s.error);

  useEffect(() => {
    let active = true;
    analyze(route.params.image).then(() => {
      if (active && !useScannerStore.getState().error) navigation.replace('ScanResult');
    });
    return () => {
      active = false;
    };
  }, [analyze, navigation, route.params.image]);

  return (
    <SafeAreaView style={styles.safe}>
      {error && !isAnalyzing ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Button onPress={() => navigation.goBack()}>Voltar</Button>
        </View>
      ) : (
        <AnalyzingAnimation />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground, justifyContent: 'center' },
  errorBox: { padding: spacing.xxl, gap: spacing.lg, alignItems: 'center' },
  errorText: { fontSize: typography.fontSize.base, color: colors.brandText, textAlign: 'center' },
});
