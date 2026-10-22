import { renderHook } from '@testing-library/react-native';
import { useGridWidth } from './useGridWidth';

let mockWidth = 390;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));

it.each([
  [390, 1, '100%'],
  [1000, 3, '31%'],
  [1280, 4, '23%'],
])('largura %s → %s coluna(s)', (width, columns, itemWidth) => {
  mockWidth = width;
  const { result } = renderHook(() => useGridWidth());
  expect(result.current).toEqual({ columns, itemWidth });
});
