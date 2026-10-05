import { beforeEach, describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { __resetFiberColumnsCache, hasFiberColumns } from './fiber-columns.js'

const Q = 'information_schema.columns'

describe('hasFiberColumns (tolerância à migration 020)', () => {
  beforeEach(() => __resetFiberColumnsCache())

  it('as 3 colunas existem → true', async () => {
    const { fastify, calls } = fakeFastify([[Q, [{ n: 3 }]]])
    expect(await hasFiberColumns(fastify)).toBe(true)
    expect(calls.filter((c) => c.sql.includes(Q))).toHaveLength(1)
  })

  it('nenhuma coluna → false', async () => {
    const { fastify } = fakeFastify([[Q, [{ n: 0 }]]])
    expect(await hasFiberColumns(fastify)).toBe(false)
  })

  it('migration aplicada pela metade (2 de 3) → false', async () => {
    const { fastify } = fakeFastify([[Q, [{ n: 2 }]]])
    expect(await hasFiberColumns(fastify)).toBe(false)
  })

  it('depois de true, não consulta de novo', async () => {
    const { fastify, calls } = fakeFastify([[Q, [{ n: 3 }]]])
    await hasFiberColumns(fastify)
    expect(await hasFiberColumns(fastify)).toBe(true)
    expect(calls.filter((c) => c.sql.includes(Q))).toHaveLength(1)
  })

  it('depois de false, consulta de novo (a migration pode ter rodado no meio)', async () => {
    const before = fakeFastify([[Q, [{ n: 0 }]]])
    expect(await hasFiberColumns(before.fastify)).toBe(false)
    expect(await hasFiberColumns(before.fastify)).toBe(false)
    expect(before.calls.filter((c) => c.sql.includes(Q))).toHaveLength(2)

    const after = fakeFastify([[Q, [{ n: 3 }]]])
    expect(await hasFiberColumns(after.fastify)).toBe(true)
  })
})
