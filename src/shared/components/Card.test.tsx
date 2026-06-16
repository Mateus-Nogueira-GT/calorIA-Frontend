import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { Card } from './Card';
import { Avatar } from './Avatar';

describe('Card', () => {
  it('renderiza children', () => {
    const { getByText } = render(
      <Card>
        <Text>Conteúdo</Text>
      </Card>,
    );
    expect(getByText('Conteúdo')).toBeTruthy();
  });

  it('chama onPress quando tocável', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Card onPress={onPress} testID="card">
        <Text>Item</Text>
      </Card>,
    );
    fireEvent.press(getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Avatar', () => {
  it('renderiza emoji passado', () => {
    const { getByText } = render(<Avatar emoji="🤖" />);
    expect(getByText('🤖')).toBeTruthy();
  });
});
