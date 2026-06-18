import fp from 'fastify-plugin'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FastifyPluginAsync } from 'fastify'
import { env } from '../shared/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** Cliente admin (service_role) — bypassa RLS. Use só no backend. */
    supabase: SupabaseClient
    /** Cliente público (anon key) — para operações de auth (signIn, refresh). */
    supabaseAuth: SupabaseClient
  }
}

const supabasePlugin: FastifyPluginAsync = fp(async (fastify) => {
  // Admin client: operações que precisam bypassar RLS (criação de usuário, etc.)
  const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Auth client: operações de autenticação padrão
  const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  fastify.decorate('supabase', supabaseAdmin)
  fastify.decorate('supabaseAuth', supabaseAuth)

  fastify.log.info('✅  Supabase conectado')
})

export default supabasePlugin
