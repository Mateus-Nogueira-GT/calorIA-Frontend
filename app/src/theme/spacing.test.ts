import { describe, it, expect } from '@jest/globals';
import { spacing, radius } from './spacing';

describe('spacing tokens', () => {
  it('expõe a escala 4-based', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 });
  });
  it('expõe a escala de raio', () => {
    expect(radius).toEqual({ sm: 8, md: 12, lg: 16, pill: 999 });
  });
});
