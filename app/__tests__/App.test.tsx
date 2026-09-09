/**
 * @format
 */

import 'react-native';
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { it, expect } from '@jest/globals';
import App from '../App';

/**
 * O teste original fazia `renderer.create(<App />)` de forma síncrona, sem
 * desmontar e sem esperar nada. O App monta o RootNavigator, que dispara
 * trabalho assíncrono na montagem (reidratação do persist do store de auth e,
 * quando autenticado, checagens de perfil e de job de dieta). Esse trabalho
 * continuava DEPOIS do teste terminar e o jest morria com
 *
 *   ReferenceError: You are trying to `import` a file after the Jest
 *   environment has been torn down. From __tests__/App.test.tsx.
 *
 * O jest sai com código 1 por causa disso mesmo com todos os testes verdes —
 * na main o sintoma ficava escondido porque a suíte já falhava por outros
 * motivos e ninguém olhava o código de saída.
 *
 * `render` do testing-library desmonta automaticamente no cleanup, e o `act`
 * abaixo drena a microtask da reidratação antes do teardown.
 */
it('renders correctly', async () => {
  const tree = render(<App />);

  // Deixa a reidratação do persist (e os efeitos que ela destrava) assentarem
  // ANTES do ambiente ser derrubado.
  await act(async () => {
    await Promise.resolve();
  });

  expect(tree.toJSON()).toBeTruthy();
  tree.unmount();
});
