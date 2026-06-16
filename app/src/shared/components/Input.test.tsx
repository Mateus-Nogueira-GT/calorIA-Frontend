import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Input } from './Input';

describe('Input', () => {
  it('renderiza o label', () => {
    const { getByText } = render(<Input label="E-mail" />);
    expect(getByText('E-mail')).toBeTruthy();
  });

  it('exibe mensagem de erro quando error está preenchido', () => {
    const { getByText } = render(
      <Input label="Senha" error="Senha muito curta" />,
    );
    expect(getByText('Senha muito curta')).toBeTruthy();
  });

  it('não exibe mensagem de erro quando error está vazio', () => {
    const { queryByText } = render(<Input label="Nome" />);
    expect(queryByText('Campo obrigatório')).toBeNull();
  });

  it('chama onChangeText ao digitar', () => {
    const onChange = jest.fn();
    const { getByPlaceholderText } = render(
      <Input label="Nome" placeholder="Digite seu nome" onChangeText={onChange} />,
    );
    fireEvent.changeText(getByPlaceholderText('Digite seu nome'), 'João');
    expect(onChange).toHaveBeenCalledWith('João');
  });
});
