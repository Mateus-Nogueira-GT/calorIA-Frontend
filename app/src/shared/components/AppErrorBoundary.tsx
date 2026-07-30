import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '@theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Boundary raiz: sem ele, qualquer exceção de render em produção FECHA o app
 * no mobile, sem feedback nem recuperação. Aqui vira uma tela com retry.
 * `componentDidCatch` é também o ponto único para plugar crash reporting
 * (Sentry/Crashlytics) no futuro — ver docs/mobile-hardening.md.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    console.error('[AppErrorBoundary]', error, info);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container} testID="app-error-boundary">
        <Text style={styles.emoji}>😵</Text>
        <Text style={styles.title}>Algo deu errado</Text>
        <Text style={styles.body}>
          Encontramos um erro inesperado. Seus dados estão seguros.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={this.reset}
          style={styles.btn}
          testID="app-error-retry"
        >
          <Text style={styles.btnLabel}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.brandBackground,
    gap: spacing.md,
  },
  emoji: { fontSize: 48 },
  title: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  body: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
  },
  btnLabel: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
});
