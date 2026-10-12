import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CaptureScreen } from '@features/scanner/screens/CaptureScreen';
import { AnalyzingScreen } from '@features/scanner/screens/AnalyzingScreen';
import { ScanResultScreen } from '@features/scanner/screens/ScanResultScreen';
import { ScannerGuestContext } from '@features/scanner/mode';
import { colors } from '@theme';
import type { ScannerStackParamList } from './types';

const Stack = createNativeStackNavigator<ScannerStackParamList>();

export function ScannerNavigator({ guest = false }: { guest?: boolean }): React.JSX.Element {
  return (
    <ScannerGuestContext.Provider value={guest}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.brandBackground },
          headerTintColor: colors.brandAnchor,
          headerShadowVisible: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: 'Escanear' }} />
        <Stack.Screen
          name="Analyzing"
          component={AnalyzingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ScanResult"
          component={ScanResultScreen}
          options={{ title: 'Resultado' }}
        />
      </Stack.Navigator>
    </ScannerGuestContext.Provider>
  );
}

/** Scanner aberto da Welcome, sem conta (App Store 5.1.1(v)). */
export function GuestScannerNavigator(): React.JSX.Element {
  return <ScannerNavigator guest />;
}
