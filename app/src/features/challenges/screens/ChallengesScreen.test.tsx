import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ChallengesScreen } from './ChallengesScreen';
import { useChallengesStore } from '../store';
import type { Challenge } from '@shared/services/challenges.service';

jest.mock('@shared/services/challenges.service', () => ({
  challengesService: {
    getChallenges: jest.fn(),
    create: jest.fn(),
    join: jest.fn(),
    getLeaderboard: jest.fn(),
    resolveInvite: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { challengesService } = require('@shared/services/challenges.service');

const challenge: Challenge = {
  id: 'c1',
  title: 'Desafio 7 dias',
  description: 'Registre tudo',
  emoji: '🔥',
  startDate: '2026-06-24',
  endDate: '2026-07-01',
  participantCount: 3,
  metric: 'streak',
  joinedByMe: false,
  inviteCode: 'ABC',
  finished: false,
};

const navigation = { navigate: jest.fn() } as never;

describe('ChallengesScreen', () => {
  beforeEach(() => {
    useChallengesStore.getState().clear();
    jest.clearAllMocks();
  });

  it('lista desafios no mount', async () => {
    challengesService.getChallenges.mockResolvedValue([challenge]);
    const { getByText } = render(<ChallengesScreen navigation={navigation} route={{ key: 'k', name: 'Challenges' } as never} />);
    await waitFor(() => expect(getByText('Desafio 7 dias')).toBeTruthy());
  });

  it('mostra empty state quando vazio', async () => {
    challengesService.getChallenges.mockResolvedValue([]);
    const { getByText } = render(<ChallengesScreen navigation={navigation} route={{ key: 'k', name: 'Challenges' } as never} />);
    await waitFor(() => expect(getByText('Nenhum desafio ainda')).toBeTruthy());
  });
});
