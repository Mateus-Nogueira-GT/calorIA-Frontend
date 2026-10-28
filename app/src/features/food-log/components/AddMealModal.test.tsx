import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AddMealModal } from './AddMealModal';

describe('AddMealModal', () => {
  it('exibe feedback quando salvar refeicao falha', async () => {
    const onClose = jest.fn();
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByTestId, getByText } = render(
      <AddMealModal visible onClose={onClose} onSubmit={onSubmit} />,
    );

    fireEvent.changeText(getByTestId('meal-name-input'), 'Iogurte');
    fireEvent.changeText(getByTestId('meal-calories-input'), '120');
    fireEvent.press(getByText('Salvar refeição'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Não foi possível salvar a refeição',
        'Tente novamente em instantes.',
      ),
    );
    expect(onClose).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  const existing = {
    id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, fiber: 4,
    loggedAt: '2026-10-12 12:00:00+00', mealType: 'dinner' as const,
  };

  it('modo edição: abre preenchido e envia os novos valores', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = render(
      <AddMealModal visible onClose={() => {}} onSubmit={onSubmit} initialMeal={existing} />,
    );
    expect(getByText('Editar refeição')).toBeTruthy();
    expect(getByTestId('meal-name-input').props.value).toBe('Frango');
    expect(getByTestId('meal-fiber-input').props.value).toBe('4');
    fireEvent.changeText(getByTestId('meal-calories-input'), '400');
    fireEvent.press(getByText('Salvar alterações'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Frango', calories: 400, fiber: 4, mealType: 'dinner' }),
      ),
    );
  });

  it('fibra vazia é enviada como null (sem dado)', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = render(
      <AddMealModal visible onClose={() => {}} onSubmit={onSubmit} initialMeal={existing} />,
    );
    fireEvent.changeText(getByTestId('meal-fiber-input'), '');
    fireEvent.press(getByText('Salvar alterações'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fiber: null })),
    );
  });

  it('registro novo continua com título e botão de registrar', () => {
    const { getByText } = render(<AddMealModal visible onClose={() => {}} onSubmit={jest.fn()} />);
    expect(getByText('Registrar refeição')).toBeTruthy();
    expect(getByText('Salvar refeição')).toBeTruthy();
  });

  it('fibra com letras bloqueia o envio', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = render(
      <AddMealModal visible onClose={() => {}} onSubmit={onSubmit} initialMeal={existing} />,
    );
    fireEvent.changeText(getByTestId('meal-fiber-input'), 'abc');
    fireEvent.press(getByText('Salvar alterações'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refeição sem tipo (scanner) mantém o grupo em que aparecia no diário', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    // 20h local: o diário mostra em "Jantar" pelo horário.
    const loggedAt = new Date(2026, 9, 12, 20, 0).toISOString();
    const { getByText, getByTestId } = render(
      <AddMealModal
        visible
        onClose={() => {}}
        onSubmit={onSubmit}
        initialMeal={{ ...existing, mealType: 'other', loggedAt }}
      />,
    );
    fireEvent.changeText(getByTestId('meal-calories-input'), '300');
    fireEvent.press(getByText('Salvar alterações'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'dinner' })),
    );
  });
  describe('limites e aviso de meta (feedback 27/10)', () => {
    const goals = { calories: 1695, protein: 167, carbs: 148, fat: 47 };
    const dayTotals = { calories: 300, protein: 20, carbs: 30, fat: 10, fiber: 2 };

    function fill(utils: ReturnType<typeof render>, calories: string) {
      fireEvent.changeText(utils.getByTestId('meal-name-input'), 'Rodízio');
      fireEvent.changeText(utils.getByTestId('meal-calories-input'), calories);
    }

    it('valor acima do teto mostra o erro no campo e não envia', () => {
      const onSubmit = jest.fn();
      const utils = render(<AddMealModal visible onClose={() => {}} onSubmit={onSubmit} />);
      fill(utils, '999999');
      expect(utils.getByText('Máximo de 5.000 kcal por refeição')).toBeTruthy();
      fireEvent.press(utils.getByText('Salvar refeição'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('refeição muito acima da meta pede confirmação; revisar não salva', () => {
      const onSubmit = jest.fn();
      const utils = render(
        <AddMealModal visible onClose={() => {}} onSubmit={onSubmit} goals={goals} dayTotals={dayTotals} />,
      );
      fill(utils, '1200');
      fireEvent.press(utils.getByText('Salvar refeição'));
      expect(utils.getByText('Essa refeição está bem acima da sua meta')).toBeTruthy();
      expect(utils.getByText(/1\.500 kcal hoje \(88% da meta de 1\.695 kcal\)/)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
      fireEvent.press(utils.getByText('Revisar valores'));
      expect(utils.getByTestId('meal-calories-input').props.value).toBe('1200');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('"Salvar mesmo assim" salva', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const utils = render(
        <AddMealModal visible onClose={() => {}} onSubmit={onSubmit} goals={goals} dayTotals={dayTotals} />,
      );
      fill(utils, '1200');
      fireEvent.press(utils.getByText('Salvar refeição'));
      fireEvent.press(utils.getByText('Salvar mesmo assim'));
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ calories: 1200 })),
      );
    });

    it('sem meta salva direto', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const utils = render(<AddMealModal visible onClose={() => {}} onSubmit={onSubmit} />);
      fill(utils, '1200');
      fireEvent.press(utils.getByText('Salvar refeição'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });

    it('na edição, o dia desconta a própria refeição', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      // Dia de 2.400 kcal que já inclui os 450 do Frango: trocar 450 por 460
      // dá 2.410 (142%), abaixo de 150%; somar sem descontar daria 2.860.
      const utils = render(
        <AddMealModal
          visible
          onClose={() => {}}
          onSubmit={onSubmit}
          initialMeal={existing}
          goals={goals}
          dayTotals={{ ...dayTotals, calories: 2400 }}
        />,
      );
      fireEvent.changeText(utils.getByTestId('meal-calories-input'), '460');
      fireEvent.press(utils.getByText('Salvar alterações'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });
  });
});
