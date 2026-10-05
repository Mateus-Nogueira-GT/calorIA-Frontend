import React from 'react';
import { render } from '@testing-library/react-native';
import { MacroChips } from './MacroChips';

describe('MacroChips', () => {
  it('mostra os nomes por extenso, sem abreviação', () => {
    const { getByText, queryByText } = render(
      <MacroChips kcal={450} protein={20} carbs={50} fat={10} fiber={6} />,
    );
    getByText('450 kcal');
    getByText('Proteína 20g');
    getByText('Carboidrato 50g');
    getByText('Gordura 10g');
    getByText('Fibra 6g');
    expect(queryByText('P 20g')).toBeNull();
  });

  it('esconde a fibra quando a dieta não tem o dado (null/undefined)', () => {
    const { queryByText } = render(<MacroChips kcal={450} protein={20} carbs={50} fat={10} fiber={null} />);
    expect(queryByText(/Fibra/)).toBeNull();
    const r2 = render(<MacroChips kcal={450} protein={20} carbs={50} fat={10} />);
    expect(r2.queryByText(/Fibra/)).toBeNull();
  });
});
