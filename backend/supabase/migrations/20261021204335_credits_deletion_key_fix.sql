-- D05 (debug 18/10): a exclusão de conta reescrevia idempotency_key=id::text.
-- O id de uma operação também é uma chave válida para outra operação da mesma
-- conta, e a atualização intermediária podia violar UNIQUE(user_id,
-- idempotency_key) e desfazer a exclusão inteira. O prefixo "deleted:" contém
-- ':', que a validação de chave (^[A-Za-z0-9_-]{16,128}$) nunca aceita, e cada
-- id é único: nenhuma ordem de atualização colide.
-- A migration 20261016012212 não é editada (pode já estar aplicada).
CREATE OR REPLACE FUNCTION credit_private.credit_clear_deleted_result() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.credit_operations SET result=NULL,payload_hash='deleted',idempotency_key='deleted:'||id::text WHERE user_id=OLD.id;
 UPDATE public.credit_invites SET label=NULL WHERE creator_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION credit_private.credit_clear_deleted_result() FROM PUBLIC;
