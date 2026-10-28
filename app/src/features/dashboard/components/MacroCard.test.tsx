import React from 'react';
import { render } from '@testing-library/react-native';
import { MacroCard } from './MacroCard';

describe('MacroCard', () => {
  it('valor fora da escala: percentual com teto e número que não estoura o card', () => {
    const { getByText } = render(
      <MacroCard label="Proteína" current={999999} goal={167} color="#000" />,
    );
    expect(getByText('999%+')).toBeTruthy();
    const value = getByText('999.999g');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });

  it('mantém uma casa decimal', () => {
    const { getByText } = render(
      <MacroCard label="Fibras" current={30.94} goal={24} color="#000" />,
    );
    expect(getByText('30,9g')).toBeTruthy();
    expect(getByText('129%')).toBeTruthy();
  });

  it('sem meta não mostra percentual', () => {
    const { getByText, queryByText } = render(
      <MacroCard label="Gordura" current={10} goal={null} color="#000" />,
    );
    expect(getByText('Sem meta')).toBeTruthy();
    expect(queryByText('--')).toBeNull();
  });
});
