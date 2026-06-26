import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CaptureScreen } from '@features/scanner/screens/CaptureScreen';
import { AnalyzingScreen } from '@features/scanner/screens/AnalyzingScreen';
import { ScanResultScreen } from '@features/scanner/screens/ScanResultScreen';
import { colors } from '@theme';
import type { ScannerStackParamList } from './types';

const Stack = createNativeStackNavigator<ScannerStackParamList>();

export function ScannerNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandBackground },
        headerTintColor: colors.brandAnchor,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name='Capture' component={CaptureScreen} options={{ title: 'Escanear' }} />
      <Stack.Screen name='Analyzing' component={AnalyzingScreen} options={{ headerShown: false }} />
      <Stack.Screen name='ScanResult' component={ScanResultScreen} options={{ title: 'Resultado' }} />
    </Stack.Navigator>
  );
}
