# Checklist de tests — manager-notifier + payment system

## Prérequis

1. Migration SQL appliquée dans Supabase SQL Editor :
   - `migrations/20260226_payment_system.sql`
   - `migrations/20260226_manager_notifier.sql`

2. Worker Railway déployé avec les env vars :
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`

3. Singleton manager_settings configuré :
   ```sql
   INSERT INTO public.manager_settings (id, tg_chat_id)
   VALUES (true, '123456789')    -- remplacer par votre chat_id
   ON CONFLICT (id) DO UPDATE SET tg_chat_id = EXCLUDED.tg_chat_id;
   ```

---

## TEST 1 — Simuler une alerte manager manuelle

**Objectif :** vérifier que le worker poll, envoie, et marque `sent`.

### SQL
```sql
INSERT INTO public.manager_alerts (type, message)
VALUES ('test', '🧪 <b>Test alerte</b>' || E'\n' || 'Worker Railway opérationnel.');
```

### Vérification
- [ ] Message reçu sur Telegram dans les ~5 secondes
- [ ] Ligne dans `manager_alerts` : `status = 'sent'`, `sent_at` non null
- [ ] Logs Railway : `[SENT]  <uuid> (test)`
- [ ] `GET /health` → `sentCount` = 1

```sql
SELECT id, type, status, sent_at, last_error FROM public.manager_alerts ORDER BY created_at DESC LIMIT 5;
```

---

## TEST 2 — Simuler un paiement paid (trigger payment_events)

**Objectif :** vérifier ledger_entries + notification receiver + manager_alert.

### Prérequis
```sql
-- Récupérer 2 user_id existants (gérant + un autre)
SELECT id, role, full_name FROM public.profiles LIMIT 5;
```

### SQL — Créer et passer en paid
```sql
-- Étape 1: créer le payment_event en pending
INSERT INTO public.payment_events
  (from_user_id, to_user_id, amount, currency, kind, title, created_by)
VALUES
  ('<GERANT_UUID>', '<RECEIVER_UUID>', 150, 'EUR', 'salary', 'Salaire Feb 2026', '<GERANT_UUID>')
RETURNING id;

-- Étape 2: passer en paid (déclenche le trigger)
UPDATE public.payment_events
SET status = 'paid'
WHERE id = '<UUID_DU_STEP_1>';
```

### Vérifications
- [ ] **Ledger entries** : 2 lignes créées
  ```sql
  SELECT owner_user_id, entry_type, amount, currency
  FROM public.ledger_entries
  WHERE payment_event_id = '<UUID_PAYMENT>';
  -- Attendu: une ligne amount=-150 (payer_debit) + une ligne amount=+150 (salary)
  ```

- [ ] **Notification receiver** : 1 ligne dans notifications
  ```sql
  SELECT user_id, title, message, read
  FROM public.notifications
  WHERE user_id = '<RECEIVER_UUID>'
  ORDER BY created_at DESC LIMIT 3;
  ```

- [ ] **Manager alert** : 1 ligne type=payment_paid
  ```sql
  SELECT type, status, message FROM public.manager_alerts
  WHERE type = 'payment_paid' ORDER BY created_at DESC LIMIT 3;
  ```

- [ ] Message Telegram reçu dans ~5s avec montant et noms

---

## TEST 3 — Vérifier solde et historique côté receiver (UI Compta)

**Objectif :** vérifier que ComptaTab affiche les bonnes données pour le receiver.

### SQL — Simuler lecture (comme le composant React)
```sql
-- Connecté en tant que RECEIVER_UUID (service role pour test)

-- Solde net
SELECT SUM(amount) AS solde_net FROM public.ledger_entries
WHERE owner_user_id = '<RECEIVER_UUID>';
-- Attendu: 150

-- En cours
SELECT SUM(amount) AS en_cours FROM public.payment_events
WHERE to_user_id = '<RECEIVER_UUID>' AND status = 'pending';

-- Historique paiements
SELECT id, status, amount, currency, kind, created_at
FROM public.payment_events
WHERE to_user_id = '<RECEIVER_UUID>' OR from_user_id = '<RECEIVER_UUID>'
ORDER BY created_at DESC;

-- Notifications
SELECT title, message, read FROM public.notifications
WHERE user_id = '<RECEIVER_UUID>' ORDER BY created_at DESC;
```

### Vérifications UI
- [ ] Solde net = +150 EUR (en vert)
- [ ] En cours = 0 (le paiement est paid)
- [ ] Onglet Historique → 1 ligne avec statut "paid" en vert
- [ ] Onglet Notifications → 1 notif non lue avec titre "Salaire Feb 2026 💸"
- [ ] Cliquer sur la notif la marque comme lue

---

## TEST 4 — TX validée (tx_validated trigger)

```sql
-- Insérer une TX pending
INSERT INTO public.transactions (spender_id, amount, currency, status)
VALUES ('<SPENDER_UUID>', 80, 'EUR', 'pending')
RETURNING id;

-- La valider
UPDATE public.transactions SET status = 'valid' WHERE id = '<TX_UUID>';
```

- [ ] `manager_alerts` : 1 ligne type=`tx_validated`
- [ ] Message Telegram : "✅ TX validée"

---

## TEST 5 — Spender devient VIP

```sql
UPDATE public.spenders
SET classification = 'vip'
WHERE id = '<SPENDER_UUID>';
```

- [ ] `manager_alerts` : 1 ligne type=`spender_vip`
- [ ] Message Telegram : "⭐ Nouveau VIP"

---

## TEST 6 — Budget élevé (> 500 CHF)

```sql
INSERT INTO public.transactions (spender_id, amount, currency, status)
VALUES ('<SPENDER_UUID>', 750, 'CHF', 'valid');
```

- [ ] `manager_alerts` : 1 ligne type=`budget_high`
- [ ] Message Telegram : "🚨 Budget élevé détecté … 750 CHF"

---

## TEST 7 — 3 TX en 24h (tx_burst)

```sql
-- Insérer 3 TX pour le même spender en quelques secondes
INSERT INTO public.transactions (spender_id, amount, currency, status)
VALUES ('<SPENDER_UUID>', 20, 'EUR', 'valid');
INSERT INTO public.transactions (spender_id, amount, currency, status)
VALUES ('<SPENDER_UUID>', 35, 'EUR', 'valid');
INSERT INTO public.transactions (spender_id, amount, currency, status)
VALUES ('<SPENDER_UUID>', 50, 'EUR', 'valid');
```

- [ ] `manager_alerts` : 1 ligne type=`tx_burst` (pas 3, seulement au 3ème)
- [ ] Message Telegram : "🔥 3 TX en 24h"

---

## TEST 8 — Relation hot

```sql
UPDATE public.spenders
SET classification = 'hot'
WHERE id = '<SPENDER_UUID>';
```

- [ ] `manager_alerts` : 1 ligne type=`relation_hot`
- [ ] Message Telegram : "❤️ Relation HOT"

---

## TEST 9 — Vérifier le worker /health

```bash
# Depuis Railway logs ou curl si port exposé
curl https://<railway-url>/health
```

Réponse attendue :
```json
{
  "status": "ok",
  "uptimeSeconds": 3600,
  "sentCount": 8,
  "errorCount": 0,
  "lastPollAt": "2026-02-26T12:00:00.000Z",
  "pollerRunning": true
}
```

---

## TEST 10 — Erreur Telegram (bot bloqué simulé)

```sql
-- Mettre un mauvais tg_chat_id
UPDATE public.manager_settings SET tg_chat_id = '0000000';

-- Insérer une alerte test
INSERT INTO public.manager_alerts (type, message)
VALUES ('test', 'Alerte qui va échouer');
```

- [ ] Worker tente d'envoyer, reçoit HTTP 400 de Telegram
- [ ] `status = 'error'`, `last_error` contient le message Telegram
- [ ] Logs Railway : `[ERROR] ... → error`
- [ ] Pas de boucle infinie (le worker continue sans bloquer)

---

## Vérifications finales RLS

```sql
-- En tant qu'utilisateur normal (JWT user), vérifier qu'il ne voit pas les autres
SET LOCAL request.jwt.claims TO '{"sub": "<USER_UUID>", "role": "authenticated"}';

-- Ne voit que ses propres ledger_entries
SELECT COUNT(*) FROM public.ledger_entries;  -- doit = ses entrées seulement

-- Ne voit que ses notifications
SELECT COUNT(*) FROM public.notifications;  -- doit = ses notifs seulement

-- Ne peut pas lire manager_alerts
SELECT COUNT(*) FROM public.manager_alerts;  -- doit = 0 ou erreur de permission
```
