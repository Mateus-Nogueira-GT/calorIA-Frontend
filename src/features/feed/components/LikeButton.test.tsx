import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LikeButton } from './LikeButton';

describe('LikeButton', () => {
  it('mostra o contador e dispara onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <LikeButton liked={false} count={5} onPress={onPress} />,
    );
    expect(getByText('5')).toBeTruthy();
    fireEvent.press(getByTestId('like-button'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renderiza coração preenchido quando liked', () => {
    const { getByTestId } = render(<LikeButton liked count={1} onPress={() => {}} />);
    expect(getByTestId('like-button').props.accessibilityState.selected).toBe(true);
  });
});
