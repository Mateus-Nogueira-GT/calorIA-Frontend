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

  // Hidrata nome/foto do backend (o login não traz avatar).
  useEffect(() => {
    profileService
      .getMe()
      .then((p) =>
        updateUser({
          name: p.full_name ?? undefined,
          avatarUrl: p.avatar_url,
          avatarEmoji: p.avatar_emoji,
        }),
      )
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
      const results = await Promise.all(
        days.map((d) => foodLogService.getMeals(dateToString(d)).catch(() => [])),
      );
      const data: DayCalories[] = days.map((d, i) => ({
        date: dateToString(d),
        label: DAYS_PT[d.getDay()],
        calories: results[i].reduce((s, m) => s + m.calories, 0),
      }));
      setWeeklyData(data);
      let s = 0;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].calories > 0) s++; else break;
      }
      setStreak(s);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = useCallback(async () => {
    try { await authService.logout(); } finally { clearToken(); }
  }, [clearToken]);

  return { user, weeklyData, streak, loading, handleLogout };
}
