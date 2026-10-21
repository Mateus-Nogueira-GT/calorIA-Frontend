import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ChatBubble } from './ChatBubble';

describe('ChatBubble', () => {
  it('renderiza a mensagem do coach', () => {
    const { getByText } = render(
      <ChatBubble message="Olá, como posso ajudar?" role="coach" timestamp={new Date()} />,
    );
    expect(getByText('Olá, como posso ajudar?')).toBeTruthy();
  });

  it('renderiza a mensagem do usuário', () => {
    const { getByText } = render(
      <ChatBubble message="Quero emagrecer" role="user" timestamp={new Date()} />,
    );
    expect(getByText('Quero emagrecer')).toBeTruthy();
  });

  describe('resposta falada', () => {
    const base = {
      message: 'Beba água.',
      role: 'coach' as const,
      timestamp: new Date(2026, 9, 21, 10, 0),
    };

    it('resposta sem áudio não mostra o botão', () => {
      const screen = render(<ChatBubble {...base} />);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('mostra Ouvir resposta e alterna para Parar áudio', () => {
      const onToggle = jest.fn();
      const screen = render(<ChatBubble {...base} audio={{ speaking: false, onToggle }} />);
      fireEvent.press(screen.getByRole('button', { name: 'Ouvir resposta' }));
      expect(onToggle).toHaveBeenCalledTimes(1);
      screen.rerender(<ChatBubble {...base} audio={{ speaking: true, onToggle }} />);
      expect(screen.getByRole('button', { name: 'Parar áudio da resposta' })).toBeTruthy();
    });
  });
});
