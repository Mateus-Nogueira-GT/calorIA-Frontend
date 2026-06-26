import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import { usePressScale } from './usePressScale';

afterEach(() => jest.useRealTimers());

describe('usePressScale', () => {
  it('expõe scale e handlers e anima sem warning', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => usePressScale());
    expect(result.current.scale).toBeTruthy();
    act(() => {
      result.current.onPressIn();
      jest.runAllTimers();
    });
    act(() => {
      result.current.onPressOut();
      jest.runAllTimers();
    });
    expect(typeof result.current.onPressIn).toBe('function');
  });
});
