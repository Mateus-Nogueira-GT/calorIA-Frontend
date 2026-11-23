import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ChallengeCard } from './ChallengeCard';
import type { Challenge } from '@shared/services/challenges.service';

const challenge: Challenge = {
  id: 'c1',
  title: 'Perder 3kg em 7 dias',
  description: 'Alimentação e exercício',
  emoji: '🔥',
  startDate: '2026-11-23',
  endDate: '2026-11-30',
  participantCount: 1,
  metric: 'streak',
  joinedByMe: true,
  inviteCode: 'ABC',
  finished: false,
};

const noop = () => {};

describe('ChallengeCard — check-in de hoje', () => {
  it('antes do check-in, mostra o botão', () => {
    const onCheckIn = jest.fn();
    const { getByTestId, queryByText } = render(
      <ChallengeCard challenge={challenge} onPress={noop} onJoin={noop} joining={false} onCheckIn={onCheckIn} />,
    );

    fireEvent.press(getByTestId('challenge-checkin-c1'));

    expect(onCheckIn).toHaveBeenCalled();
    expect(queryByText('✅ Check-in feito')).toBeNull();
  });

  it('com o check-in de hoje feito, troca o botão pelo selo ✅', () => {
    const { getByText, queryByTestId } = render(
      <ChallengeCard
        challenge={challenge}
        onPress={noop}
        onJoin={noop}
        joining={false}
        onCheckIn={noop}
        checkedInToday
      />,
    );

    expect(getByText('✅ Check-in feito')).toBeTruthy();
    expect(queryByTestId('challenge-checkin-c1')).toBeNull();
  });
});
