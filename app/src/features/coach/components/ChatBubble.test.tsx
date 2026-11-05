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

describe('ChatBubble sem horário (05/11)', () => {
  it('mensagem antiga, sem horário gravado, não mostra hora', () => {
    const screen = render(<ChatBubble message="antiga" role="user" timestamp={null} />);
    expect(screen.queryByText(/\d{2}:\d{2}/)).toBeNull();
  });

  it('mensagem com horário mostra a hora dela, não a de agora', () => {
    const screen = render(
      <ChatBubble message="nova" role="coach" timestamp={new Date(2026, 10, 2, 9, 7)} />,
    );
    expect(screen.getByText('09:07')).toBeTruthy();
  });
});
