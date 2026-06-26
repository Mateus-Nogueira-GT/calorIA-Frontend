import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { Skeleton } from './Skeleton';

// Reduce motion = true desliga o loop Animated → render determinístico e saída pristine.
jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

describe('Skeleton', () => {
  it('renderiza com testID e dimensões', async () => {
    const { getByTestId } = render(<Skeleton width={100} height={12} testID='sk' />);
    // drena o microtask do isReduceMotionEnabled().then(setReduceMotion)
    await act(async () => {});
    const node = getByTestId('sk');
    const flat = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style.flat()) : node.props.style;
    expect(flat.width).toBe(100);
    expect(flat.height).toBe(12);
  });
});
