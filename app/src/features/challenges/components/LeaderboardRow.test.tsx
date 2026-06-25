import React from 'react';
import { render } from '@testing-library/react-native';
import { LeaderboardRow } from './LeaderboardRow';
import type { LeaderboardEntry } from '@shared/services/challenges.service';

const entry = (over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  user: { id: 'u1', name: 'Ana', avatarEmoji: '🦊' },
  streak: 7,
  isMe: false,
  ...over,
});

describe('LeaderboardRow', () => {
  it('mostra posição, nome e streak', () => {
    const { getByText } = render(<LeaderboardRow entry={entry()} />);
    expect(getByText('Ana')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(getByText('🔥 7')).toBeTruthy();
  });

  it('destaca a linha do próprio usuário (isMe)', () => {
    const { getByTestId } = render(<LeaderboardRow entry={entry({ isMe: true })} />);
    expect(getByTestId('leaderboard-row').props.accessibilityState.selected).toBe(true);
  });
});
