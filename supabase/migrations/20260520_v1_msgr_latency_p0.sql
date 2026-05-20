BEGIN;

UPDATE public.tg_messages m
SET model_id = c.model_id
FROM public.tg_conversations c
WHERE m.conversation_id = c.id
  AND m.model_id IS NULL
  AND c.model_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_autofill_tg_message_model_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.model_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    SELECT model_id INTO NEW.model_id
    FROM public.tg_conversations
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autofill_tg_message_model_id ON public.tg_messages;
CREATE TRIGGER trg_autofill_tg_message_model_id
BEFORE INSERT ON public.tg_messages
FOR EACH ROW EXECUTE FUNCTION public.fn_autofill_tg_message_model_id();

DROP POLICY IF EXISTS tg_messages_select_unified ON public.tg_messages;
CREATE POLICY tg_messages_select_unified ON public.tg_messages
FOR SELECT TO public USING (
  ((SELECT get_my_role()) IN ('gerant', 'admin'))
  OR (
    ((SELECT get_my_role()) = ANY (ARRAY['chatter', 'manager_chatter']))
    AND model_id IS NOT NULL
    AND (model_id::text = ANY (
      COALESCE(
        (SELECT p.assigned_models FROM public.profiles p WHERE p.id = (SELECT auth.uid())),
        ARRAY[]::text[]
      )
    ))
  )
);

DROP POLICY IF EXISTS tg_conversations_select_unified ON public.tg_conversations;
CREATE POLICY tg_conversations_select_unified ON public.tg_conversations
FOR SELECT TO public USING (
  ((SELECT get_my_role()) IN ('gerant', 'admin'))
  OR (
    ((SELECT get_my_role()) = ANY (ARRAY['chatter', 'manager_chatter']))
    AND (
      assigned_chatter_id = (SELECT auth.uid())
      OR (
        model_id IS NOT NULL
        AND (model_id::text = ANY (
          COALESCE(
            (SELECT p.assigned_models FROM public.profiles p WHERE p.id = (SELECT auth.uid())),
            ARRAY[]::text[]
          )
        ))
      )
    )
  )
);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tg_conversations;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION public.tg_sync_conv_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.tg_conversations
  SET last_message_at = COALESCE(NEW.created_at, NOW()),
      last_message_preview = CASE
        WHEN NEW.text IS NOT NULL THEN LEFT(NEW.text, 200)
        WHEN NEW.media_url IS NOT NULL THEN '[média]'
        ELSE last_message_preview
      END,
      last_message_direction = NEW.direction,
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tg_msg_update_preview ON public.tg_messages;

COMMIT;
