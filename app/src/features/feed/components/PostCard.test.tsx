import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PostCard } from './PostCard';
import type { Post } from '@shared/services/feed.service';

const basePost: Post = {
  id: 'p1',
  author: { id: 'u1', name: 'Ana', avatarEmoji: '🦊' },
  content: 'Bati minha meta hoje!',
  achievement: null,
  likeCount: 3,
  commentCount: 2,
  likedByMe: false,
  createdAt: new Date().toISOString(),
};

describe('PostCard', () => {
  it('renderiza autor, conteúdo e contador de comentários', () => {
    const { getByText } = render(
      <PostCard post={basePost} onPressComments={() => {}} onToggleLike={() => {}} />,
    );
    expect(getByText('Ana')).toBeTruthy();
    expect(getByText('Bati minha meta hoje!')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('renderiza AchievementCard quando há conquista', () => {
    const withAch: Post = {
      ...basePost,
      achievement: { type: 'streak', emoji: '🔥', title: 'Sequência de 7 dias', subtitle: '7 dias seguidos' },
    };
    const { getByText } = render(
      <PostCard post={withAch} onPressComments={() => {}} onToggleLike={() => {}} />,
    );
    expect(getByText('Sequência de 7 dias')).toBeTruthy();
  });

  it('aciona onPressComments e onToggleLike', () => {
    jest.useFakeTimers();
    const onComments = jest.fn();
    const onLike = jest.fn();
    const { getByTestId } = render(
      <PostCard post={basePost} onPressComments={onComments} onToggleLike={onLike} />,
    );
    fireEvent.press(getByTestId('comments-button'));
    act(() => {
      fireEvent.press(getByTestId('like-button'));
      jest.runAllTimers();
    });
    expect(onComments).toHaveBeenCalledWith('p1');
    expect(onLike).toHaveBeenCalledWith('p1');
    jest.useRealTimers();
  });
});
