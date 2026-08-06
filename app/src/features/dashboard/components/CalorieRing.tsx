import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { current: number; goal: number; size?: number }

/**
 * Arco de progresso no NATIVO sem react-native-svg: o conic-gradient só existe
 * no web, então em iOS/Android o anel ficava eternamente cinza.
 *
 * Técnica dos dois semicírculos: cada metade do círculo é uma "janela"
 * (overflow hidden) contendo um semicírculo preenchido dentro de um container
 * do tamanho total — assim a rotação acontece em torno do centro do círculo
 * (padrão do transform), sem depender de transformOrigin.
 *   0–50%  → só a metade direita gira de -180° (oculta) até 0° (cheia)
 *   50–100% → direita cheia + esquerda girando de -180° até 0°
 * O furo central é o círculo de brandSurface já existente por cima.
 */
function ProgressHalf({
  side,
  size,
  degrees,
  testID,
}: {
  side: 'left' | 'right';
  size: number;
  degrees: number;
  testID: string;
}): React.JSX.Element {
  const half = size / 2;
  const isRight = side === 'right';
  return (
    <View
      testID={testID}
      style={[
        styles.clip,
        { width: half, height: size, left: isRight ? half : 0 },
      ]}
    >
      {/* Container do tamanho do círculo: gira em torno do próprio centro. */}
      <View
        style={{
          position: 'absolute',
          left: isRight ? -half : 0,
          width: size,
          height: size,
          transform: [{ rotate: `${degrees}deg` }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: isRight ? half : 0,
            width: half,
            height: size,
            backgroundColor: colors.brandPrimary,
            borderTopRightRadius: isRight ? half : 0,
            borderBottomRightRadius: isRight ? half : 0,
            borderTopLeftRadius: isRight ? 0 : half,
            borderBottomLeftRadius: isRight ? 0 : half,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Ângulo de cada semicírculo: -180° = totalmente oculto, 0° = metade cheia.
 * A direita cobre 0–50% do anel; a esquerda, 50–100%.
 */
export function halfDegrees(percent: number, side: 'left' | 'right'): number {
  const covered = side === 'right' ? Math.min(percent, 0.5) : Math.max(percent - 0.5, 0);
  return covered * 360 - 180;
}

export function CalorieRing({ current, goal, size = 120 }: Props): React.JSX.Element {
  const rawPercent = goal > 0 ? current / goal : 0;
  const percent = goal > 0 ? Math.min(Math.max(rawPercent, 0), 1) : 0;
  const displayPercent = goal > 0 ? Math.round(Math.max(rawPercent, 0) * 100) : 0;
  const angle = Math.round(percent * 360);
  const strokeWidth = Math.round(size * 0.085);
  const innerSize = size - strokeWidth * 2;
  const isWeb = Platform.OS === 'web';

  const webStyle = isWeb
    ? ({ backgroundImage: `conic-gradient(${colors.brandPrimary} ${angle}deg, ${colors.brandTrack} ${angle}deg)` } as object)
    : {};

  const rightDegrees = halfDegrees(percent, 'right');
  const leftDegrees = halfDegrees(percent, 'left');

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.outer,
          { width: size, height: size, borderRadius: size / 2 },
          !isWeb && { backgroundColor: colors.brandTrack, overflow: 'hidden' },
          webStyle,
        ]}
      >
        {!isWeb && percent > 0 ? (
          <>
            <ProgressHalf side="right" size={size} degrees={rightDegrees} testID="ring-half-right" />
            {percent > 0.5 ? (
              <ProgressHalf
                side="left"
                size={size}
                degrees={leftDegrees}
                testID="ring-half-left"
              />
            ) : null}
          </>
        ) : null}
      </View>
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor: colors.brandSurface,
        }}
      >
        <View style={styles.inner}>
          <Text style={styles.pct}>{displayPercent > 999 ? '999%+' : `${displayPercent}%`}</Text>
          <Text style={styles.caption}>atingido</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  outer: { position: 'absolute' },
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pct: { fontSize: typography.fontSize.lg, fontFamily: typography.fontFamily.extraBold, color: colors.brandAnchor },
  caption: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.medium, color: colors.brandTextMuted, marginTop: 2 },
});
