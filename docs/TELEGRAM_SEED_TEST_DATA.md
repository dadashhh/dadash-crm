# Seed données test — Messagerie Telegram Beta

Données de test pour valider l’UI Messagerie Telegram avec des valeurs reconnaissables (`TEST_UI`).

## Schéma (introspection)

**tg_conversations** : `id`, `tg_chat_id` (UNIQUE), `spender_id`, `model_id`, `assigned_chatter_id`, `status`, `last_message_at`, `created_at`

**tg_messages** : `id`, `conversation_id`, `direction` ('in'|'out'), `text`, `tg_message_id`, `sender_profile_id`, `created_at`, `meta`

---

## SQL À EXÉCUTER MAINTENANT

Exécuter dans Supabase SQL Editor (ou psql) :

```sql
-- Seed Messagerie Telegram Beta — TEST_UI
-- Idempotent: supprime un éventuel seed précédent avant insertion

BEGIN;

-- Nettoyer seed précédent
DELETE FROM tg_messages
WHERE conversation_id IN (
  SELECT id FROM tg_conversations WHERE tg_chat_id = 'TEST_UI_SEED_CHAT_001'
);
DELETE FROM tg_conversations WHERE tg_chat_id = 'TEST_UI_SEED_CHAT_001';

-- 1. Conversation de test
INSERT INTO tg_conversations (tg_chat_id, status, last_message_at)
VALUES ('TEST_UI_SEED_CHAT_001', 'open', now());

-- 2. Messages (4 messages)
INSERT INTO tg_messages (conversation_id, direction, text, created_at)
SELECT c.id, 'in', 'Bonjour TEST_UI — message entrant 1', now() - interval '10 minutes'
FROM tg_conversations c WHERE c.tg_chat_id = 'TEST_UI_SEED_CHAT_001'
UNION ALL
SELECT c.id, 'out', 'Réponse TEST_UI — message sortant 1', now() - interval '9 minutes'
FROM tg_conversations c WHERE c.tg_chat_id = 'TEST_UI_SEED_CHAT_001'
UNION ALL
SELECT c.id, 'in', 'Suite TEST_UI — message entrant 2', now() - interval '5 minutes'
FROM tg_conversations c WHERE c.tg_chat_id = 'TEST_UI_SEED_CHAT_001'
UNION ALL
SELECT c.id, 'out', 'Dernière réponse TEST_UI', now() - interval '4 minutes'
FROM tg_conversations c WHERE c.tg_chat_id = 'TEST_UI_SEED_CHAT_001';

COMMIT;
```

### Optionnel : lier à spender / model / chatter

Pour tester l’assignation et les noms :

```sql
UPDATE tg_conversations SET
  spender_id = (SELECT id FROM spenders LIMIT 1),
  model_id = (SELECT id FROM models LIMIT 1),
  assigned_chatter_id = (SELECT id FROM profiles WHERE role = 'chatter' LIMIT 1)
WHERE tg_chat_id = 'TEST_UI_SEED_CHAT_001';
```

---

## SQL CLEANUP

Pour supprimer les données seed :

```sql
-- Cleanup seed TEST_UI
DELETE FROM tg_messages
WHERE conversation_id IN (
  SELECT id FROM tg_conversations WHERE tg_chat_id = 'TEST_UI_SEED_CHAT_001'
);
DELETE FROM tg_conversations WHERE tg_chat_id = 'TEST_UI_SEED_CHAT_001';
```

---

## Checklist validation UI

- [ ] Messagerie → Telegram BETA : la conversation TEST_UI apparaît
- [ ] Clic sur la conversation : les 4 messages s’affichent
- [ ] Recherche "TEST_UI" : la conversation est trouvée
- [ ] Gérant : boutons Fermer / Assigner visibles
- [ ] Chatter : envoi possible si `can_send = true`
- [ ] Après cleanup : la conversation disparaît
