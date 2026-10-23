import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@navigation/RootNavigator';
import { AppErrorBoundary } from '@shared/components';
import {
  LAUNCH_WINDOW_MS,
  LONG_BACKGROUND_MS,
  applyPendingUpdate,
} from '@shared/services/app-update.service';

function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  // OTA na mesma abertura (e ao voltar de um background longo), em vez de só
  // na abertura seguinte.
  useEffect(() => {
    let mounted = true;
    const openApp = () => {
      if (mounted) setReady(true);
    };
    // Não mostra cadastro/dashboard de uma versão prestes a ser substituída.
    // Rede travada não pode bloquear o acesso offline indefinidamente.
    const timeout = setTimeout(openApp, LAUNCH_WINDOW_MS);
    void applyPendingUpdate().then(openApp, openApp);
    let backgroundAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt = Date.now();
      else if (state === 'active' && backgroundAt !== null) {
        const away = Date.now() - backgroundAt;
        backgroundAt = null;
        if (away >= LONG_BACKGROUND_MS) void applyPendingUpdate();
      }
    });
    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider style={styles.container}>
      <AppErrorBoundary>
        {ready ? (
          <RootNavigator />
        ) : (
          <View
            style={styles.loading}
            accessibilityLabel="Preparando o aplicativo"
            accessibilityRole="progressbar"
          >
            <ActivityIndicator />
          </View>
        )}
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default App;
