import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingOptionCard } from './OnboardingOptionCard';

describe('OnboardingOptionCard', () => {
  it('renderiza o título e a descrição', () => {
    const { getByText } = render(
      <OnboardingOptionCard
        emoji="💪"
        title="Mesomorfo"
        description="Corpo atlético"
        selected={false}
        onPress={() => {}}
      />,
    );
    expect(getByText('Mesomorfo')).toBeTruthy();
    expect(getByText('Corpo atlético')).toBeTruthy();
  });

  it('chama onPress ao ser pressionado', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <OnboardingOptionCard
        emoji="💪"
        title="Mesomorfo"
        description="Corpo atlético"
        selected={false}
        onPress={onPress}
      />,
    );
    fireEvent.press(getByText('Mesomorfo'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('aplica borda primary quando selected=true', () => {
    const { getByTestId } = render(
      <OnboardingOptionCard
        emoji="💪"
        title="Mesomorfo"
        description="Corpo atlético"
        selected={true}
        onPress={() => {}}
        testID="card"
      />,
    );
    const el = getByTestId('card');
    // O RN 0.85 entrega o style já achatado quando vem de callback do Pressable;
    // asserção por arrayContaining passava a depender do formato interno.
    expect(StyleSheet.flatten(el.props.style)).toMatchObject({ borderColor: '#3DDC84' });
  });
});
