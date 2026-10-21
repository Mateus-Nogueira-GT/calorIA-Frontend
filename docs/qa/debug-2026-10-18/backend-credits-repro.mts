/** Read-only production-code diagnostics. Destructive only to a dedicated localhost fixture DB. */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const requireBackend=createRequire(new URL('../../../backend/package.json',import.meta.url))
const postgres=requireBackend('postgres')
const url=process.env.TEST_DATABASE_URL
assert(url,'Set TEST_DATABASE_URL for a disposable localhost credits_test database')
const parsed=new URL(url)
assert(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname),'Localhost only')
assert(parsed.pathname.includes('credits_test'),'Disposable credits_test database name required')
Object.assign(process.env,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-service',OPENAI_API_KEY:'test-only',DATABASE_URL:url,CREDITS_ENFORCEMENT_ENABLED:'true',CREDIT_INVITES_ENABLED:'true'})
const {runCreditOperation}=await import('../../../backend/src/modules/credits/credits.service.ts')
const {createInvite,redeemInvite}=await import('../../../backend/src/modules/credit-invites/credit-invites.service.ts')
const db=postgres(url,{max:8,onnotice:()=>{}})
const f={db,log:{error:()=>{},warn:()=>{}}}
let failures=0
async function setup(){
 await db.unsafe(`DROP SCHEMA IF EXISTS credit_private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.profiles(id uuid PRIMARY KEY,is_admin boolean DEFAULT false);
 GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT ALL ON profiles TO anon,authenticated;`)
 await db.unsafe(await readFile(new URL('../../../backend/supabase/migrations/20261016012212_credits_and_invites.sql',import.meta.url),'utf8'))
}
async function scenario(name:string,run:()=>Promise<void>){try{await setup();await run();console.log(`PASS ${name}`)}catch(error){failures++;console.log(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`)}}
try{
 await scenario('account deletion remains possible with legal idempotency keys',async()=>{
  const user=randomUUID();await db`INSERT INTO auth.users VALUES(${user})`;await db`INSERT INTO credit_wallets(user_id,balance_units) VALUES(${user},75)`
  const input={userId:user,key:'0000000000000000',payload:'first',type:'photo' as const,costUnits:15}
  const first=await runCreditOperation(f as never,input,async()=>({ok:true}))
  await runCreditOperation(f as never,{...input,key:first.receipt!.operation_id,payload:'second'},async()=>({ok:true}))
  try{await db.begin(async tx=>{await tx`SET LOCAL enable_seqscan=off`;await tx`SET LOCAL enable_bitmapscan=off`;await tx`DELETE FROM auth.users WHERE id=${user}`})}catch(error){
   console.log(JSON.stringify({scenario:'delete',sqlstate:error.code,constraint:error.constraint_name,user_remains:(await db`SELECT id FROM auth.users WHERE id=${user}`).length===1}))
   throw error
  }
 })
 await scenario('expired reservation cannot settle after waiting for wallet lock',async()=>{
  const user=randomUUID();await db`INSERT INTO auth.users VALUES(${user})`;await db`INSERT INTO credit_wallets(user_id,balance_units) VALUES(${user},75)`
  let complete!:()=>void,started!:()=>void
  const inferWait=new Promise<void>(r=>{complete=r}),ready=new Promise<void>(r=>{started=r})
  const pending=runCreditOperation(f as never,{userId:user,key:randomUUID(),payload:'late',type:'photo',costUnits:15},async()=>{started();await inferWait;return {ok:true}})
  await ready
  let unlock!:()=>void,locked!:()=>void
  const lockWait=new Promise<void>(r=>{unlock=r}),lockReady=new Promise<void>(r=>{locked=r})
  const blocker=db.begin(async tx=>{
   await tx`SELECT user_id FROM credit_wallets WHERE user_id=${user} FOR UPDATE`
   await tx`UPDATE credit_operations SET lease_expires_at=clock_timestamp()+interval '250 milliseconds' WHERE user_id=${user}`
   locked();await lockWait
  })
  await lockReady;complete()
  for(let attempts=0;attempts<50;attempts++){
   const [activity]=await db`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT user_id FROM credit_wallets%'`
   if(activity.n>0)break
   await new Promise(r=>setTimeout(r,10))
  }
  await new Promise(r=>setTimeout(r,350));unlock();await blocker
  let result
  try{result=await pending}catch(error){if(error.code==='OPERATION_EXPIRED')return;throw error}
  const [row]=await db`SELECT state,lease_expires_at<clock_timestamp() AS expired FROM credit_operations WHERE user_id=${user}`
  console.log(JSON.stringify({scenario:'expired-reservation',...row,charged_units:result.receipt?.charged_units}))
  assert.equal(row.state,'failed','Expired reservation debited after lock wait')
 })
 await scenario('invite cannot be redeemed after expiry while waiting for its row lock',async()=>{
  const admin=randomUUID(),user=randomUUID();await db`INSERT INTO auth.users VALUES(${admin}),(${user})`
  const invite=await createInvite(f as never,admin,randomUUID())
  let unlock!:()=>void,locked!:()=>void
  const waiting=new Promise<void>(r=>{unlock=r}),ready=new Promise<void>(r=>{locked=r})
  const blocker=db.begin(async tx=>{
   await tx`UPDATE credit_invites SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE id=${invite.id}`
   locked();await waiting
  })
  await ready
  const redeem=redeemInvite(f as never,user,String(invite.url).split('#')[1])
  // Deterministically ensure the redemption transaction is blocked in PostgreSQL.
  for(let attempts=0;attempts<50;attempts++){
   const [activity]=await db`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id,status,claimed_by,expires_at<=now()%'`
   if(activity.n>0)break
   await new Promise(r=>setTimeout(r,10))
  }
  await new Promise(r=>setTimeout(r,350));unlock();await blocker
  let result
  try{result=await redeem}catch(error){if(error.code==='INVITE_UNAVAILABLE')return;throw error}
  const [row]=await db`SELECT expires_at<clock_timestamp() AS expired,status FROM credit_invites WHERE id=${invite.id}`
  console.log(JSON.stringify({scenario:'expired-invite',...row,granted:result.granted,balance_units:result.balance_units}))
  assert.equal(result.granted,false,'Expired invite granted 75 units after lock wait')
 })
}finally{await db.end()}
process.exitCode=failures?1:0
