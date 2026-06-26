import React from 'react';
import { EmptyState, ErrorState } from '@shared/components';

interface Props {
  mode?: 'empty' | 'error';
  onCreate?: () => void;
  onRetry?: () => void;
}

export function EmptyFeedState({ mode = 'empty', onCreate, onRetry }: Props): React.JSX.Element {
  if (mode === 'error') {
    return (
      <ErrorState
        title="Não foi possível carregar o feed"
        subtitle="Verifique sua conexão e tente novamente."
        onRetry={onRetry ?? (() => {})}
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
