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
});
