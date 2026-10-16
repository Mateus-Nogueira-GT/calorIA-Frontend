import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  current: number;
  goal: number | null;
  size?: number;
}

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
  const clipDimensions = { width: half, height: size, left: isRight ? half : 0 };
  const rotationDimensions = {
    left: isRight ? -half : 0,
    width: size,
    height: size,
    transform: [{ rotate: `${degrees}deg` }],
  };
  const fillDimensions = {
    left: isRight ? half : 0,
    width: half,
    height: size,
    borderTopRightRadius: isRight ? half : 0,
    borderBottomRightRadius: isRight ? half : 0,
    borderTopLeftRadius: isRight ? 0 : half,
    borderBottomLeftRadius: isRight ? 0 : half,
  };
  return (
    <View testID={testID} style={[styles.clip, clipDimensions]}>
      {/* Container do tamanho do círculo: gira em torno do próprio centro. */}
      <View style={[styles.halfRotation, rotationDimensions]}>
        <View style={[styles.halfFill, fillDimensions]} />
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
  const { fontScale } = useWindowDimensions();
  const labelsOutside = fontScale > 1.3;
  // R5: sem dieta gerada não existe percentual — "0% atingido" sugeria que a
  // pessoa tinha meta e não comeu nada.
  const hasGoal = goal !== null && goal > 0;
  const rawPercent = hasGoal ? current / goal : 0;
  const percent = hasGoal ? Math.min(Math.max(rawPercent, 0), 1) : 0;
  const displayPercent = hasGoal ? Math.round(Math.max(rawPercent, 0) * 100) : 0;
  const angle = Math.round(percent * 360);
  const strokeWidth = Math.round(size * 0.085);
  const innerSize = size - strokeWidth * 2;
  const isWeb = Platform.OS === 'web';

  const webStyle = isWeb
    ? ({
        backgroundImage: `conic-gradient(${colors.brandPrimary} ${angle}deg, ${colors.brandTrack} ${angle}deg)`,
      } as object)
    : {};

  const rightDegrees = halfDegrees(percent, 'right');
  const leftDegrees = halfDegrees(percent, 'left');

  return (
    <View style={styles.wrapper}>
      <View style={styles.graphic}>
        <View
          style={[
            styles.outer,
            { width: size, height: size, borderRadius: size / 2 },
            !isWeb && styles.nativeTrack,
            webStyle,
          ]}
        >
          {!isWeb && percent > 0 ? (
            <>
              <ProgressHalf
                side="right"
                size={size}
                degrees={rightDegrees}
                testID="ring-half-right"
              />
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
          {!labelsOutside && (
            <View style={styles.inner}>
              <Text style={styles.pct}>
                {!hasGoal ? '--' : displayPercent > 999 ? '999%+' : `${displayPercent}%`}
              </Text>
              <Text style={styles.caption}>{hasGoal ? 'atingido' : 'sem meta'}</Text>
            </View>
          )}
        </View>
      </View>
      {labelsOutside && (
        <View testID="ring-labels-outside" style={styles.outsideLabels}>
          <Text style={styles.pct}>{!hasGoal ? '--' : `${displayPercent}%`}</Text>
          <Text style={styles.caption}>{hasGoal ? 'atingido' : 'sem meta'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  graphic: { alignItems: 'center', justifyContent: 'center' },
  outsideLabels: { alignItems: 'center', alignSelf: 'stretch', marginTop: 8 },
  outer: { position: 'absolute' },
  nativeTrack: { backgroundColor: colors.brandTrack, overflow: 'hidden' },
  halfRotation: { position: 'absolute' },
  halfFill: { position: 'absolute', backgroundColor: colors.brandPrimary },
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pct: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.extraBold,
    color: colors.brandAnchor,
  },
  caption: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.brandTextMuted,
    marginTop: 2,
  },
});
