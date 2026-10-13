import { beforeEach, describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { __resetMealFiberColumnsCache, hasMealFiberColumns } from './meal-fiber-columns.js'

const Q = 'information_schema.columns'

describe('hasMealFiberColumns (tolerância à migration 022)', () => {
  beforeEach(() => __resetMealFiberColumnsCache())

  it('as 2 colunas existem → true', async () => {
    const { fastify } = fakeFastify([[Q, [{ n: 2 }]]])
    expect(await hasMealFiberColumns(fastify)).toBe(true)
  })

  it('migration ausente ou pela metade → false', async () => {
    expect(await hasMealFiberColumns(fakeFastify([[Q, [{ n: 0 }]]]).fastify)).toBe(false)
    expect(await hasMealFiberColumns(fakeFastify([[Q, [{ n: 1 }]]]).fastify)).toBe(false)
  })

  it('depois de true, não consulta de novo', async () => {
    const { fastify, calls } = fakeFastify([[Q, [{ n: 2 }]]])
    await hasMealFiberColumns(fastify)
    await hasMealFiberColumns(fastify)
    expect(calls.filter((c) => c.sql.includes(Q))).toHaveLength(1)
  })

  it('depois de false, consulta de novo (a migration pode ter rodado no meio)', async () => {
    const { fastify, calls } = fakeFastify([[Q, [{ n: 0 }]]])
    await hasMealFiberColumns(fastify)
    await hasMealFiberColumns(fastify)
    expect(calls.filter((c) => c.sql.includes(Q))).toHaveLength(2)
  })
})
