// Env vars dummy para os testes: shared/env.ts valida no import e lança se
// faltarem. Os testes unitários não tocam serviços externos.
process.env.SUPABASE_URL ??= 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY ??= 'test-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
process.env.OPENAI_API_KEY ??= 'test-key'
