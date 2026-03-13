# DADASH CRM — Rapport d'Audit de Sécurité

**Date :** 2026-03-13
**Auditeur :** Agent de sécurité automatisé (Opus)
**Périmètre :** Repository `dadash-crm` — Frontend React, Backend bot/autofill/worker, Supabase (migrations + Edge Functions)
**Classification :** CONFIDENTIEL

---

## 1. Executive Summary

L'audit de sécurité de la plateforme DADASH révèle **4 vulnérabilités critiques**, **8 vulnérabilités hautes**, **7 vulnérabilités moyennes** et **5 vulnérabilités basses**. Les risques les plus urgents concernent :

1. **Clé API hardcodée dans le code source public** — une clé d'API interne est en clair dans `index.html`, accessible à quiconque visite le site
2. **Policies RLS `USING (true)` sur des tables sensibles** — les chatters peuvent lire TOUTES les données (spenders, profiles, models) sans filtrage
3. **Edge Functions sans authentification** — `toggle-bot` et `get-bots-status` ne vérifient pas l'identité de l'appelant
4. **Credentials OnlyFans stockées en JSONB non chiffré** — les cookies de session OF sont lisibles en base

---

## 2. Tableau de Bord

### Score global : 38/100

| Axe de sécurité | Score | Risque |
|---|---|---|
| 1. Authentification & Sessions | 55/100 | MOYEN |
| 2. Permissions & Isolation (RLS) | 25/100 | CRITIQUE |
| 3. API & Backend | 35/100 | HAUT |
| 4. Secrets & Credentials | 30/100 | CRITIQUE |
| 5. Frontend (XSS, CSRF, CSP) | 40/100 | HAUT |
| 6. Bot Telegram | 50/100 | MOYEN |
| 7. Conformité RGPD | 35/100 | HAUT |

---

## 3. Findings détaillés

---

### FINDING-01 — Clé API interne hardcodée dans le frontend
**Axe :** 4 (Secrets)
**Sévérité :** CRITIQUE
**Fichier :** `index.html:28694`

**Description :**
Une clé API interne (`_DMSG_KEY_FALLBACK`) est hardcodée en clair dans le code frontend, visible par n'importe quel utilisateur via le code source du navigateur.

**Preuve de concept :**
```javascript
// index.html:28694
const _DMSG_KEY_FALLBACK = "679aa382f5faa4668e7ba6570b8bb0038f2e0c10f815bf881090c7e02419cade";

// Utilisé à index.html:28700 comme fallback
const key = window.CRM_API_KEY || _DMSG_KEY_FALLBACK;

// Également hardcodée à index.html:15188
headers: { 'X-API-Key': '679aa382f5faa4668e7ba6570b8bb0038f2e0c10f815bf881090c7e02419cade' }
```

**Impact :**
- N'importe qui peut appeler l'API backend Railway avec cette clé
- Accès non autorisé aux conversations Telegram, envoi de messages, manipulation de données
- La clé est également partiellement loggée en console (index.html:28707)

**Recommandation :**
1. **Immédiat :** Révoquer et faire tourner cette clé API côté Railway
2. Supprimer le fallback hardcodé du code frontend
3. Utiliser uniquement `window.CRM_API_KEY` injecté via env Vercel
4. Implémenter un flux d'authentification JWT pour les appels API (plutôt qu'une clé statique partagée)

---

### FINDING-02 — Policies RLS `USING (true)` sur tables sensibles
**Axe :** 2 (Permissions)
**Sévérité :** CRITIQUE
**Fichier :** `migration.sql:22, 89, 102, 195, 221`

**Description :**
Plusieurs tables critiques ont des policies RLS SELECT avec `USING (true)`, permettant à tout utilisateur authentifié de lire TOUTES les lignes, sans aucun filtrage par rôle ou `assigned_models`.

**Preuve de concept :**
```sql
-- migration.sql:22 — TOUT chatter voit TOUS les spenders
CREATE POLICY spenders_select_all ON spenders FOR SELECT USING (true);

-- migration.sql:89 — TOUT chatter voit TOUS les profils
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);

-- migration.sql:102 — TOUT chatter voit TOUS les modèles
CREATE POLICY models_select ON models FOR SELECT USING (true);
```

**Impact :**
- Un chatter peut voir les données de TOUS les spenders, y compris ceux d'autres chatters/modèles
- Fuite de données personnelles entre chatters (violation RGPD)
- Le filtrage `assigned_models` côté frontend est contournable via l'API Supabase directement

**Recommandation :**
```sql
-- Remplacer par des policies filtrées
CREATE POLICY spenders_select ON spenders FOR SELECT USING (
  CASE
    WHEN (SELECT role FROM profiles WHERE id = auth.uid()) IN ('gerant', 'admin', 'ceo')
    THEN true
    ELSE id IN (
      SELECT s.id FROM spenders s
      JOIN model_spenders ms ON ms.spender_id = s.id
      WHERE ms.model_id IN (
        SELECT (elem)::uuid
        FROM profiles p, jsonb_array_elements_text(COALESCE(p.assigned_models, '[]'::jsonb)) AS elem
        WHERE p.id = auth.uid()
      )
    )
  END
);
```

---

### FINDING-03 — Chatter peut UPDATE tous les spenders sans filtrage
**Axe :** 2 (Permissions)
**Sévérité :** CRITIQUE
**Fichier :** `migration.sql:16-22`

**Description :**
La policy d'UPDATE sur la table spenders vérifie uniquement que l'utilisateur a le rôle `chatter`, sans filtrer par `assigned_models`.

```sql
-- migration.sql:16
CREATE POLICY spenders_update_chatter ON spenders FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
);
```

**Impact :**
- Tout chatter peut modifier les données de N'IMPORTE QUEL spender dans le système
- Possibilité de manipuler les montants, notes, données de contact d'un spender concurrent
- Escalation de privilèges indirecte

**Recommandation :**
Ajouter un filtrage par `assigned_models` identique à FINDING-02.

---

### FINDING-04 — Table `paiements_internes` sans RLS
**Axe :** 2 (Permissions)
**Sévérité :** CRITIQUE
**Fichier :** `supabase/migrations/20260408_paiements_internes.sql`

**Description :**
La table `paiements_internes` (paiements internes des chatters) ne semble pas avoir de policy RLS activée dans sa migration. Cela signifie que tout utilisateur authentifié peut lire, insérer, modifier ou supprimer des paiements.

**Impact :**
- Fuite d'informations financières sensibles (salaires, commissions)
- Manipulation possible des paiements

**Recommandation :**
```sql
ALTER TABLE paiements_internes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pi_gerant_all ON paiements_internes FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('gerant', 'admin', 'ceo')
);
```

---

### FINDING-05 — Edge Functions sans authentification (toggle-bot, get-bots-status)
**Axe :** 3 (API)
**Sévérité :** HAUTE
**Fichiers :** `supabase/functions/toggle-bot/index.ts`, `supabase/functions/get-bots-status/index.ts`

**Description :**
Ces Edge Functions ne vérifient PAS le JWT de l'appelant. Elles utilisent la clé anon Supabase pour se connecter, sans vérifier l'identité ou le rôle de l'utilisateur.

**Preuve de concept :**
```typescript
// toggle-bot/index.ts:33-35 — Aucune vérification JWT !
const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!
const supabase = createClient(supabaseUrl, supabaseKey)

// N'importe qui peut activer/désactiver les bots
const { bot_name, enabled } = await req.json()
```

**Impact :**
- N'importe qui peut activer/désactiver les bots de la plateforme
- Possibilité de perturber le service (DoS métier)
- Les logs montrent les actions mais ne tracent pas l'auteur

**Recommandation :**
Ajouter la même logique d'authentification JWT + vérification gérant que dans `sync-platform/index.ts` :
```typescript
const authHeader = req.headers.get("Authorization")
if (!authHeader?.startsWith("Bearer ")) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
}
const jwt = authHeader.replace("Bearer ", "")
// ... vérifier user + rôle gérant
```

---

### FINDING-06 — CORS wildcard `*` sur toutes les Edge Functions
**Axe :** 3 (API)
**Sévérité :** HAUTE
**Fichiers :** Toutes les Edge Functions dans `supabase/functions/`

**Description :**
Toutes les Edge Functions utilisent `Access-Control-Allow-Origin: "*"`, permettant à n'importe quel site web d'effectuer des requêtes cross-origin vers ces endpoints.

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",  // CRITIQUE
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
```

**Impact :**
- Un site malveillant peut faire des requêtes API au nom d'un utilisateur connecté
- Combiné avec FINDING-05, permet l'exploitation à distance

**Recommandation :**
```typescript
const ALLOWED_ORIGINS = ["https://dadash.co", "https://www.dadash.co"];
const origin = req.headers.get("Origin") || "";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  // ...
};
```

---

### FINDING-07 — Functions SECURITY DEFINER sans vérification de rôle
**Axe :** 2 (Permissions)
**Sévérité :** HAUTE
**Fichiers :** `supabase/migrations/20260226_spender_pipeline_004_views_rpc.sql:53-123`

**Description :**
Plusieurs fonctions PostgreSQL marquées `SECURITY DEFINER` (qui s'exécutent avec les privilèges du propriétaire, bypassing RLS) ne vérifient pas le rôle de l'appelant :

```sql
-- fn_get_activity_feed — aucune vérification de rôle
CREATE OR REPLACE FUNCTION public.fn_get_activity_feed(...)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.v_activity_feed v ...;
END; $$;

-- fn_insert_spender_event — aucune vérification de rôle
CREATE OR REPLACE FUNCTION public.fn_insert_spender_event(...)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.spender_events (...) VALUES (...);
END; $$;
```

Ces fonctions sont `GRANT EXECUTE ... TO authenticated` (migrations 20260226_spender_pipeline_005_rls.sql:96-101).

**Impact :**
- Tout utilisateur authentifié peut insérer des événements spender arbitraires
- Tout utilisateur peut lire l'intégralité du flux d'activité
- Bypass complet des policies RLS sur les tables sous-jacentes

**Recommandation :**
Ajouter une vérification de rôle en début de chaque fonction :
```sql
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('gerant', 'admin', 'ceo') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  -- ... logique existante
END;
```

---

### FINDING-08 — Credentials OnlyFans stockées en JSONB non chiffré
**Axe :** 4 (Secrets)
**Sévérité :** HAUTE
**Fichier :** `supabase/migrations/20260225_platform_connectors.sql:12`

**Description :**
Les credentials des plateformes tierces (auth_id, sess cookies d'OnlyFans, bot tokens Telegram) sont stockées en JSONB brut dans la table `platform_accounts`. Le commentaire "encrypted at rest by Supabase" est trompeur — Supabase chiffre le disque mais les données sont lisibles en clair par toute requête SQL.

```sql
credentials JSONB,  -- "encrypted at rest by Supabase" — FAUX SENTIMENT DE SÉCURITÉ
```

**Impact :**
- Un gérant (ou un attaquant avec accès service_role) peut lire les cookies de session OF de tous les modèles
- Usurpation d'identité possible sur OnlyFans
- Si la base est compromise, toutes les credentials sont exposées

**Recommandation :**
1. Utiliser `pgsodium` (extension Supabase) pour chiffrer les credentials au niveau colonne
2. Ou utiliser Vault de Supabase pour stocker les secrets sensibles
3. A minima, chiffrer côté application avant INSERT et déchiffrer côté Edge Function

---

### FINDING-09 — XSS via innerHTML sans sanitization
**Axe :** 5 (Frontend)
**Sévérité :** HAUTE
**Fichier :** `index.html:6419, 18734, 24638, 38836, 45383`

**Description :**
Plusieurs endroits utilisent `innerHTML` pour injecter du contenu HTML dynamique sans sanitization. Si le contenu provient de données utilisateur (messages Telegram, noms de spenders, etc.), un attaquant pourrait injecter du JavaScript.

```javascript
// index.html:6419
const el = document.createElement("div"); el.innerHTML = htmlContent; document.body.appendChild(el);

// index.html:38836
el.innerHTML = `...`; // Template literal avec données potentiellement non échappées

// index.html:45383
el.innerHTML = html;
```

**Impact :**
- Exécution de code JavaScript arbitraire dans le navigateur d'un gérant
- Vol de session JWT Supabase
- Accès complet au CRM via le compte compromis

**Recommandation :**
1. Utiliser `DOMPurify` pour sanitizer tout HTML avant injection
2. Préférer `textContent` à `innerHTML` quand possible
3. Utiliser les composants React natifs (`dangerouslySetInnerHTML` avec DOMPurify au minimum)

---

### FINDING-10 — Clés API utilisateur stockées dans localStorage
**Axe :** 1 (Auth) + 5 (Frontend)
**Sévérité :** HAUTE
**Fichier :** `index.html:37456, 42320, 42489, 44175, 44434`

**Description :**
Plusieurs clés API sont stockées dans localStorage, vulnérable aux attaques XSS (si FINDING-09 est exploité) :

```javascript
// Clé API Telegram admin
localStorage.setItem(LS_API_KEY, key);  // index.html:37456

// Clé API Anthropic/Claude
localStorage.setItem("dadash-anthropic-key", key);  // index.html:42489
localStorage.setItem("dadash_claude_key", claudeKey);  // index.html:44434
```

**Impact :**
- Si un XSS est exploité, l'attaquant peut voler toutes les clés stockées
- Les clés Anthropic/Claude permettent d'effectuer des appels API payants au nom de l'utilisateur

**Recommandation :**
1. Stocker les clés sensibles en mémoire uniquement (état React) plutôt que localStorage
2. Implémenter un proxy backend pour les appels Claude (ne jamais exposer la clé côté client)
3. Pour la clé API admin, utiliser un cookie HttpOnly géré côté serveur

---

### FINDING-11 — Session generator expose des credentials Telegram via API
**Axe :** 6 (Bot Telegram)
**Sévérité :** HAUTE
**Fichier :** `crm_routes_session_generator.py:21-109`

**Description :**
L'endpoint `/generate-session/start` et `/generate-session/confirm` permet de générer des sessions Telegram à partir du CRM. Bien que protégé par `_check_crm_api_key`, cette clé API est hardcodée dans le frontend (FINDING-01). De plus :

1. Le `phone` est loggé en clair (ligne 36, 50, 79, 100)
2. Le `session_string` est renvoyé dans la réponse HTTP (ligne 102-105)
3. Les erreurs incluent des détails Telegram potentiellement sensibles (ligne 59, 108)

```python
log.info(f"[SESSION_GEN] Starting for {phone}")  # PII loggé
return web.json_response({"success": True, "session_string": session_string})  # Session en clair
return web.json_response({"success": False, "error": str(exc)}, status=500)  # Info leak
```

**Impact :**
- Un attaquant avec la clé API (FINDING-01) peut générer des sessions Telegram pour n'importe quel numéro
- Les sessions Telegram permettent un accès complet au compte Telegram
- Les numéros de téléphone sont loggés (violation RGPD)

**Recommandation :**
1. Remplacer l'auth par API key par un JWT Supabase vérifié + rôle gérant
2. Ne jamais logger les numéros de téléphone en clair
3. Chiffrer le session_string avant de le renvoyer
4. Limiter le rate : max 3 tentatives par heure

---

### FINDING-12 — Absence de Content Security Policy
**Axe :** 5 (Frontend)
**Sévérité :** MOYENNE
**Fichier :** `vercel.json`

**Description :**
Le fichier `vercel.json` ne configure aucun header de sécurité. Aucune CSP n'est définie.

```json
{
  "buildCommand": "node scripts/inject-build-id.js"
}
```

**Impact :**
- Les attaques XSS ne sont pas atténuées par une CSP
- Pas de protection contre le clickjacking (X-Frame-Options)
- Pas de HSTS configuré

**Recommandation :**
```json
{
  "buildCommand": "node scripts/inject-build-id.js",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://*.supabase.co https://*.railway.app; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

---

### FINDING-13 — Babel in-browser en production
**Axe :** 5 (Frontend)
**Sévérité :** MOYENNE
**Fichier :** `index.html`

**Description :**
L'application React utilise Babel en mode in-browser (`type="text/babel"`) pour transpiler le JSX. Cela présente plusieurs risques :

1. **Surface d'attaque élargie** : Babel in-browser utilise `eval()` / `new Function()` pour exécuter le code transpilé
2. **Performance** : La transpilation côté client est lente et bloque le thread principal
3. **CSP incompatible** : Nécessite `unsafe-eval` dans la CSP, annulant une partie de la protection

**Impact :**
- Impossible d'implémenter une CSP stricte
- Augmente la surface d'attaque XSS

**Recommandation :**
Migrer vers un build pipeline classique (Vite, Next.js, ou create-react-app) pour pré-compiler le JSX. Cela permettra une CSP sans `unsafe-eval`.

---

### FINDING-14 — Logging de données sensibles en console
**Axe :** 4 (Secrets) + 7 (RGPD)
**Sévérité :** MOYENNE
**Fichier :** `index.html:28705-28708`

**Description :**
Le code frontend logge des informations sensibles dans la console du navigateur :

```javascript
// index.html:28705-28708
console.log("[DMSG] ▶ fetch", opts.method || "GET", url, `(timeout: ${timeoutMs}ms)`);
console.log("[DMSG]   API:", _DMSG_API);
console.log("[DMSG]   Key:", key.slice(0, 8) + "…" + key.slice(-4) + " (" + key.length + " chars)");
if (opts.body) console.log("[DMSG]   Body:", opts.body);
```

**Impact :**
- La clé API est partiellement visible dans les logs du navigateur
- Le body des requêtes (contenant potentiellement des messages privés) est loggé
- Facilite la reconnaissance pour un attaquant

**Recommandation :**
Supprimer tous les `console.log` de production ou les conditionner à un mode debug :
```javascript
const DEBUG = localStorage.getItem("dadash_debug") === "1";
const log = DEBUG ? console.log.bind(console) : () => {};
```

---

### FINDING-15 — Absence de rate limiting sur les Edge Functions
**Axe :** 3 (API)
**Sévérité :** MOYENNE
**Fichiers :** Toutes les Edge Functions

**Description :**
Aucune Edge Function n'implémente de rate limiting. Un attaquant pourrait :
- Spammer `send-push-campaign` pour envoyer des milliers de messages Telegram
- Flood `sync-platform` pour saturer l'API OnlyFans et faire bannir le compte
- Appeler `toggle-bot` en boucle pour perturber le service

**Recommandation :**
Implémenter un rate limiting via une table Supabase ou un compteur Redis :
```typescript
// Vérifier le nombre d'appels dans les dernières 60 secondes
const { count } = await svc
  .from("api_rate_limits")
  .select("*", { count: "exact" })
  .eq("user_id", user.id)
  .eq("endpoint", "send-push-campaign")
  .gte("created_at", new Date(Date.now() - 60000).toISOString());

if (count > 10) {
  return jsonResponse({ error: "Rate limit exceeded" }, 429);
}
```

---

### FINDING-16 — Bot admin Supabase avec service_role key
**Axe :** 6 (Bot)
**Sévérité :** MOYENNE
**Fichier :** `bot/admin-bot.js:13, 19`

**Description :**
Le bot admin utilise la `service_role` key pour toutes ses opérations Supabase, ce qui bypass complètement les RLS. Bien que le bot soit protégé par `ADMIN_TELEGRAM_ID`, si ce ID est compromis ou spoofé, l'attaquant a un accès complet à la base.

```javascript
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
```

Le bot expose aussi des infos sensibles dans les erreurs :
```javascript
// bot/admin-bot.js:56 — Erreur complète envoyée à l'admin
await ctx.reply(`❌ Erreur: ${err.message}`);
```

**Recommandation :**
1. Utiliser un client Supabase avec token JWT personnalisé plutôt que service_role
2. Limiter les requêtes à la lecture seule sauf pour les opérations spécifiques
3. Filtrer les messages d'erreur avant de les envoyer

---

### FINDING-17 — document.write dans la génération de factures
**Axe :** 5 (Frontend)
**Sévérité :** MOYENNE
**Fichier :** `index.html:38595-38606`

**Description :**
La génération de factures utilise `document.write` avec des données potentiellement non échappées :

```javascript
win.document.write("<p><strong>"+(user.name||user.full_name||"Chatter")+"</strong>...");
```

Si `user.name` contient du HTML malveillant, il sera injecté dans la facture.

**Recommandation :**
Échapper les données utilisateur avant injection :
```javascript
const esc = (s) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
win.document.write("<p><strong>" + esc(user.name || user.full_name || "Chatter") + "</strong>...");
```

---

### FINDING-18 — Supabase URL réelle dans .env.example
**Axe :** 4 (Secrets)
**Sévérité :** MOYENNE
**Fichier :** `bot/.env.example`

**Description :**
Le fichier `.env.example` du bot contient l'URL réelle du projet Supabase (`lkrzjwfwhiimpnsyeuxi.supabase.co`), ce qui facilite la reconnaissance.

**Recommandation :**
Remplacer par un placeholder : `https://xxxx.supabase.co`

---

### FINDING-19 — Absence de mécanisme d'export/suppression RGPD
**Axe :** 7 (RGPD)
**Sévérité :** MOYENNE
**Fichier :** Ensemble du codebase

**Description :**
Aucune fonctionnalité d'export de données personnelles (droit d'accès Art. 15 RGPD) ni de suppression (droit à l'oubli Art. 17 RGPD) n'est implémentée dans le CRM. Les données concernées incluent :
- Profils chatters (nom, email, rôle)
- Données spenders (handle, nom, historique Telegram, transactions)
- Messages Telegram (contenu, métadonnées)

**Recommandation :**
1. Implémenter un endpoint `/api/gdpr/export/:userId` qui génère un dump JSON de toutes les données
2. Implémenter un endpoint `/api/gdpr/delete/:userId` qui anonymise ou supprime les données
3. Documenter la politique de rétention des données

---

### FINDING-20 — Pas de politique de rétention des logs/messages
**Axe :** 7 (RGPD)
**Sévérité :** BASSE

**Description :**
Les messages Telegram (`tg_messages`), les logs d'activité (`bot_logs`, `audit_logs`), et les événements spender sont conservés indéfiniment sans politique de rétention.

**Recommandation :**
Implémenter une politique de rétention automatique :
```sql
-- Supprimer les messages de plus de 12 mois
DELETE FROM tg_messages WHERE created_at < NOW() - INTERVAL '12 months';
-- Archiver les logs de plus de 6 mois
DELETE FROM bot_logs WHERE created_at < NOW() - INTERVAL '6 months';
```

---

### FINDING-21 — transaction_suggestions avec RLS trop permissive
**Axe :** 2 (Permissions)
**Sévérité :** BASSE
**Fichier :** `supabase/migrations/20260330_transaction_suggestions.sql:34-44`

```sql
CREATE POLICY "Authenticated users can read suggestions"
  ON public.transaction_suggestions FOR SELECT
  USING (auth.role() = 'authenticated');  -- Tout utilisateur authentifié

CREATE POLICY "Service role can insert suggestions"
  ON public.transaction_suggestions FOR INSERT
  WITH CHECK (true);  -- Aucun filtre sur l'insertion
```

**Recommandation :** Restreindre l'accès SELECT par modèle/chatter assigné.

---

### FINDING-22 — Service Worker sans validation d'intégrité
**Axe :** 5 (Frontend)
**Sévérité :** BASSE
**Fichier :** `sw.js`

**Description :**
Le service worker met en cache les ressources sans vérification d'intégrité (SRI). Si un CDN est compromis, le service worker cachera la ressource malveillante.

**Recommandation :**
Ajouter des vérifications d'intégrité pour les ressources tierces et invalider le cache lors des mises à jour.

---

### FINDING-23 — Broadcast Telegram sans confirmation utilisateur
**Axe :** 6 (Bot)
**Sévérité :** BASSE
**Fichier :** `bot/admin-bot.js:216-285`

**Description :**
La commande `/broadcast` envoie immédiatement les messages sans demander de confirmation explicite (inline keyboard par exemple). Le message "Envoi en cours..." est affiché mais l'envoi démarre immédiatement.

**Recommandation :**
Ajouter un inline keyboard de confirmation avant l'envoi.

---

### FINDING-24 — Utilisation d'API OnlyFans non officielle
**Axe :** 3 (API) + 7 (Compliance)
**Sévérité :** BASSE
**Fichier :** `supabase/functions/sync-platform/index.ts:57-119`

**Description :**
L'intégration OnlyFans utilise leur API interne non officielle, ce qui :
1. Peut violer les CGU d'OnlyFans
2. Peut se casser à tout moment sans préavis
3. Pose des questions de conformité pour les données collectées

**Recommandation :**
Documenter le risque légal et surveiller les changements d'API. Envisager une intégration officielle si disponible.

---

## 4. Roadmap de remédiation

### Phase 1 — Quick Wins (< 2h chacun) — IMMÉDIAT

| # | Action | Finding | Effort |
|---|--------|---------|--------|
| 1 | Supprimer `_DMSG_KEY_FALLBACK` hardcodé et faire tourner la clé API | F-01 | 30 min |
| 2 | Ajouter des headers de sécurité dans `vercel.json` | F-12 | 15 min |
| 3 | Supprimer les `console.log` sensibles en production | F-14 | 30 min |
| 4 | Remplacer l'URL Supabase dans `.env.example` par un placeholder | F-18 | 5 min |
| 5 | Ajouter l'authentification JWT sur `toggle-bot` et `get-bots-status` | F-05 | 1h |
| 6 | Restreindre CORS aux domaines DADASH uniquement | F-06 | 30 min |

### Phase 2 — Corrections majeures (1-3 jours) — CETTE SEMAINE

| # | Action | Finding | Effort |
|---|--------|---------|--------|
| 7 | Réécrire les policies RLS `USING (true)` avec filtrage par rôle/modèle | F-02, F-03 | 1 jour |
| 8 | Ajouter RLS à `paiements_internes` | F-04 | 1h |
| 9 | Ajouter des vérifications de rôle dans les fonctions SECURITY DEFINER | F-07 | 4h |
| 10 | Chiffrer les credentials des plateformes tierces | F-08 | 4h |
| 11 | Remplacer l'auth API key par JWT sur le session generator | F-11 | 2h |

### Phase 3 — Améliorations structurelles (1-2 semaines)

| # | Action | Finding | Effort |
|---|--------|---------|--------|
| 12 | Migrer vers un build pipeline (Vite/Next.js) pour éliminer Babel in-browser | F-13 | 3-5 jours |
| 13 | Implémenter rate limiting sur les Edge Functions | F-15 | 1 jour |
| 14 | Sanitizer tous les `innerHTML` avec DOMPurify | F-09 | 1 jour |
| 15 | Déplacer les clés API du localStorage vers la mémoire + proxy backend | F-10 | 2 jours |
| 16 | Implémenter les endpoints RGPD (export + suppression) | F-19 | 2-3 jours |
| 17 | Politique de rétention automatique des données | F-20 | 1 jour |

---

## 5. Checklist de sécurité — Actions immédiates

- [ ] **CRITIQUE** Supprimer la clé API hardcodée `679aa382...` de `index.html` et la faire tourner
- [ ] **CRITIQUE** Réécrire les policies RLS `USING (true)` sur spenders, profiles, models
- [ ] **CRITIQUE** Ajouter RLS à la table `paiements_internes`
- [ ] **HAUTE** Ajouter l'auth JWT sur `toggle-bot` et `get-bots-status`
- [ ] **HAUTE** Restreindre CORS à `https://dadash.co`
- [ ] **HAUTE** Ajouter des vérifications de rôle dans les fonctions SECURITY DEFINER
- [ ] **HAUTE** Chiffrer les credentials OnlyFans dans `platform_accounts`
- [ ] **MOYENNE** Ajouter les headers de sécurité (CSP, X-Frame-Options, HSTS) dans `vercel.json`
- [ ] **MOYENNE** Supprimer les `console.log` sensibles
- [ ] **MOYENNE** Implémenter rate limiting sur les endpoints critiques
- [ ] **BASSE** Implémenter les endpoints RGPD
- [ ] **BASSE** Ajouter une politique de rétention des données

---

## Annexe A — Fichiers audités

| Catégorie | Fichiers |
|---|---|
| Frontend | `index.html`, `vercel.json`, `sw.js`, `manifest.json`, `scripts/inject-build-id.js` |
| Bot admin | `bot/admin-bot.js`, `bot/.env.example`, `bot/package.json` |
| Autofill | `autofill/src/index.ts`, `autofill/src/supabaseClient.ts`, `autofill/src/ingest/handleMessage.ts` |
| Worker | `worker/src/index.ts`, `worker/src/poller.ts`, `worker/src/telegram.ts`, `worker/src/db.ts` |
| Session gen | `crm_routes_session_generator.py` |
| Edge Functions | `send-push-campaign`, `sync-platform`, `platform-health`, `toggle-bot`, `get-bots-status`, `get-bot-logs`, `update-bot-config` |
| Migrations SQL | 80+ fichiers dans `supabase/migrations/` |
| Config | `.gitignore`, `autofill/.env.example`, `worker/.env.example` |

## Annexe B — Méthodologie

1. **Analyse statique du code source** — Recherche de patterns dangereux (secrets, innerHTML, eval, SQL injection)
2. **Revue des migrations SQL** — Analyse exhaustive de toutes les policies RLS et fonctions SECURITY DEFINER
3. **Audit des Edge Functions** — Vérification de l'authentification, autorisation et validation des inputs
4. **Audit frontend** — Recherche de XSS, CSRF, stockage insécurisé, headers manquants
5. **Revue de la configuration d'infrastructure** — Vercel, Railway, Supabase

---

*Rapport généré le 2026-03-13 — DADASH Security Audit*
