import { describe, expect, it } from 'vitest'
import type { AiSingleDay } from '../diet-ai-schema.js'
import { checkAllergens, normalizeFoodText } from './allergens.js'

function dayWith(...foods: (string | { name: string; tip: string })[]): AiSingleDay {
  return {
    day_name: 'Segunda',
    meals: [
      {
        meal_type: 'lunch',
        name: 'Almoço',
        time_suggestion: '12:00',
        total_calories: 100,
        items: foods.map((f) => ({
          food_name: typeof f === 'string' ? f : f.name,
          quantity_g: 100,
          unit: 'g',
          calories: 100,
          protein_g: 5,
          carbs_g: 10,
          fat_g: 2,
          preparation_tip: typeof f === 'string' ? null : f.tip,
        })),
      },
    ],
  }
}

describe('normalizeFoodText', () => {
  it('minúsculas, sem acento, sem pontuação, espaços únicos', () => {
    expect(normalizeFoodText('  Pão de Queijo, c/ Requeijão!  ')).toBe('pao de queijo c requeijao')
  })
})

describe('checkAllergens (O1)', () => {
  it('sem alergias nem restrições: nada', () => {
    expect(checkAllergens(dayWith('Pasta de amendoim'), [], [])).toEqual([])
  })

  it('match direto no nome do alimento', () => {
    const v = checkAllergens(dayWith('Arroz', 'Pasta de amendoim'), ['amendoim'], [])
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({
      mealIndex: 0,
      itemIndex: 1,
      field: 'food_name',
      source: 'amendoim',
    })
  })

  it('match por sinônimo (leite → iogurte)', () => {
    const v = checkAllergens(dayWith('Iogurte natural'), ['leite'], [])
    expect(v).toHaveLength(1)
    expect(v[0].matched).toBe('iogurte')
  })

  it('acentos não escondem o alérgeno (camarão)', () => {
    const v = checkAllergens(dayWith('Camarão grelhado', 'Mix de frutos do mar'), ['Camarão'], [])
    expect(v).toHaveLength(2)
  })

  it('também olha o preparation_tip', () => {
    const v = checkAllergens(
      dayWith({ name: 'Salada', tip: 'finalize com amendoim torrado' }),
      ['amendoim'],
      [],
    )
    expect(v).toHaveLength(1)
    expect(v[0].field).toBe('preparation_tip')
  })

  it('restrição vegana proíbe carne, frango, peixe, ovo e laticínios', () => {
    const v = checkAllergens(
      dayWith('Peito de frango', 'Ovos mexidos', 'Tofu grelhado', 'Queijo minas'),
      [],
      ['vegana'],
    )
    expect(v.map((x) => x.itemIndex).sort()).toEqual([0, 1, 3])
  })

  it('restrição vegetariana proíbe carnes e peixes, mas não ovo/leite', () => {
    const v = checkAllergens(dayWith('Tilápia', 'Ovos mexidos', 'Iogurte'), [], ['vegetariano'])
    expect(v).toHaveLength(1)
    expect(v[0].itemIndex).toBe(0)
  })

  it('exceções: leite de coco não é leite; noz-moscada não é noz', () => {
    expect(checkAllergens(dayWith('Leite de coco'), ['leite'], [])).toEqual([])
    expect(checkAllergens(dayWith('Frango com noz-moscada'), ['nozes'], [])).toEqual([])
  })

  it('"sem lactose" aceita leite sem lactose; alergia a leite NÃO aceita', () => {
    expect(checkAllergens(dayWith('Leite sem lactose'), [], ['sem lactose'])).toEqual([])
    expect(checkAllergens(dayWith('Leite sem lactose'), ['leite'], [])).toHaveLength(1)
  })

  it('prefixo de palavra: "pao" pega "paozinho", mas "ovo" não pega "novo"', () => {
    expect(checkAllergens(dayWith('Pãozinho integral'), [], ['sem glúten'])).toHaveLength(1)
    expect(checkAllergens(dayWith('Arroz novo'), ['ovo'], [])).toEqual([])
  })

  it('plural irregular em -ões pega o singular normalizado (camarão → camarões)', () => {
    const v = checkAllergens(dayWith('Camarões grelhados'), ['camarão'], [])
    expect(v).toHaveLength(1)
    expect(v[0].matched).toBe('camaroes')
  })

  it('plural irregular "pães" é pego pela restrição sem glúten', () => {
    const v = checkAllergens(dayWith('Pães integrais'), [], ['sem glúten'])
    expect(v).toHaveLength(1)
    expect(v[0].matched).toBe('paes')
  })

  it('"pães sem glúten" continua seguro (o plural herda a exceção do singular)', () => {
    expect(checkAllergens(dayWith('Pães sem glúten'), [], ['sem glúten'])).toEqual([])
  })

  it('plural irregular "requeijões" pega alergia a leite', () => {
    const v = checkAllergens(dayWith('Torrada com requeijões'), ['leite'], [])
    expect(v).toHaveLength(1)
    expect(v[0].matched).toBe('requeijoes')
  })
})
