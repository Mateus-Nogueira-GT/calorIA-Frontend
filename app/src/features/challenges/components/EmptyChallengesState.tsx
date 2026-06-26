import React from 'react';
import { EmptyState } from '@shared/components';

export function EmptyChallengesState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <EmptyState
      emoji="🏆"
      title="Nenhum desafio ainda"
      subtitle="Crie um desafio e convide seus amigos para participar."
      actionLabel="Criar desafio"
      onAction={onCreate}
    />
  );
}
