import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScanItemRow } from './ScanItemRow';

const item = { id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 };

describe('ScanItemRow', () => {
  it('edita o nome via onChange', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ScanItemRow item={item} onChange={onChange} onRemove={() => {}} />,
    );
    fireEvent.changeText(getByTestId('scan-item-name'), 'Arroz integral');
    expect(onChange).toHaveBeenCalledWith('1', { name: 'Arroz integral' });
  });

  it('remove via onRemove', () => {
    const onRemove = jest.fn();
    const { getByTestId } = render(
      <ScanItemRow item={item} onChange={() => {}} onRemove={onRemove} />,
    );
    fireEvent.press(getByTestId('scan-item-remove'));
    expect(onRemove).toHaveBeenCalledWith('1');
  });

  it('editar campo macro para "1.5" chama onChange com valor decimal', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ScanItemRow item={item} onChange={onChange} onRemove={() => {}} />,
    );
    fireEvent.changeText(getByTestId('scan-item-calories'), '1.5');
    expect(onChange).toHaveBeenCalledWith('1', { calories: 1.5 });
  });

  it('limpar campo macro chama onChange com 0 e mantém input exibindo ""', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <ScanItemRow item={item} onChange={onChange} onRemove={() => {}} />,
    );
    fireEvent.changeText(getByTestId('scan-item-calories'), '');
    expect(onChange).toHaveBeenCalledWith('1', { calories: 0 });
    expect(getByTestId('scan-item-calories').props.value).toBe('');
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
