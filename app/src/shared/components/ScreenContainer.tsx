import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  maxWidth?: number;
  style?: ViewStyle;
}

export function ScreenContainer({ children, maxWidth = 600, style }: Props): React.JSX.Element {
  const webStyle: ViewStyle | undefined =
    Platform.OS === 'web' ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined;
  return (
    <View testID='screen-container' style={[styles.base, webStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1 },
});
