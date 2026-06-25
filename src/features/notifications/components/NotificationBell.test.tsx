import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NotificationBell } from './NotificationBell';

describe('NotificationBell', () => {
  it('mostra o badge com a contagem quando > 0', () => {
    const { getByText } = render(<NotificationBell count={3} onPress={() => {}} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('não mostra badge quando count é 0', () => {
    const { queryByText } = render(<NotificationBell count={0} onPress={() => {}} />);
    expect(queryByText('0')).toBeNull();
  });

  it('dispara onPress', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<NotificationBell count={1} onPress={onPress} />);
    fireEvent.press(getByTestId('notification-bell'));
    expect(onPress).toHaveBeenCalled();
  });
});
