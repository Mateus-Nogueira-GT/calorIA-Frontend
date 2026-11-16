import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { HeaderCloseButton } from './HeaderCloseButton';

it('fecha a tela de compra aberta como modal', () => {
  const onPress = jest.fn();
  const screen = render(<HeaderCloseButton onPress={onPress} />);
  fireEvent.press(screen.getByLabelText('Fechar'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
