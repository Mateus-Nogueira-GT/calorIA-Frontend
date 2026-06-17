import React, { useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { scannerService, ScanResult } from '@shared/services/scanner.service';
import { foodLogService } from '@shared/services/food-log.service';
import { useFoodLogStore } from '@features/food-log/store';
import { todayString } from '@shared/utils/date';
import { ScannerViewfinder } from '../components/ScannerViewfinder';
import { ScanResultCard } from '../components/ScanResultCard';

type ScanState = 'idle' | 'analyzing' | 'result' | 'error';

export function ScannerScreen(): React.JSX.Element {
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const addMeal = useFoodLogStore((s) => s.addMeal);
  const setSelectedDate = useFoodLogStore((s) => s.setSelectedDate);
  const navigation = useNavigation();

  async function handlePickImage(uri: string) {
    setState('analyzing');
    try {
      const data = await scannerService.analyzePhoto(uri);
      setResult(data);
      setState('result');
    } catch {
      setState('error');
    }
  }

  async function handleAddToDiary() {
    if (!result) return;
    try {
      const date = todayString();
      const meal = await foodLogService.addMeal({ name: result.name, calories: result.calories, protein: result.protein, carbs: result.carbs, fat: result.fat });
      addMeal(date, meal);
      setSelectedDate(date);
      Alert.alert('Adicionado!', `${result.name} foi adicionado ao seu diário.`);
      handleReset();
      navigation.navigate('FoodLog' as never);
    } catch {
      Alert.alert('Erro', 'Não foi possível adicionar a refeição.');
    }
  }

  function handleReset() {
    setState('idle');
    setResult(null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scanner de alimentos</Text>
      <Text style={styles.subtitle}>Fotografe seu prato para analisar os nutrientes</Text>
      <ScannerViewfinder onPickImage={handlePickImage} isAnalyzing={state === 'analyzing'} />
      {state === 'analyzing' && <Text style={styles.analyzingText}>Analisando com IA...</Text>}
      {state === 'result' && result && (
        <View style={styles.resultContainer}>
          <ScanResultCard result={result} onAdd={handleAddToDiary} onReset={handleReset} />
        </View>
      )}
      {state === 'error' && <Text style={styles.errorText}>Não foi possível analisar. Tente novamente.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground, padding: 16, paddingTop: 56 },
  title: { fontSize: typography.fontSize.xl, fontFamily: typography.fontFamily.bold, color: colors.brandAnchor, marginBottom: 4 },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.brandText, marginBottom: 16 },
  analyzingText: { color: colors.brandText, fontFamily: typography.fontFamily.medium, textAlign: 'center', marginTop: 16 },
  resultContainer: { marginTop: 16 },
  errorText: { color: colors.error, textAlign: 'center', marginTop: 16 },
});
