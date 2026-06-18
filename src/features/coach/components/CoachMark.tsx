import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@theme';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'primary' | 'anchor';
}

const SIZE_MAP = {
  sm: { shell: 28, bubbleW: 14, bubbleH: 11, dot: 2 },
  md: { shell: 40, bubbleW: 20, bubbleH: 15, dot: 2.5 },
  lg: { shell: 56, bubbleW: 28, bubbleH: 20, dot: 3 },
} as const;

export function CoachMark({ size = 'md', tone = 'primary' }: Props): React.JSX.Element {
  const metrics = SIZE_MAP[size];
  const shellColor = tone === 'primary' ? colors.brandPrimary : colors.brandAnchor;
  const strokeColor = tone === 'primary' ? colors.brandAnchor : colors.brandBackground;

  return (
    <View
      style={[
        styles.shell,
        {
          width: metrics.shell,
          height: metrics.shell,
          borderRadius: metrics.shell / 2,
          backgroundColor: shellColor,
        },
      ]}
    >
      <View
        style={[
          styles.bubble,
          {
            width: metrics.bubbleW,
            height: metrics.bubbleH,
            borderColor: strokeColor,
          },
        ]}
      >
        {[0, 1, 2].map((dot) => (
          <View
            key={dot}
            style={[
              styles.dot,
              {
                width: metrics.dot,
                height: metrics.dot,
                borderRadius: metrics.dot / 2,
                backgroundColor: strokeColor,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: {
    borderWidth: 1.6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  dot: {},
});
