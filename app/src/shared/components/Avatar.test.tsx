import React from 'react';
import { render } from '@testing-library/react-native';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renderiza o emoji quando não há foto', () => {
    const { getByText } = render(<Avatar emoji="🦊" />);
    expect(getByText('🦊')).toBeTruthy();
  });

  it('renderiza a foto (e não o emoji) quando há uri', () => {
    const { getByLabelText, queryByText } = render(
      <Avatar uri="https://example.com/me.jpg" emoji="🦊" />,
    );
    expect(getByLabelText('Foto de perfil')).toBeTruthy();
    expect(queryByText('🦊')).toBeNull();
  });
});
