import React from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';
import { pickImage } from '@shared/services/image-picker.service';
import { ScannerViewfinder } from '../components/ScannerViewfinder';
import type { ScannerStackScreenProps } from '@navigation/types';

type Props = ScannerStackScreenProps<'Capture'>;

export function CaptureScreen({ navigation }: Props): React.JSX.Element {
  const go = (image: string) => navigation.navigate('Analyzing', { image });

  const fromSource = async (source: 'camera' | 'gallery') => {
    try {
      const image = await pickImage(source);
      if (image) go(image);
    } catch {
      Alert.alert('Não foi possível acessar', 'Verifique as permissões de câmera/galeria.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Fotografe seu prato</Text>
        {Platform.OS === 'web' ? (
          <ScannerViewfinder onPickImage={go} isAnalyzing={false} />
        ) : (
          <View style={styles.actions}>
            <Button onPress={() => fromSource('camera')}>Tirar foto</Button>
            <Button variant="secondary" onPress={() => fromSource('gallery')}>
              Escolher da galeria
            </Button>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { flex: 1, padding: 24, gap: 24, justifyContent: 'center' },
  title: {
    fontSize: 22,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.bold,
    textAlign: 'center',
  },
  actions: { gap: 12 },
});
