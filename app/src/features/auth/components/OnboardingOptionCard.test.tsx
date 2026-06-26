import React from 'react';
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
    expect(el.props.style).toEqual(
      expect.objectContaining({ borderColor: '#3DDC84' }),
    );
  });
});
