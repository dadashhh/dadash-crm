-- ═══════════════════════════════════════════════════════════════════════════════
-- DADASH — Realtime publication pour spender_events, tg_messages, spenders
-- Permet au front de s'abonner via postgres_changes
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ajouter les tables à la publication supabase_realtime (si elle existe)
DO $$
BEGIN
  -- supabase_realtime est la publication par défaut pour Realtime
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.spender_events;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- déjà dans la publication
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tg_messages;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.spenders;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
