import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DateChip } from './DateChip';

describe('DateChip', () => {
  it('renderiza o label', () => {
    const { getByText } = render(<DateChip label="Hoje" selected={false} onPress={() => {}} />);
    expect(getByText('Hoje')).toBeTruthy();
  });

  it('chama onPress ao ser pressionado', () => {
    const onPress = jest.fn();
    const { getByText } = render(<DateChip label="Hoje" selected={false} onPress={onPress} />);
    fireEvent.press(getByText('Hoje'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
