import { describe, expect, it } from 'vitest'
import { escapeLikePattern } from './friends.service.js'

describe('escapeLikePattern (L7)', () => {
  it('escapa o curinga % ', () => {
    // Digitar `%%` na aba Buscar casava com todo mundo e listava 20 usuários
    // arbitrários da base.
    expect(escapeLikePattern('%%')).toBe('\\%\\%')
  })

  it('escapa o curinga _ (qualquer caractere)', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
  })

  it('escapa a própria barra invertida antes dos curingas', () => {
    // `\` é o caractere de escape do ILIKE; sem tratá-lo primeiro, um `\` do
    // usuário viraria escape de um caractere seguinte.
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
  })

  it('não altera uma busca comum', () => {
    expect(escapeLikePattern('ana.maria')).toBe('ana.maria')
  })
})
