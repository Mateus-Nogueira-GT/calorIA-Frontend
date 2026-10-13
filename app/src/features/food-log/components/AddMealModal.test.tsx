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
});
