import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from './Button';

describe('Button', () => {
  it('renderiza o label corretamente', () => {
    const { getByText } = render(<Button onPress={() => {}}>Salvar</Button>);
    expect(getByText('Salvar')).toBeTruthy();
  });

  it('chama onPress ao ser pressionado', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress}>Confirmar</Button>);
    fireEvent.press(getByText('Confirmar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('não chama onPress quando disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress} disabled>
        Bloqueado
      </Button>,
    );
    fireEvent.press(getByText('Bloqueado'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exibe ActivityIndicator quando loading=true', () => {
    const { getByTestId } = render(
      <Button onPress={() => {}} loading testID="btn">
        Enviando
      </Button>,
    );
    expect(getByTestId('btn-loading')).toBeTruthy();
  });
});
