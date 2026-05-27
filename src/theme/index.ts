import { colors } from './colors';
import { typography } from './typography';

export { colors } from './colors';
export { typography } from './typography';
export type { Colors } from './colors';
export type { Typography } from './typography';

export const theme = {
  colors,
  typography,
} as const;

export type Theme = typeof theme;
