import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useConfirmDiscard } from './useConfirmDiscard';

type Listener = (e: { preventDefault: () => void; data: { action: unknown } }) => void;

function fakeNavigation() {
  let listener: Listener | undefined;
  return {
    addListener: jest.fn((_: string, cb: Listener) => {
      listener = cb;
      return jest.fn();
    }),
    dispatch: jest.fn(),
    /** Simula o voltar (botão do Android, gesto do iOS ou seta do header). */
    goBack() {
      const preventDefault = jest.fn();
      const action = { type: 'POP' };
      listener?.({ preventDefault, data: { action } });
      return { preventDefault, action };
    },
    get hasListener() {
      return listener !== undefined;
    },
  };
}

describe('useConfirmDiscard (N4)', () => {
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('sem alterações, não intercepta o voltar', () => {
    const nav = fakeNavigation();
    renderHook(() => useConfirmDiscard({ hasUnsavedChanges: false, navigation: nav as never }));
    expect(nav.addListener).not.toHaveBeenCalled();
  });

  it('com alterações, bloqueia a saída e pergunta', () => {
    const nav = fakeNavigation();
    renderHook(() => useConfirmDiscard({ hasUnsavedChanges: true, navigation: nav as never }));

    const { preventDefault } = nav.goBack();

    expect(preventDefault).toHaveBeenCalled();
    expect(nav.dispatch).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Descartar alterações?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('"Continuar editando" mantém o usuário na tela', () => {
    const nav = fakeNavigation();
    renderHook(() => useConfirmDiscard({ hasUnsavedChanges: true, navigation: nav as never }));
    nav.goBack();

    const botoes = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    botoes.find((b) => b.text === 'Continuar editando')?.onPress?.();

    expect(nav.dispatch).not.toHaveBeenCalled();
  });

  it('"Descartar" executa a navegação original', () => {
    const nav = fakeNavigation();
    renderHook(() => useConfirmDiscard({ hasUnsavedChanges: true, navigation: nav as never }));
    const { action } = nav.goBack();

    const botoes = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    botoes.find((b) => b.text === 'Descartar')?.onPress?.();

    expect(nav.dispatch).toHaveBeenCalledWith(action);
  });
})
