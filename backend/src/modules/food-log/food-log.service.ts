import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { isWithinDateWindow } from '../../shared/local-date.js'
import type { AddMealBody, Meal } from './food-log.schemas.js'

/**
 * Refeições do "diário livre" são modeladas como uma linha em `meals` com um
 * único `meal_item` (sem vínculo com a tabela `foods`) — os totais da refeição
 * (recalculados pelo trigger de meal_items) acabam batendo 1:1 com os valores
 * enviados pelo usuário.
 */

/** App usa 4 grupos; o banco tem 6 tipos + other — traduz nos dois sentidos. */
type AppMealType = Meal['mealType']

function toDbMealType(t: AppMealType): string {
  return t === 'snack' ? 'afternoon_snack' : t
}

export function toApiMealType(db: string): AppMealType {
  if (db === 'morning_snack' || db === 'afternoon_snack') return 'snack'
  if (db === 'supper') return 'dinner'
  if (db === 'breakfast' || db === 'lunch' || db === 'dinner' || db === 'snack') return db
  return 'other'
}

export async function listMeals(
  fastify: FastifyInstance,
  userId: string,
  date: string,
): Promise<Meal[]> {
  const rows = await fastify.db<
    {
      id: string
      name: string | null
      meal_type: string
      total_calories: string
      total_protein: string
      total_carbs: string
      total_fat: string
      logged_at: string
    }[]
  >`
    SELECT
      id, name, meal_type,
      total_calories, total_protein, total_carbs, total_fat,
      logged_at::TEXT AS logged_at
    FROM meals
    WHERE user_id = ${userId} AND meal_date = ${date}
    ORDER BY logged_at ASC
  `

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? '',
    calories: Number(row.total_calories),
    protein: Number(row.total_protein),
    carbs: Number(row.total_carbs),
    fat: Number(row.total_fat),
    loggedAt: row.logged_at,
    mealType: toApiMealType(row.meal_type),
  }))
}

export async function addMeal(
  fastify: FastifyInstance,
  userId: string,
  data: AddMealBody,
): Promise<Meal> {
  if (data.date && !isWithinDateWindow(data.date)) {
    throw new AppError(400, 'INVALID_DATE', 'Data fora da janela permitida')
  }

  return fastify.db.begin(async (sql) => {
    // Data local do cliente quando presente; CURRENT_DATE (UTC) como fallback
    const [meal] = await sql<{ id: string; logged_at: string }[]>`
      INSERT INTO meals (user_id, meal_type, meal_date, name)
      VALUES (${userId}, ${toDbMealType(data.mealType)},
              COALESCE(${data.date ?? null}::date, CURRENT_DATE), ${data.name})
      RETURNING id, logged_at::TEXT AS logged_at
    `

    await sql`
      INSERT INTO meal_items (meal_id, food_name, quantity_g, calories, protein_g, carbs_g, fat_g, source)
      VALUES (${meal.id}, ${data.name}, 100, ${data.calories}, ${data.protein}, ${data.carbs}, ${data.fat}, 'manual')
    `

    return {
      id: meal.id,
      name: data.name,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      loggedAt: meal.logged_at,
      mealType: data.mealType,
    }
  })
}

export async function deleteMeal(
  fastify: FastifyInstance,
  userId: string,
  mealId: string,
): Promise<void> {
  const result = await fastify.db`
    DELETE FROM meals WHERE id = ${mealId} AND user_id = ${userId}
  `
  if (result.count === 0) throw new AppError(404, 'MEAL_NOT_FOUND', 'Refeição não encontrada')
}
