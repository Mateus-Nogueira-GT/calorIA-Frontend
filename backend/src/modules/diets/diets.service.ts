import type { FastifyInstance } from 'fastify'
import type { AiDietPlan, CollectedUserData } from '../../shared/diet-ai-schema.js'
import { AppError } from '../../shared/errors.js'
import { createSystemPost } from '../feed/feed.service.js'
import type {
  Diet,
  DietDay,
  DietMeal,
  DietWithDays,
  ReplaceDietItemBody,
  TodayPlan,
  PlannedMealType,
} from './diets.schemas.js'
import { randomUUID } from 'node:crypto'

/** Mapeia os 6 tipos de refeição do banco para os 4 do app (lanches viram 'snack'). */
export function toPlannedMealType(mealType: string): PlannedMealType {
  if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') return mealType
  return 'snack'
}

// ─── Tipos internos de DB ─────────────────────────────────────────────────────

interface DbDietItem {
  id: string
  diet_meal_id: string
  food_name: string
  quantity_g: number
  unit: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  preparation_tip: string | null
  is_substitution: boolean
  sort_order: number
}

interface DbDietMeal {
  id: string
  diet_day_id: string
  meal_type: string
  name: string
  time_suggestion: string | null
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  is_completed: boolean
  completed_at: string | null
  sort_order: number
}

interface DbDietDay {
  id: string
  diet_id: string
  day_number: number
  day_name: string
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
}

// ─── Persistência da dieta gerada pela IA ────────────────────────────────────

/**
 * Salva no banco a dieta gerada pela IA.
 * Insere diets → diet_days → diet_meals → diet_items em transação.
 */
export async function saveDietToDb(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  userData: CollectedUserData,
  dietPlan: AiDietPlan,
): Promise<string> {
  const dietId = randomUUID()

  await fastify.db.begin(async (sql) => {
    // Arquiva dieta ativa anterior
    await sql`
      UPDATE diets SET status = 'replaced', updated_at = NOW()
      WHERE user_id = ${userId} AND status = 'active'
    `

    // Insere dieta
    await sql`
      INSERT INTO diets (
        id, user_id, conversation_id,
        name, description,
        user_weight_kg, user_height_cm, user_age, user_gender, user_goal, user_activity_level,
        tdee_calories, target_calories, target_protein_g, target_carbs_g, target_fat_g,
        status, ai_model
      ) VALUES (
        ${dietId}, ${userId}, ${conversationId},
        ${dietPlan.name}, ${dietPlan.description},
        ${userData.weight_kg}, ${userData.height_cm}, ${userData.age},
        ${userData.gender}, ${userData.goal}, ${userData.activity_level},
        ${dietPlan.tdee_calories}, ${dietPlan.target_calories},
        ${dietPlan.target_protein_g}, ${dietPlan.target_carbs_g}, ${dietPlan.target_fat_g},
        'active', 'gpt-4o'
      )
    `

    for (const day of dietPlan.days) {
      const dayId = randomUUID()

      await sql`
        INSERT INTO diet_days (id, diet_id, day_number, day_name, total_calories, total_protein, total_carbs, total_fat)
        VALUES (${dayId}, ${dietId}, ${day.day_number}, ${day.day_name},
                ${day.total_calories}, ${day.total_protein}, ${day.total_carbs}, ${day.total_fat})
      `

      for (let mealIdx = 0; mealIdx < day.meals.length; mealIdx++) {
        const meal = day.meals[mealIdx]
        const mealId = randomUUID()

        await sql`
          INSERT INTO diet_meals (id, diet_day_id, meal_type, name, time_suggestion,
                                  total_calories, total_protein, total_carbs, total_fat, sort_order)
          VALUES (${mealId}, ${dayId}, ${meal.meal_type}, ${meal.name}, ${meal.time_suggestion},
                  ${meal.total_calories}, ${meal.items.reduce((s, i) => s + i.protein_g, 0)},
                  ${meal.items.reduce((s, i) => s + i.carbs_g, 0)},
                  ${meal.items.reduce((s, i) => s + i.fat_g, 0)}, ${mealIdx})
        `

        for (let itemIdx = 0; itemIdx < meal.items.length; itemIdx++) {
          const item = meal.items[itemIdx]
          await sql`
            INSERT INTO diet_items (id, diet_meal_id, food_name, quantity_g, unit,
                                    calories, protein_g, carbs_g, fat_g, preparation_tip, sort_order)
            VALUES (${randomUUID()}, ${mealId}, ${item.food_name}, ${item.quantity_g}, ${item.unit},
                    ${item.calories}, ${item.protein_g}, ${item.carbs_g}, ${item.fat_g},
                    ${item.preparation_tip}, ${itemIdx})
          `
        }
      }
    }

    // Atualiza chat_history com a dieta gerada
    await sql`
      UPDATE chat_history
      SET status = 'completed', diet_id = ${dietId}, updated_at = NOW()
      WHERE id = ${conversationId}
    `

    // Atualiza streak do usuário
    await sql`SELECT update_user_streak(${userId})`
  })

  return dietId
}

// ─── Consultas ────────────────────────────────────────────────────────────────

/** Retorna a dieta ativa do usuário sem os dias (só o cabeçalho). */
export async function getActiveDiet(fastify: FastifyInstance, userId: string): Promise<Diet> {
  const [diet] = await fastify.db<Diet[]>`
    SELECT
      id, user_id, name, description, user_goal,
      tdee_calories, target_calories,
      target_protein_g, target_carbs_g, target_fat_g,
      status,
      created_at::TEXT AS created_at,
      updated_at::TEXT AS updated_at
    FROM diets
    WHERE user_id = ${userId} AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `

  if (!diet)
    throw new AppError(
      404,
      'NO_ACTIVE_DIET',
      'Nenhuma dieta ativa encontrada. Converse com a IA para gerar uma!',
    )

  return diet
}

/** Retorna uma dieta completa com todos os dias, refeições e itens. */
export async function getDietWithDays(
  fastify: FastifyInstance,
  userId: string,
  dietId: string,
): Promise<DietWithDays> {
  const [diet] = await fastify.db<Diet[]>`
    SELECT
      id, user_id, name, description, user_goal,
      tdee_calories, target_calories,
      target_protein_g, target_carbs_g, target_fat_g,
      status,
      created_at::TEXT AS created_at,
      updated_at::TEXT AS updated_at
    FROM diets
    WHERE id = ${dietId} AND user_id = ${userId}
  `
  if (!diet) throw new AppError(404, 'DIET_NOT_FOUND', 'Dieta não encontrada')

  const dbDays = await fastify.db<DbDietDay[]>`
    SELECT id, diet_id, day_number, day_name,
           total_calories, total_protein, total_carbs, total_fat
    FROM diet_days
    WHERE diet_id = ${dietId}
    ORDER BY day_number
  `

  const days: DietDay[] = []

  for (const dbDay of dbDays) {
    const dbMeals = await fastify.db<DbDietMeal[]>`
      SELECT id, diet_day_id, meal_type, name, time_suggestion,
             total_calories, total_protein, total_carbs, total_fat,
             is_completed, completed_at::TEXT AS completed_at, sort_order
      FROM diet_meals
      WHERE diet_day_id = ${dbDay.id}
      ORDER BY sort_order
    `

    const meals: DietMeal[] = []
    for (const dbMeal of dbMeals) {
      const items = await fastify.db<DbDietItem[]>`
        SELECT id, diet_meal_id, food_name, quantity_g, unit,
               calories, protein_g, carbs_g, fat_g,
               preparation_tip, is_substitution, sort_order
        FROM diet_items
        WHERE diet_meal_id = ${dbMeal.id}
          AND is_substitution = FALSE
        ORDER BY sort_order
      `
      meals.push({ ...dbMeal, items } as unknown as DietMeal)
    }

    days.push({ ...dbDay, meals })
  }

  return { ...diet, days }
}

/** Retorna só o dia atual da dieta ativa (para a tela principal). */
export async function getTodayDiet(fastify: FastifyInstance, userId: string): Promise<DietDay> {
  const diet = await getActiveDiet(fastify, userId)

  // Dia da semana: 1=Segunda, 2=Terça, ..., 7=Domingo
  const todayDayNumber = ((new Date().getDay() + 6) % 7) + 1

  const [dbDay] = await fastify.db<DbDietDay[]>`
    SELECT id, diet_id, day_number, day_name,
           total_calories, total_protein, total_carbs, total_fat
    FROM diet_days
    WHERE diet_id = ${diet.id}
      AND day_number = ${todayDayNumber}
  `

  if (!dbDay) throw new AppError(404, 'DIET_DAY_NOT_FOUND', 'Dia da dieta não encontrado')

  const dbMeals = await fastify.db<DbDietMeal[]>`
    SELECT id, diet_day_id, meal_type, name, time_suggestion,
           total_calories, total_protein, total_carbs, total_fat,
           is_completed, completed_at::TEXT AS completed_at, sort_order
    FROM diet_meals
    WHERE diet_day_id = ${dbDay.id}
    ORDER BY sort_order
  `

  const meals: DietMeal[] = []
  for (const dbMeal of dbMeals) {
    const items = await fastify.db<DbDietItem[]>`
      SELECT id, diet_meal_id, food_name, quantity_g, unit,
             calories, protein_g, carbs_g, fat_g,
             preparation_tip, is_substitution, sort_order
      FROM diet_items
      WHERE diet_meal_id = ${dbMeal.id}
        AND is_substitution = FALSE
      ORDER BY sort_order
    `
    meals.push({ ...dbMeal, items } as unknown as DietMeal)
  }

  return { ...dbDay, meals }
}

/**
 * Dia atual da dieta no formato camelCase consumido pelo dashboard (DietPlan).
 * Retorna null (em vez de 404) quando não há dieta ativa, para o front
 * distinguir "sem dieta" de erro.
 */
export async function getTodayPlan(
  fastify: FastifyInstance,
  userId: string,
): Promise<TodayPlan | null> {
  let diet: Diet
  try {
    diet = await getActiveDiet(fastify, userId)
  } catch {
    return null
  }

  const todayDayNumber = ((new Date().getDay() + 6) % 7) + 1
  const today = new Date().toISOString().slice(0, 10)

  const [dbDay] = await fastify.db<DbDietDay[]>`
    SELECT id, diet_id, day_number, day_name,
           total_calories, total_protein, total_carbs, total_fat
    FROM diet_days
    WHERE diet_id = ${diet.id} AND day_number = ${todayDayNumber}
  `
  if (!dbDay) return null

  const dbMeals = await fastify.db<DbDietMeal[]>`
    SELECT id, diet_day_id, meal_type, name, time_suggestion,
           total_calories, total_protein, total_carbs, total_fat,
           is_completed, completed_at::TEXT AS completed_at, sort_order
    FROM diet_meals
    WHERE diet_day_id = ${dbDay.id}
    ORDER BY sort_order
  `

  // Itens de TODAS as refeições numa query só (evita N+1 por refeição).
  const mealIds = dbMeals.map((m) => m.id)
  const allItems = mealIds.length
    ? await fastify.db<(DbDietItem & { diet_meal_id: string })[]>`
        SELECT diet_meal_id, food_name, quantity_g, unit, calories
        FROM diet_items
        WHERE diet_meal_id = ANY(${mealIds}) AND is_substitution = FALSE
        ORDER BY sort_order
      `
    : []

  const meals = dbMeals.map((dbMeal) => ({
    id: dbMeal.id,
    type: toPlannedMealType(dbMeal.meal_type),
    title: dbMeal.name,
    suggestedTime: dbMeal.time_suggestion ?? '',
    items: allItems
      .filter((it) => it.diet_meal_id === dbMeal.id)
      .map((it) => ({
        name: it.food_name,
        quantity: Number(it.quantity_g),
        unit: it.unit,
        calories: Number(it.calories),
      })),
    calories: Number(dbMeal.total_calories),
    protein: Number(dbMeal.total_protein),
    carbs: Number(dbMeal.total_carbs),
    fat: Number(dbMeal.total_fat),
    completedAt: dbMeal.completed_at,
  }))

  return {
    id: dbDay.id,
    date: today,
    meals,
    totalCalories: Number(dbDay.total_calories),
    totalProtein: Number(dbDay.total_protein),
    totalCarbs: Number(dbDay.total_carbs),
    totalFat: Number(dbDay.total_fat),
    generatedAt: diet.created_at,
  }
}

// ─── Ações do usuário na dieta ────────────────────────────────────────────────

/** Marca ou desmarca uma refeição como concluída. */
export async function toggleMealCompleted(
  fastify: FastifyInstance,
  userId: string,
  mealId: string,
): Promise<{ is_completed: boolean }> {
  // Verifica que a refeição pertence ao usuário
  const [meal] = await fastify.db<{ id: string; is_completed: boolean }[]>`
    SELECT dm.id, dm.is_completed
    FROM diet_meals dm
    JOIN diet_days dd ON dd.id = dm.diet_day_id
    JOIN diets d ON d.id = dd.diet_id
    WHERE dm.id = ${mealId} AND d.user_id = ${userId}
  `

  if (!meal) throw new AppError(404, 'MEAL_NOT_FOUND', 'Refeição não encontrada')

  const newState = !meal.is_completed
  await fastify.db`
    UPDATE diet_meals
    SET is_completed = ${newState},
        completed_at = ${newState ? new Date().toISOString() : null},
        updated_at   = NOW()
    WHERE id = ${mealId}
  `

  if (newState) {
    await fastify.db`SELECT update_user_streak(${userId})`

    const [streak] = await fastify.db<{ current_streak: number }[]>`
      SELECT current_streak FROM streaks WHERE user_id = ${userId}
    `
    if (streak && streak.current_streak > 0 && streak.current_streak % 7 === 0) {
      await createSystemPost(
        fastify,
        userId,
        'streak_milestone',
        `${streak.current_streak} dias seguidos seguindo a dieta! 🔥`,
        { streak: streak.current_streak },
      )
    }
  }

  return { is_completed: newState }
}

/** Substitui um item da dieta por outro alimento escolhido pelo usuário. */
export async function replaceDietItem(
  fastify: FastifyInstance,
  userId: string,
  itemId: string,
  data: ReplaceDietItemBody,
): Promise<{ new_item_id: string }> {
  // Verifica propriedade
  const [item] = await fastify.db<{ id: string; diet_meal_id: string; sort_order: number }[]>`
    SELECT di.id, di.diet_meal_id, di.sort_order
    FROM diet_items di
    JOIN diet_meals dm ON dm.id = di.diet_meal_id
    JOIN diet_days dd ON dd.id = dm.diet_day_id
    JOIN diets d ON d.id = dd.diet_id
    WHERE di.id = ${itemId} AND d.user_id = ${userId}
  `

  if (!item) throw new AppError(404, 'ITEM_NOT_FOUND', 'Item da dieta não encontrado')

  const newItemId = randomUUID()

  await fastify.db.begin(async (sql) => {
    // Marca o item original como substituído
    await sql`UPDATE diet_items SET is_substitution = TRUE WHERE id = ${itemId}`

    // Insere o novo item como substituto
    await sql`
      INSERT INTO diet_items (
        id, diet_meal_id, food_name, quantity_g, unit,
        calories, protein_g, carbs_g, fat_g, preparation_tip,
        is_substitution, original_item_id, sort_order
      ) VALUES (
        ${newItemId}, ${item.diet_meal_id},
        ${data.food_name}, ${data.quantity_g}, ${data.unit},
        ${data.calories}, ${data.protein_g}, ${data.carbs_g}, ${data.fat_g},
        ${data.preparation_tip},
        FALSE, ${itemId}, ${item.sort_order}
      )
    `
  })

  return { new_item_id: newItemId }
}

/** Histórico de dietas do usuário (apenas cabeçalhos). */
export async function getDietHistory(fastify: FastifyInstance, userId: string): Promise<Diet[]> {
  return fastify.db<Diet[]>`
    SELECT
      id, user_id, name, description, user_goal,
      tdee_calories, target_calories,
      target_protein_g, target_carbs_g, target_fat_g,
      status,
      created_at::TEXT AS created_at,
      updated_at::TEXT AS updated_at
    FROM diets
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 20
  `
}
