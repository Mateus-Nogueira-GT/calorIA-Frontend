import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { FeedScreen } from './FeedScreen';
import { useFeedStore } from '../store';
import type { Post } from '@shared/services/feed.service';

jest.mock('@shared/services/feed.service', () => ({
  feedService: {
    getFeed: jest.fn(),
    createPost: jest.fn(),
    like: jest.fn(),
    unlike: jest.fn(),
    getComments: jest.fn(),
    addComment: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { feedService } = require('@shared/services/feed.service');

const post: Post = {
  id: 'p1',
  author: { id: 'u1', name: 'Ana' },
  content: 'Primeiro post!',
  achievement: null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  createdAt: new Date().toISOString(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const navigation = { navigate: jest.fn() } as any;

describe('FeedScreen', () => {
  beforeEach(() => {
    useFeedStore.getState().clear();
    jest.clearAllMocks();
  });

  it('carrega e renderiza posts no mount', async () => {
    feedService.getFeed.mockResolvedValue({ posts: [post], nextCursor: null });
    const { getByText } = render(
      <FeedScreen navigation={navigation} route={{ key: 'k', name: 'Feed' }} />,
    );
    await waitFor(() => expect(getByText('Primeiro post!')).toBeTruthy());
  });

  it('mostra empty state quando não há posts', async () => {
    feedService.getFeed.mockResolvedValue({ posts: [], nextCursor: null });
    const { getByText } = render(
      <FeedScreen navigation={navigation} route={{ key: 'k', name: 'Feed' }} />,
    );
    await waitFor(() => expect(getByText('Seu feed está vazio')).toBeTruthy());
  });
});
