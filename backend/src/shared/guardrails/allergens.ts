import type { AiSingleDay } from '../diet-ai-schema.js'

/**
 * Checagem pós-geração de alérgenos e restrições (O1 da spec de guardrails).
 * "Alergias (EVITAR): amendoim" no prompt é pedido, não garantia — um escorregão
 * do modelo persistia amendoim no lanche de quem é alérgico, sem ninguém conferir.
 *
 * Tudo aqui é texto normalizado (minúsculo, sem acento, sem pontuação). Os
 * mapas são constantes exportadas: ampliar sinônimos não exige tocar a lógica.
 */

export function normalizeFoodText(s: string): string {
  const nfd = s.normalize('NFD')
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: marcas diacríticas pós-NFD
  const semAcento = nfd.replace(/[\u0300-\u036f]/g, '')
  return semAcento
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MEATS = [
  'carne',
  'bife',
  'boi',
  'frango',
  'peru',
  'porco',
  'bacon',
  'linguica',
  'presunto',
  'salsicha',
  'hamburguer',
  'patinho',
  'alcatra',
  'picanha',
  'peito de frango',
  'coxa',
  'sobrecoxa',
  'costela',
]
const FISH = [
  'peixe',
  'tilapia',
  'salmao',
  'salmoes',
  'atum',
  'sardinha',
  'bacalhau',
  'merluza',
  'pescada',
  'camarao',
  'camaroes',
  'frutos do mar',
  'marisco',
  'lula',
  'polvo',
]
const DAIRY = [
  'leite',
  'queijo',
  'iogurte',
  'requeijao',
  'requeijoes',
  'manteiga',
  'creme de leite',
  'coalhada',
  'ricota',
  'whey',
]
const EGGS = ['ovo', 'ovos', 'omelete', 'maionese', 'gema', 'clara']
const GLUTEN = [
  'gluten',
  'trigo',
  'pao',
  'paes',
  'macarrao',
  'macarroes',
  'cevada',
  'centeio',
  'farinha de trigo',
  'biscoito',
  'bolacha',
  'torrada',
  'bolo',
  'lasanha',
  'pizza',
]

/** Alérgeno canônico → termos que o caracterizam (todos já normalizados). */
export const ALLERGEN_SYNONYMS: Record<string, string[]> = {
  amendoim: ['amendoim', 'amendoins', 'peanut', 'pasta de amendoim', 'pacoca'],
  leite: [...DAIRY, 'lactose'],
  camarao: [
    'camarao',
    'camaroes',
    'frutos do mar',
    'marisco',
    'lagosta',
    'siri',
    'caranguejo',
    'lula',
    'polvo',
    'mexilhao',
    'mexilhoes',
    'ostra',
  ],
  gluten: GLUTEN,
  ovo: EGGS,
  soja: ['soja', 'tofu', 'shoyu', 'edamame', 'misso', 'proteina de soja'],
  castanha: [
    'castanha',
    'castanhas',
    'nozes',
    'noz',
    'amendoa',
    'amendoas',
    'avela',
    'pistache',
    'macadamia',
    'caju',
    'pecan',
  ],
  peixe: [
    'peixe',
    'tilapia',
    'salmao',
    'salmoes',
    'atum',
    'sardinha',
    'bacalhau',
    'merluza',
    'pescada',
  ],
}

/** Restrição (por radical, casa "vegano"/"vegana") → termos proibidos. */
export const RESTRICTION_RULES: { stems: string[]; forbidden: string[] }[] = [
  { stems: ['vegan'], forbidden: [...MEATS, ...FISH, ...EGGS, ...DAIRY, 'mel'] },
  { stems: ['vegetarian'], forbidden: [...MEATS, ...FISH] },
  { stems: ['gluten'], forbidden: GLUTEN },
  { stems: ['lactose'], forbidden: DAIRY },
  {
    stems: ['carne vermelha'],
    forbidden: [
      'carne',
      'bife',
      'boi',
      'patinho',
      'alcatra',
      'picanha',
      'porco',
      'bacon',
      'linguica',
      'presunto',
      'costela',
    ],
  },
]

/**
 * Termo → frases em que ele NÃO indica o alérgeno. "leite de coco" não é leite;
 * "noz moscada" não é noz. Vale para alergias e restrições.
 */
export const SAFE_PHRASES: Record<string, string[]> = {
  leite: [
    'leite de coco',
    'leite de amendoa',
    'leite de amendoas',
    'leite de aveia',
    'leite de soja',
    'leite de castanha',
    'leite de arroz',
    'leite vegetal',
  ],
  queijo: ['queijo vegano', 'queijo de castanha'],
  iogurte: ['iogurte vegetal', 'iogurte de coco'],
  manteiga: ['manteiga de amendoim', 'manteiga de castanha'],
  noz: ['noz moscada'],
  gluten: ['sem gluten', 'zero gluten'],
  pao: ['pao sem gluten', 'pao de queijo'],
  paes: ['paes sem gluten', 'paes de queijo'],
  macarrao: ['macarrao sem gluten', 'macarrao de arroz', 'macarrao de abobrinha'],
  macarroes: ['macarroes sem gluten', 'macarroes de arroz', 'macarroes de abobrinha'],
  carne: ['carne de soja', 'carne vegetal'],
  hamburguer: ['hamburguer de soja', 'hamburguer vegetal', 'hamburguer de grao de bico'],
}

/** Só para a RESTRIÇÃO "sem lactose" (não para alergia a leite, que é à proteína). */
const LACTOSE_FREE_PHRASES = ['sem lactose', 'zero lactose']

export interface AllergenViolation {
  mealIndex: number
  itemIndex: number
  field: 'food_name' | 'preparation_tip'
  matched: string
  source: string
}

interface Rule {
  source: string
  terms: string[]
  lactoseFreeOk: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Casa o termo no INÍCIO de uma palavra: "pao" pega "paozinho", "ovo" não pega "novo". */
function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(term)}`).test(text)
}

function allergyRule(allergy: string): Rule {
  const n = normalizeFoodText(allergy)
  const terms = new Set<string>()
  if (n.length >= 3) terms.add(n)
  for (const [key, syns] of Object.entries(ALLERGEN_SYNONYMS)) {
    if (n === key || syns.includes(n) || n.includes(key)) {
      terms.add(key)
      for (const s of syns) terms.add(s)
    }
  }
  return { source: allergy, terms: [...terms], lactoseFreeOk: false }
}

function restrictionRules(restriction: string): Rule[] {
  const n = normalizeFoodText(restriction)
  return RESTRICTION_RULES.filter((r) => r.stems.some((stem) => n.includes(stem))).map((r) => ({
    source: restriction,
    terms: r.forbidden,
    lactoseFreeOk: r.stems.includes('lactose'),
  }))
}

function isSafeUse(text: string, term: string, rule: Rule): boolean {
  if ((SAFE_PHRASES[term] ?? []).some((p) => text.includes(p))) return true
  if (rule.lactoseFreeOk && LACTOSE_FREE_PHRASES.some((p) => text.includes(p))) return true
  return false
}

export function checkAllergens(
  day: AiSingleDay,
  allergies: string[],
  restrictions: string[],
): AllergenViolation[] {
  const rules: Rule[] = [...allergies.map(allergyRule), ...restrictions.flatMap(restrictionRules)]
  if (rules.length === 0) return []

  const violations: AllergenViolation[] = []
  day.meals.forEach((meal, mealIndex) => {
    meal.items.forEach((item, itemIndex) => {
      const fields: [AllergenViolation['field'], string | null][] = [
        ['food_name', item.food_name],
        ['preparation_tip', item.preparation_tip],
      ]
      for (const [field, raw] of fields) {
        if (!raw) continue
        const text = normalizeFoodText(raw)
        for (const rule of rules) {
          const hit = rule.terms.find((t) => containsTerm(text, t) && !isSafeUse(text, t, rule))
          if (hit) {
            violations.push({ mealIndex, itemIndex, field, matched: hit, source: rule.source })
            break // uma violação por campo basta para rejeitar o dia
          }
        }
      }
    })
  })
  return violations
}
