import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScanItemRow } from './ScanItemRow';

const item = { id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 };

/** Renderiza e toca em "Editar" — os campos só existem no modo de edição. */
function renderEditing(props: Partial<React.ComponentProps<typeof ScanItemRow>> = {}) {
  const utils = render(
    <ScanItemRow item={item} onChange={() => {}} onRemove={() => {}} {...props} />,
  );
  fireEvent.press(utils.getByText('Editar'));
  return utils;
}

describe('ScanItemRow', () => {
  it('começa em modo leitura, com os valores por extenso e o botão Editar', () => {
    const { getByText, queryByTestId } = render(
      <ScanItemRow item={{ ...item, fiber: 3 }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByText('Arroz')).toBeTruthy();
    expect(getByText('200 kcal')).toBeTruthy();
    expect(getByText('Proteína 4g · Carboidratos 44g · Gordura 1g · Fibra 3g')).toBeTruthy();
    expect(getByText('Editar')).toBeTruthy();
    expect(queryByTestId('scan-item-name')).toBeNull();
  });

  it('sem fibra, a linha de leitura omite a fibra', () => {
    const { getByText } = render(
      <ScanItemRow item={{ ...item, fiber: null }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByText('Proteína 4g · Carboidratos 44g · Gordura 1g')).toBeTruthy();
  });

  it('edita o nome via onChange', () => {
    const onChange = jest.fn();
    const { getByTestId } = renderEditing({ onChange });
    fireEvent.changeText(getByTestId('scan-item-name'), 'Arroz integral');
    expect(onChange).toHaveBeenCalledWith('1', { name: 'Arroz integral' });
  });

  it('remove via onRemove, sem precisar entrar em edição', () => {
    const onRemove = jest.fn();
    const { getByTestId } = render(
      <ScanItemRow item={item} onChange={() => {}} onRemove={onRemove} />,
    );
    fireEvent.press(getByTestId('scan-item-remove'));
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('editar campo macro para "1.5" chama onChange com valor decimal', () => {
    const onChange = jest.fn();
    const { getByTestId } = renderEditing({ onChange });
    fireEvent.changeText(getByTestId('scan-item-calories'), '1.5');
    expect(onChange).toHaveBeenCalledWith('1', { calories: 1.5 });
  });

  it('limpar campo macro chama onChange com 0 e mantém input exibindo ""', () => {
    const onChange = jest.fn();
    const { getByTestId } = renderEditing({ onChange });
    fireEvent.changeText(getByTestId('scan-item-calories'), '');
    expect(onChange).toHaveBeenCalledWith('1', { calories: 0 });
    expect(getByTestId('scan-item-calories').props.value).toBe('');
  });

  it('rótulos por extenso, sem abreviação de uma letra', () => {
    const { getByText, queryByText } = renderEditing();
    expect(getByText('Calorias (kcal)')).toBeTruthy();
    expect(getByText('Proteína (g)')).toBeTruthy();
    expect(getByText('Carboidratos (g)')).toBeTruthy();
    expect(getByText('Gordura (g)')).toBeTruthy();
    expect(getByText('Fibra (g)')).toBeTruthy();
    expect(queryByText('P')).toBeNull();
  });

  it('Editar abre o formulário com Fibra (g) e Concluir volta à leitura', () => {
    const onChange = jest.fn();
    const { getByText, getByTestId, queryByTestId } = renderEditing({
      item: { ...item, fiber: 3 },
      onChange,
    });
    expect(getByTestId('scan-item-fiber').props.value).toBe('3');
    fireEvent.changeText(getByTestId('scan-item-fiber'), '5');
    expect(onChange).toHaveBeenCalledWith('1', { fiber: 5 });
    fireEvent.press(getByText('Concluir'));
    expect(queryByTestId('scan-item-name')).toBeNull();
  });

  it('fibra apagada vira null (sem dado), não 0', () => {
    const onChange = jest.fn();
    const { getByTestId } = renderEditing({ item: { ...item, fiber: 3 }, onChange });
    fireEvent.changeText(getByTestId('scan-item-fiber'), '');
    expect(onChange).toHaveBeenCalledWith('1', { fiber: null });
  });

  it('fibra sem dado começa com o campo vazio, não "0"', () => {
    const { getByTestId } = renderEditing({ item: { ...item, fiber: null } });
    expect(getByTestId('scan-item-fiber').props.value).toBe('');
  });

  it('aceita vírgula decimal (teclado pt-BR)', () => {
    const onChange = jest.fn();
    const { getByTestId } = renderEditing({ onChange });
    fireEvent.changeText(getByTestId('scan-item-protein'), '2,5');
    expect(onChange).toHaveBeenCalledWith('1', { protein: 2.5 });
  });

  it('item manual (sem nome) já abre em edição', () => {
    const { getByTestId } = render(
      <ScanItemRow item={{ ...item, name: '' }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByTestId('scan-item-name')).toBeTruthy();
  });

  it('mostra o aviso de estimativa incerta quando uncertain=true', () => {
    const { getByText, queryByText, rerender } = render(
      <ScanItemRow item={{ ...item, uncertain: true }} onChange={() => {}} onRemove={() => {}} />,
    );
    expect(getByText('Estimativa incerta — confira os valores')).toBeTruthy();
    rerender(<ScanItemRow item={item} onChange={() => {}} onRemove={() => {}} />);
    expect(queryByText('Estimativa incerta — confira os valores')).toBeNull();
  });
});
