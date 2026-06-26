import { colors } from './colors';
import { typography } from './typography';
import { spacing, radius } from './spacing';

export { colors } from './colors';
export { typography } from './typography';
export type { Colors } from './colors';
export type { Typography } from './typography';
export { spacing, radius } from './spacing';

export const theme = {
  colors,
  typography,
  spacing,
  radius,
} as const;

export type Theme = typeof theme;
