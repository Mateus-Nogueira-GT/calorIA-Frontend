import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { LikeButton } from './LikeButton';

describe('LikeButton', () => {
  it('mostra o contador e dispara onPress', () => {
    jest.useFakeTimers();
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <LikeButton liked={false} count={5} onPress={onPress} />,
    );
    expect(getByText('5')).toBeTruthy();
    act(() => {
      fireEvent.press(getByTestId('like-button'));
      jest.runAllTimers();
    });
    expect(onPress).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('renderiza coração preenchido quando liked', () => {
    const { getByTestId } = render(<LikeButton liked count={1} onPress={() => {}} />);
    expect(getByTestId('like-button').props.accessibilityState.selected).toBe(true);
  });
});
