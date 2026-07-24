import { useCallback, useEffect, useState } from 'react';
import { foodLogService } from '@shared/services/food-log.service';
import { authService } from '@shared/services/auth.service';
import { profileService } from '@shared/services/profile.service';
import { useAuthStore } from '@features/auth/store';
import { dateToString } from '@shared/utils/date';

export interface DayCalories { date: string; label: string; calories: number }

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function useProfile() {
  const user = useAuthStore((s) => s.user);
  const clearToken = useAuthStore((s) => s.clearToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [weeklyData, setWeeklyData] = useState<DayCalories[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWeeklyData(); }, []);

  // Hidrata nome/foto E o streak canônico do backend (G5) — antes o streak era
  // recalculado no cliente sobre o diário, divergindo do exibido em
  // amigos/desafios (que usam a tabela `streaks`).
  useEffect(() => {
    profileService
      .getMe()
      .then((p) => {
        updateUser({
          name: p.full_name ?? undefined,
          avatarUrl: p.avatar_url,
          avatarEmoji: p.avatar_emoji,
        });
        setStreak(p.current_streak ?? 0);
      })
      .catch(() => {});
  }, [updateUser]);

  async function loadWeeklyData() {
    setLoading(true);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    try {
      // G4: 1 request agregado no lugar de 7 (um por dia).
      const from = dateToString(days[0]);
      const to = dateToString(days[6]);
      const summary = await foodLogService.getSummary(from, to).catch(() => []);
      const byDate = new Map(summary.map((s) => [s.date, s.calories]));
      const data: DayCalories[] = days.map((d) => ({
        date: dateToString(d),
        label: DAYS_PT[d.getDay()],
        calories: byDate.get(dateToString(d)) ?? 0,
      }));
      setWeeklyData(data);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = useCallback(async () => {
    try { await authService.logout(); } finally { clearToken(); }
  }, [clearToken]);

  return { user, weeklyData, streak, loading, handleLogout };
}
