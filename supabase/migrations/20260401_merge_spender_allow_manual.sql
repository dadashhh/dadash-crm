-- merge_spender: autoriser old spender sans tg_user_id (fiche manuelle fusionnée dans fiche officielle)
-- Cas: user ajoute tg_id sur fiche manuelle "husan", mais tg_id déjà pris par "Dada"
-- → proposer fusion husan → Dada (old=husan sans tg_id, new=Dada avec tg_id)

CREATE OR REPLACE FUNCTION public.merge_spender(p_old_id UUID, p_new_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_tg  TEXT;
  v_new_tg  TEXT;
  v_tx      INT := 0;
  v_conv    INT := 0;
  v_ev      INT := 0;
  v_push    INT := 0;
  v_plat    INT := 0;
  v_wa      INT := 0;
BEGIN
  IF p_old_id = p_new_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'old_id = new_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.spenders WHERE id = p_old_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'old spender not found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.spenders WHERE id = p_new_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new spender not found');
  END IF;

  SELECT tg_user_id INTO v_new_tg FROM public.spenders WHERE id = p_new_id;

  -- 1) transactions
  UPDATE public.transactions SET spender_id = p_new_id WHERE spender_id = p_old_id;
  GET DIAGNOSTICS v_tx = ROW_COUNT;

  -- 2) tg_conversations
  UPDATE public.tg_conversations SET spender_id = p_new_id WHERE spender_id = p_old_id;
  GET DIAGNOSTICS v_conv = ROW_COUNT;

  -- 3) spender_events
  UPDATE public.spender_events SET spender_id = p_new_id WHERE spender_id = p_old_id;
  GET DIAGNOSTICS v_ev = ROW_COUNT;

  -- 4) push_recipients (si table existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'push_recipients') THEN
    UPDATE public.push_recipients SET spender_id = p_new_id WHERE spender_id = p_old_id;
    GET DIAGNOSTICS v_push = ROW_COUNT;
  END IF;

  -- 5) platform_fans (si existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_fans') THEN
    UPDATE public.platform_fans SET spender_id = p_new_id WHERE spender_id = p_old_id;
    GET DIAGNOSTICS v_plat = ROW_COUNT;
  END IF;

  -- 6) wa_analysis_logs (si existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wa_analysis_logs') THEN
    UPDATE public.wa_analysis_logs SET spender_id = p_new_id WHERE spender_id = p_old_id;
    GET DIAGNOSTICS v_wa = ROW_COUNT;
  END IF;

  -- 7) Archiver old spender (jamais DELETE)
  UPDATE public.spenders
     SET is_active = false,
         merged_into_id = p_new_id,
         updated_at = now()
   WHERE id = p_old_id;

  -- 8) Log event (v_new_tg peut être null si new n'a pas encore tg_id, utiliser '0')
  INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
  VALUES (
    COALESCE(v_new_tg, '0'),
    p_new_id,
    'spender_merged',
    'merge:' || p_old_id::text || '->' || p_new_id::text,
    jsonb_build_object(
      'summary', 'Spender fusionné',
      'old_id', p_old_id,
      'new_id', p_new_id,
      'counts', jsonb_build_object(
        'transactions', v_tx,
        'tg_conversations', v_conv,
        'spender_events', v_ev,
        'push_recipients', v_push,
        'platform_fans', v_plat,
        'wa_analysis_logs', v_wa
      )
    )
  );

  RETURN jsonb_build_object('ok', true, 'old_id', p_old_id, 'new_id', p_new_id);
END;
$$;
