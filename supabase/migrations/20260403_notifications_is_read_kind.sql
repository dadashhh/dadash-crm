-- =============================================================================
-- MIGRATION: notifications.is_read + category counts + mark-read RPC
-- Date: 2026-04-03
--
-- Corrige le bug "column is_read does not exist" :
--   * Ajoute is_read boolean (backfille depuis read)
--   * Trigger de sync bidirectionnel is_read <-> read
--     => anciens clients qui ecrivent read:true continuent de fonctionner
--     => nouveaux clients qui ecrivent is_read:true mettent aussi read a jour
--
-- Ajoute les RPCs pour le data-layer UI :
--   * rpc_notifications_counts()        -> { tx_unread, spender_unread, payment_unread, total_unread }
--   * rpc_mark_notifications_read(kind) -> nb de lignes marquees
--
-- Backward compat :
--   * kind IS NULL considere comme 'tx' dans tous les calculs
--   * La colonne read reste en place, jamais supprimee
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.  Colonne is_read  (idempotente)
-- -----------------------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 2.  Backfill  is_read depuis read pour les lignes existantes
-- -----------------------------------------------------------------------------

UPDATE public.notifications
   SET is_read = COALESCE("read", false)
 WHERE is_read IS DISTINCT FROM COALESCE("read", false);

-- -----------------------------------------------------------------------------
-- 3.  Index partiel pour les compteurs unread (performance)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_notif_user_isread_kind
  ON public.notifications(user_id, kind, is_read)
  WHERE NOT is_read;

-- -----------------------------------------------------------------------------
-- 4.  Trigger de sync bidirectionnel   is_read <-> read
--
--     Logique :
--       * Si seul is_read a change => propager vers read
--       * Si seul read a change    => propager vers is_read
--       * Si les deux changent en meme temps (ex: update({ read:true, is_read:true }))
--         => is_read a la priorite, read est ecrase par is_read
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_notifications_sync_read()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_read IS DISTINCT FROM OLD.is_read THEN
    -- is_read change => aligner read
    NEW."read" := NEW.is_read;
  ELSIF NEW."read" IS DISTINCT FROM OLD."read" THEN
    -- read change => aligner is_read
    NEW.is_read := NEW."read";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_sync_read ON public.notifications;
CREATE TRIGGER trg_notifications_sync_read
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notifications_sync_read();

-- -----------------------------------------------------------------------------
-- 5.  RPC : rpc_notifications_counts()
--
--     Retourne les compteurs unread par categorie pour auth.uid().
--     NULL kind est compte comme 'tx' (backward compat).
--
--     Retour : jsonb { tx_unread, spender_unread, payment_unread, total_unread }
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_notifications_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tx_unread',
      COALESCE(SUM(CASE
        WHEN COALESCE(kind, 'tx') = 'tx' AND NOT is_read THEN 1 ELSE 0
      END), 0),
    'spender_unread',
      COALESCE(SUM(CASE
        WHEN kind = 'spender' AND NOT is_read THEN 1 ELSE 0
      END), 0),
    'payment_unread',
      COALESCE(SUM(CASE
        WHEN kind = 'payment' AND NOT is_read THEN 1 ELSE 0
      END), 0),
    'total_unread',
      COALESCE(SUM(CASE WHEN NOT is_read THEN 1 ELSE 0 END), 0)
  )
  FROM public.notifications
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.rpc_notifications_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_notifications_counts() TO authenticated;

-- -----------------------------------------------------------------------------
-- 6.  RPC : rpc_mark_notifications_read(p_kind text DEFAULT NULL)
--
--     Marque comme lues toutes les notifs non lues de la categorie specifiee.
--     p_kind = NULL  => toutes categories confondues
--     p_kind = 'tx'  => inclut les lignes ou kind IS NULL (backward compat)
--
--     Retourne : nombre de lignes mises a jour
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_mark_notifications_read(
  p_kind text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.notifications
     SET is_read = true,
         "read"  = true
   WHERE user_id = auth.uid()
     AND NOT is_read
     AND (
       p_kind IS NULL
       OR (p_kind = 'tx'      AND COALESCE(kind, 'tx') = 'tx')
       OR (p_kind = 'spender' AND kind = 'spender')
       OR (p_kind = 'payment' AND kind = 'payment')
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_notifications_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_notifications_read(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7.  S'assurer que les triggers existants (fn_payments_on_insert,
--     fn_payments_on_status_change) inserent bien is_read = false.
--     Les inserts existants ne specifient pas is_read => DEFAULT false s'applique.
--     Aucune modification des triggers existants necessaire.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 8.  Verification rapide (a executer manuellement)
-- -----------------------------------------------------------------------------

-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'notifications'
--  ORDER BY ordinal_position;
-- Attendu : colonnes read (bool), is_read (bool), kind (text) toutes presentes.

-- SELECT rpc_notifications_counts();
-- Attendu : { "tx_unread": N, "spender_unread": N, "payment_unread": N, "total_unread": N }

-- SELECT rpc_mark_notifications_read('payment');
-- Attendu : integer = nombre de notifs payment marquees lues.

