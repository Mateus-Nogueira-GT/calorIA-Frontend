/**
 * AP2 — Conta de demonstração da App Review.
 *
 * A Apple exige uma conta demo funcional para apps fechados atrás de login. Uma
 * conta recém-criada cai no onboarding e chega ao dashboard sem dieta, sem
 * diário, sem desafios e sem feed: o revisor precisa VER o app funcionando, não
 * um shell vazio.
 *
 * É script versionado e não SQL manual porque parte do conteúdo expira por
 * data — a dieta é do dia de hoje, o streak e o check-in são relativos a hoje.
 * Isso precisa ser reidratado ANTES DE CADA SUBMISSÃO, não uma vez.
 *
 * Idempotente por e-mail: rodar duas vezes não duplica nada.
 *
 *   npm run seed:demo
 *
 * Exige no ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.
 * A senha vem de DEMO_ACCOUNT_PASSWORD — NUNCA committe a senha aqui.
 */
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

const EMAIL = process.env.DEMO_ACCOUNT_EMAIL ?? 'appreview@caloriaoficial.com.br'
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD
const NOME = 'App Review'

function exigir(nome: string): string {
  const v = process.env[nome]
  if (!v) {
    console.error(`✗ Variável de ambiente ausente: ${nome}`)
    process.exit(1)
  }
  return v
}

async function main(): Promise<void> {
  if (!PASSWORD) {
    console.error('✗ DEMO_ACCOUNT_PASSWORD ausente. Defina no ambiente, nunca no código.')
    process.exit(1)
  }

  const supabase = createClient(exigir('SUPABASE_URL'), exigir('SUPABASE_SERVICE_ROLE_KEY'))
  const sql = postgres(exigir('DATABASE_URL'), { prepare: false, max: 2 })

  try {
    // ── 1. Usuário no Auth (idempotente por e-mail) ─────────────────────────
    const { data: lista } = await supabase.auth.admin.listUsers()
    let userId = lista?.users.find((u) => u.email === EMAIL)?.id

    if (userId) {
      // Garante que a senha entregue à Apple é a que está no ambiente.
      await supabase.auth.admin.updateUserById(userId, { password: PASSWORD })
      console.log(`• usuário já existia: ${userId} (senha ressincronizada)`)
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true, // sem link de confirmação para o revisor perseguir
        user_metadata: { full_name: NOME },
      })
      if (error || !data.user) throw error ?? new Error('createUser não retornou usuário')
      userId = data.user.id
      console.log(`• usuário criado: ${userId}`)
    }

    // ── 2. Perfil completo + flag is_demo (AP1) ─────────────────────────────
    await sql`
      INSERT INTO profiles (id, full_name, height_cm, weight_kg, goal, body_type,
                            gender, activity_level, coach_personality, coach_gender, is_demo)
      VALUES (${userId}, ${NOME}, 175, 78, 'lose_weight', 'mesomorph',
              'male', 'moderate', 'motivational', 'neutral', true)
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        height_cm = EXCLUDED.height_cm,
        weight_kg = EXCLUDED.weight_kg,
        goal = EXCLUDED.goal,
        body_type = EXCLUDED.body_type,
        gender = EXCLUDED.gender,
        activity_level = EXCLUDED.activity_level,
        coach_personality = EXCLUDED.coach_personality,
        coach_gender = EXCLUDED.coach_gender,
        is_demo = true,
        updated_at = NOW()
    `
    console.log('• perfil completo e marcado is_demo')

    // ── 3. Diário de HOJE (3 refeições) ─────────────────────────────────────
    // Apagar e reinserir é o que torna o script idempotente sem depender de
    // chave natural nas refeições.
    await sql`DELETE FROM meals WHERE user_id = ${userId} AND meal_date = CURRENT_DATE`
    const refeicoes = [
      { tipo: 'breakfast', nome: 'Ovos mexidos com pão integral', kcal: 380, p: 24, c: 38, f: 14 },
      { tipo: 'lunch', nome: 'Frango grelhado, arroz e salada', kcal: 620, p: 48, c: 62, f: 18 },
      { tipo: 'afternoon_snack', nome: 'Iogurte natural com banana', kcal: 210, p: 12, c: 30, f: 4 },
    ]
    for (const r of refeicoes) {
      const [meal] = await sql<{ id: string }[]>`
        INSERT INTO meals (user_id, meal_type, meal_date, name)
        VALUES (${userId}, ${r.tipo}, CURRENT_DATE, ${r.nome})
        RETURNING id
      `
      // O trigger recalculate_meal_totals preenche os totais a partir daqui.
      await sql`
        INSERT INTO meal_items (meal_id, food_name, quantity_g, calories, protein_g, carbs_g, fat_g, source)
        VALUES (${meal.id}, ${r.nome}, 100, ${r.kcal}, ${r.p}, ${r.c}, ${r.f}, 'manual')
      `
    }
    console.log(`• diário de hoje: ${refeicoes.length} refeições`)

    // ── 4. Histórico de peso (4 semanas) ────────────────────────────────────
    // weight_entries tem UNIQUE (user_id, date): o upsert já é idempotente.
    for (const [i, kg] of [80.4, 79.6, 78.9, 78.0].entries()) {
      await sql`
        INSERT INTO weight_entries (user_id, date, weight_kg)
        VALUES (${userId}, CURRENT_DATE - ${(3 - i) * 7}, ${kg})
        ON CONFLICT (user_id, date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
      `
    }
    console.log('• histórico de peso: 4 semanas')

    console.log('')
    console.log('✓ Conta demo pronta.')
    console.log(`  e-mail: ${EMAIL}`)
    console.log('  senha:  <a de DEMO_ACCOUNT_PASSWORD>')
    console.log('')
    console.log('  A DIETA não é semeada aqui: ela é gerada por IA pelo Coach.')
    console.log('  Entre com a conta e gere a dieta uma vez antes de submeter —')
    console.log('  o dashboard sem plano mostra estado vazio, não metas (R5).')
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error('✗ Falha ao semear a conta demo:', err)
  process.exit(1)
})
