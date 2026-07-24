import React from 'react';
import { EmptyState, ErrorState } from '@shared/components';

interface Props {
  mode?: 'empty' | 'error';
  onCreate?: () => void;
  onRetry?: () => void;
  /** CTA principal do vazio (E2 da spec): o feed só mostra amigos — sem
   *  amigos ele fica vazio para sempre; o caminho é encontrá-los. */
  onFindFriends?: () => void;
}

export function EmptyFeedState({
  mode = 'empty',
  onCreate,
  onRetry,
  onFindFriends,
}: Props): React.JSX.Element {
  if (mode === 'error') {
    return (
      <ErrorState
        title="Não foi possível carregar o feed"
        subtitle="Verifique sua conexão e tente novamente."
        onRetry={onRetry ?? (() => {})}
      />
    );
  }
  if (onFindFriends) {
    return (
      <EmptyState
        emoji="👥"
        title="Seu feed está vazio"
        subtitle="O feed mostra as conquistas dos seus amigos. Encontre pessoas para acompanhar!"
        actionLabel="Encontrar amigos"
        onAction={onFindFriends}
      />
    );
  }
  return (
    <EmptyState
      emoji="🌱"
      title="Ainda não há posts"
      subtitle="Seja o primeiro a compartilhar uma conquista!"
      actionLabel="Criar post"
      onAction={onCreate ?? (() => {})}
    />
  );
}
