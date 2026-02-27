-- ═══════════════════════════════════════════════════════════════════════════════
-- Overload fn_insert_spender_event pour accepter TEXT (bot compat)
-- Quand spender_events.tg_user_id est TEXT, le bot envoie string.
-- Date: 2026-03-27
-- ═══════════════════════════════════════════════════════════════════════════════

-- Overload TEXT (cast vers type colonne)
CREATE OR REPLACE FUNCTION public.fn_insert_spender_event(
  p_tg_user_id      TEXT,
  p_event_type      TEXT,
  p_idempotency_key TEXT,
  p_data            JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.spender_events (tg_user_id, event_type, idempotency_key, data)
  VALUES (p_tg_user_id, p_event_type, p_idempotency_key, p_data)
  ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.spender_events
     WHERE event_type = p_event_type AND tg_user_id::text = p_tg_user_id AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN v_id;
END;
$$;
