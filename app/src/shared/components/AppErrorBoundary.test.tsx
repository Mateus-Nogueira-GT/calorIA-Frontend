import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AppErrorBoundary } from './AppErrorBoundary';

/**
 * Estado fora do componente: o boundary re-renderiza os MESMOS elementos filhos
 * após o reset, então uma prop capturada na closure nunca mudaria. O componente
 * precisa ler a condição na hora do render.
 */
const bomb = { armed: true };

function Bomb(): React.JSX.Element {
  if (bomb.armed) throw new Error('boom');
  return <Text>app ok</Text>;
}

describe('AppErrorBoundary', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    bomb.armed = true;
    // React loga o erro capturado; silenciamos para não poluir a saída.
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renderiza os filhos normalmente quando não há erro', () => {
    bomb.armed = false;
    const { getByText } = render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(getByText('app ok')).toBeTruthy();
  });

  it('filho que lança → tela de recuperação (não derruba o app)', () => {
    const { getByText } = render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(getByText('Algo deu errado')).toBeTruthy();
  });

  it('botão "Tentar novamente" re-renderiza o filho', () => {
    const { getByText } = render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    bomb.armed = false;
    fireEvent.press(getByText('Tentar novamente'));
    expect(getByText('app ok')).toBeTruthy();
  });
});
