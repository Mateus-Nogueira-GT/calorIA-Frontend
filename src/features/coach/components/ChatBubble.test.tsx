import React from 'react';
import { render } from '@testing-library/react-native';
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
});
