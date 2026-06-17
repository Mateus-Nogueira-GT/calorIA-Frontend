import React from 'react';
import { Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface ProfileMenuItemProps {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
  icon: 'targets' | 'coach' | 'logout';
  showChevron?: boolean;
}

function MenuIcon({ icon, destructive }: { icon: ProfileMenuItemProps['icon']; destructive?: boolean }): React.JSX.Element {
  const tint = destructive ? colors.error : colors.brandAnchor;

  if (icon === 'targets') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.targetOuter, { borderColor: tint }]}>
          <View style={[styles.targetInner, { borderColor: tint }]}>
            <View style={[styles.targetDot, { backgroundColor: tint }]} />
          </View>
        </View>
      </View>
    );
  }

  if (icon === 'coach') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.coachBubble, { borderColor: tint }]}>
          {[0, 1, 2].map((dot) => (
            <View key={dot} style={[styles.coachDot, { backgroundColor: tint }]} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.iconBox}>
      <View style={[styles.logoutFrame, { borderColor: tint }]}>
        <View style={[styles.logoutArrowA, { backgroundColor: tint }]} />
        <View style={[styles.logoutArrowB, { backgroundColor: tint }]} />
      </View>
    </View>
  );
}

export function ProfileMenuItem({ label, onPress, destructive, testID, icon, showChevron }: ProfileMenuItemProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed, focused }) => [
        styles.row,
        pressed && styles.rowPressed,
        focused && styles.rowFocused,
      ]}
      onPress={onPress}
      testID={testID}
      accessibilityRole='button'
      accessibilityState={{ disabled: false }}
      {...(Platform.OS === 'web' ? { ['aria-label' as const]: label } : undefined)}
    >
      <View style={[styles.leading, destructive && styles.leadingDestructive]}>
        <MenuIcon icon={icon} destructive={destructive} />
      </View>
      <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
      {showChevron ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
  },
  rowPressed: { backgroundColor: colors.brandPrimarySoft },
  rowFocused: {
    outlineColor: colors.brandAnchor,
    outlineOffset: -2,
    outlineStyle: 'solid',
    outlineWidth: 2,
  } as ViewStyle,
  leading: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.brandMutedSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  leadingDestructive: {
    backgroundColor: 'rgba(220, 53, 69, 0.10)',
  },
  iconBox: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  targetOuter: { width: 16, height: 16, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  targetInner: { width: 9, height: 9, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  targetDot: { width: 3, height: 3, borderRadius: 999 },
  coachBubble: { width: 16, height: 12, borderRadius: 4, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  coachDot: { width: 2.5, height: 2.5, borderRadius: 999 },
  logoutFrame: { width: 16, height: 14, borderRadius: 4, borderWidth: 1.5, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 2 },
  logoutArrowA: { width: 8, height: 1.6, borderRadius: 999, transform: [{ rotate: '35deg' }], position: 'absolute', left: 2, top: 4.5 },
  logoutArrowB: { width: 8, height: 1.6, borderRadius: 999, transform: [{ rotate: '-35deg' }], position: 'absolute', left: 2, bottom: 4.5 },
  label: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.brandText,
    flex: 1,
  },
  destructive: {
    color: colors.error,
  },
  chevron: {
    fontSize: typography.fontSize.lg,
    color: colors.brandTextMuted,
    marginLeft: 8,
  },
});
