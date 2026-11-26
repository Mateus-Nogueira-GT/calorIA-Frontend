import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('./api', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authService } = require('./auth.service');

describe('authService.profileSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * O coach pedia sexo, idade e nível de atividade de novo porque o onboarding
   * nunca os coletava. Agora vão no mesmo PUT, nos enums que o backend aceita.
   * A data de nascimento segue a convenção do backend: 1º de julho de
   * (ano atual − idade), como o MAKE_DATE(ano-idade, 7, 1) dele.
   */
  it('envia sexo, data de nascimento e nível de atividade', async () => {
    api.put.mockResolvedValue({ data: { success: true } });

    await authService.profileSetup({
      name: 'Ana',
      bodyType: 'mesomorph',
      heightCm: 165,
      weightKg: 60,
      goal: 'lose_weight',
      coachPersonality: 'direct',
      coachGender: 'neutral',
      sex: 'female',
      age: 30,
      activityLevel: 'moderate',
    });

    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe('/users/me/profile');
    expect(body).toMatchObject({
      gender: 'female',
      birth_date: `${new Date().getUTCFullYear() - 30}-01-01`,
      activity_level: 'moderate',
      coach_gender: 'neutral',
    });
  });

  /** Espelha ageFromIsoDate do backend (backend/src/shared/body-limits.ts), que conta em UTC. */
  const serverAge = (iso: string, now: Date) => {
    const d = new Date(`${iso}T00:00:00Z`);
    let age = now.getUTCFullYear() - d.getUTCFullYear();
    if (
      now.getUTCMonth() < d.getUTCMonth() ||
      (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
    )
      age--;
    return age;
  };

  it('R10: na virada do ano em Brasília, a idade no servidor é a informada', async () => {
    // Aparelho em Brasília, seja qual for o fuso de quem roda o teste: o ano
    // "local" é o de São Paulo.
    const localYear = jest.spyOn(Date.prototype, 'getFullYear').mockImplementation(function (
      this: Date,
    ) {
      return Number(
        new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(
          this,
        ),
      );
    });
    const now = new Date('2026-12-31T23:30:00-03:00');
    jest.useFakeTimers({ now });
    try {
      api.put.mockResolvedValue({ data: { success: true } });
      await authService.profileSetup({
        name: 'Ana',
        bodyType: 'mesomorph',
        heightCm: 165,
        weightKg: 60,
        goal: 'lose_weight',
        coachPersonality: 'direct',
        coachGender: 'neutral',
        sex: 'female',
        age: 30,
        activityLevel: 'moderate',
      });
      const [, body] = api.put.mock.calls[0];
      expect(serverAge(body.birth_date, now)).toBe(30);
    } finally {
      jest.useRealTimers();
      localYear.mockRestore();
    }
  });
});
