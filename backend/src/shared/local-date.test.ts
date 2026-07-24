import { describe, expect, it } from 'vitest'
import { completedOnDate, isWithinDateWindow, utcDayNumber, utcTodayString } from './local-date.js'

describe('utcTodayString', () => {
  it('retorna YYYY-MM-DD em UTC', () => {
    expect(utcTodayString(new Date('2026-07-24T23:59:00Z'))).toBe('2026-07-24')
    expect(utcTodayString(new Date('2026-07-24T00:00:00Z'))).toBe('2026-07-24')
  })
})

describe('utcDayNumber', () => {
  it('mapeia 1=Segunda … 7=Domingo em UTC', () => {
    expect(utcDayNumber(new Date('2026-07-20T12:00:00Z'))).toBe(1) // segunda
    expect(utcDayNumber(new Date('2026-07-24T12:00:00Z'))).toBe(5) // sexta
    expect(utcDayNumber(new Date('2026-07-25T12:00:00Z'))).toBe(6) // sábado
    expect(utcDayNumber(new Date('2026-07-26T12:00:00Z'))).toBe(7) // domingo
  })

  it('usa o dia UTC, não o local', () => {
    // 26/jul 01h UTC ainda é domingo em UTC, independente do fuso do servidor
    expect(utcDayNumber(new Date('2026-07-26T01:00:00Z'))).toBe(7)
  })
})

describe('isWithinDateWindow', () => {
  const now = new Date('2026-07-24T12:00:00Z')

  it('aceita hoje, ontem e até 30 dias atrás', () => {
    expect(isWithinDateWindow('2026-07-24', now)).toBe(true)
    expect(isWithinDateWindow('2026-07-23', now)).toBe(true)
    expect(isWithinDateWindow('2026-06-24', now)).toBe(true) // exatamente -30
  })

  it('aceita amanhã (fusos à frente do UTC)', () => {
    expect(isWithinDateWindow('2026-07-25', now)).toBe(true)
  })

  it('rejeita depois de amanhã e mais de 30 dias atrás', () => {
    expect(isWithinDateWindow('2026-07-26', now)).toBe(false)
    expect(isWithinDateWindow('2026-06-23', now)).toBe(false)
  })

  it('rejeita datas inválidas de calendário', () => {
    expect(isWithinDateWindow('2026-02-30', now)).toBe(false)
    expect(isWithinDateWindow('2026-13-01', now)).toBe(false)
  })
})

describe('completedOnDate', () => {
  it('null nunca conta como concluída', () => {
    expect(completedOnDate(null, '2026-07-24', -180)).toBe(false)
  })

  it('conclusão às 23h BRT conta no dia local, não no dia UTC', () => {
    // 23h BRT de 24/07 = 02h UTC de 25/07
    const at = '2026-07-25T02:00:00.000Z'
    expect(completedOnDate(at, '2026-07-24', -180)).toBe(true)
    expect(completedOnDate(at, '2026-07-25', -180)).toBe(false)
  })

  it('offset 0 compara direto em UTC', () => {
    expect(completedOnDate('2026-07-24T10:00:00Z', '2026-07-24', 0)).toBe(true)
    expect(completedOnDate('2026-07-24T10:00:00Z', '2026-07-23', 0)).toBe(false)
  })

  it('aceita timestamp do Postgres sem T/Z (ex: "2026-07-25 02:00:00+00")', () => {
    expect(completedOnDate('2026-07-25 02:00:00+00', '2026-07-24', -180)).toBe(true)
  })

  it('conclusão de semana anterior não conta hoje (reset semanal derivado)', () => {
    expect(completedOnDate('2026-07-17T15:00:00Z', '2026-07-24', -180)).toBe(false)
  })
})
