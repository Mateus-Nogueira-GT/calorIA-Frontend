import React, { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@navigation/RootNavigator';
import { AppErrorBoundary } from '@shared/components';
import { LONG_BACKGROUND_MS, applyPendingUpdate } from '@shared/services/app-update.service';

function App(): React.JSX.Element {
  // OTA na mesma abertura (e ao voltar de um background longo), em vez de só
  // na abertura seguinte.
  useEffect(() => {
    void applyPendingUpdate();
    let backgroundAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt = Date.now();
      else if (state === 'active' && backgroundAt !== null) {
        const away = Date.now() - backgroundAt;
        backgroundAt = null;
        if (away >= LONG_BACKGROUND_MS) void applyPendingUpdate();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider style={styles.container}>
      <AppErrorBoundary>
        <RootNavigator />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

export default App;
