import { describe, it, expect } from 'vitest'
import { toAchievement } from './feed.service.js'

describe('toAchievement', () => {
  it('metadata.achievement tem prioridade sobre o tipo', () => {
    const custom = { type: 'streak', emoji: '🏆', title: 'X', subtitle: 'Y' }
    expect(toAchievement('custom', { achievement: custom })).toEqual(custom)
  })

  it('deriva badge por tipo de post', () => {
    expect(toAchievement('meal_completed', {})?.type).toBe('meal_logged')
    expect(toAchievement('diet_generated', {})?.type).toBe('diet_completed')
    expect(toAchievement('streak_milestone', {})?.type).toBe('streak')
  })

  it('streak_milestone usa metadata.streak no título', () => {
    expect(toAchievement('streak_milestone', { streak: 14 })?.title).toBe('14 dias seguidos')
    expect(toAchievement('streak_milestone', {})?.title).toBe('Sequência mantida')
  })

  it('post custom sem metadata não tem badge', () => {
    expect(toAchievement('custom', {})).toBeNull()
  })
})
