import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  it('chama onSend com o texto ao pressionar enviar', () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByPlaceholderText, getByTestId } = render(
      <ChatInput onSend={onSend} disabled={false} />,
    );
    fireEvent.changeText(getByPlaceholderText('Pergunte ao Coach...'), 'Olá');
    fireEvent.press(getByTestId('chat-send-btn'));
    expect(onSend).toHaveBeenCalledWith('Olá');
  });

  it('não chama onSend quando o input está vazio', () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    fireEvent.press(getByTestId('chat-send-btn'));
    expect(onSend).not.toHaveBeenCalled();
  });
});
