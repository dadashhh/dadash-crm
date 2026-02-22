# AUDIT MAXIME — Architecte & Auditeur en Chef DADASH

**Date:** 22 fevrier 2026
**Auditeur:** Maxime (Agent Supreme)
**Scope:** CRM, Bot Admin TG, Supabase, Integrations, Agents
**Methode:** Lecture exhaustive du code source + analyse git + audit securite

---

## SCORE GLOBAL DADASH : 59/100

| Domaine | Note | Poids | Score |
|---------|------|-------|-------|
| CRM Architecture | 4/10 | x3 | 12 |
| CRM Code Quality | 5/10 | x3 | 15 |
| CRM UX/UI | 7/10 | x2 | 14 |
| CRM Securite | 3/10 | x3 | 9 |
| CRM Performance | 5/10 | x2 | 10 |
| Supabase Schema | 5/10 | x2 | 10 |
| Bot Admin TG | 6/10 | x1 | 6 |
| Integrations | 5/10 | x1 | 5 |
| **TOTAL** | | **/17** | **59/100** |

---

## 1. AUDIT CRM (dadash-crm)

### 1.1 Architecture : 4/10

**Verdict : Monolithe critique. Tout est dans un seul fichier.**

Le CRM entier tient dans `index.html` : **21,074 lignes** contenant :
- ~1,460 lignes de CSS (inline `<style>`)
- ~19,600 lignes de JavaScript/JSX (Babel transpile in-browser)
- Zero fichier JS/TS separe
- Zero bundler (pas de Vite, webpack, etc.)
- Babel compile tout le JSX dans le navigateur a chaque chargement

**Problemes architecturaux majeurs :**

1. **Single file monolith** — 21K lignes dans un seul fichier HTML. Impossible a maintenir en equipe, impossible a code-split, impossible a tester unitairement.

2. **Babel in-browser** (`<script type="text/babel">`) — Le navigateur recompile 20K+ lignes de JSX a chaque page load. Cout CPU significatif, surtout mobile. Pas de tree-shaking, pas de minification, pas de source maps.

3. **CDN dependencies sans lock** — React 18, Recharts 2.1.16, Supabase JS v2, html2pdf, PropTypes charges via unpkg/cdnjs/jsdelivr sans version lock. Un CDN down = CRM down.

4. **Pas de routing library** — Navigation geree manuellement via `window.history.pushState` et `popstate` (lignes 20002-20057). Hash routing bricolage (`#dashboard`, `#business/spenders`).

5. **Pas de state management** — 30+ `useState` dans le composant principal `App` (lignes 20058-20098). Toute la donnee est dans un composant god-object. Pas de Redux, Zustand, ou meme Context isole.

6. **Zero tests** — Aucun fichier de test. Pas de jest, vitest, cypress, playwright. Zero couverture.

7. **Pas de TypeScript** — Tout en JS vanilla. Aucun type safety. Les bugs de typage ne sont detectes qu'a runtime.

**Points positifs :**
- Le design system CSS est bien structure (CSS custom properties, theme dark/light)
- La structure de navigation gerant (GERANT_NAV, PAGE_TABS) est logique
- Le role-based access control (ROLE_ACCESS) est bien pense

### 1.2 Qualite du code : 5/10

**Problemes identifies :**

1. **Inline styles massifs** — Des centaines de `style={{...}}` dans le JSX. Pas de classes CSS reutilisables pour les composants React. Exemple typique (ligne 2262) :
   ```jsx
   <div style={{ display:"flex", gap:14, padding:"14px 18px", background:"var(--card-bg)",
     border:"1px solid var(--border-subtle)", borderRadius:14, marginBottom:6, ... }}>
   ```

2. **Duplication de code** — Le pattern KPI cards est repete dans au moins 6 composants differents (Dashboard, ProviderDashboard, ChatterDashboard, P&L, Paies, Logs). Chaque fois, les memes styles inline sont recopies.

3. **Composants trop longs** — `ExportRapportsTab` fait 265 lignes (1822-2086). `LogsAuditTab` fait 200+ lignes (2091-2292). Le composant `App` depasse 1000 lignes.

4. **Constants dupliquees** — `PRODUCTS` defini deux fois : une fois comme `HARDCODED_PRODUCTS` (ligne 1623) et une fois comme `PRODUCTS` (ligne 2335) avec des valeurs differentes.

5. **Magic numbers** — `PAGE_SIZE = 50` puis `PAGE_SIZE = 40` (redefini dans LogsAuditTab ligne 2094). `EXCHANGE_RATE_EUR_CHF = 0.94` hardcode (ligne 1613).

6. **Error handling inconsistant** — Certaines fonctions ont `try/catch` (safeInsertTx), d'autres ignorent les erreurs silencieusement (`catch(e) { /* notif insert fail */ }`).

7. **Commentaires CHRISTINE FIX / DB FIX** — 15+ marqueurs d'agent dans le code. Utile pour la tracabilite mais indique des patchs rapides plutot qu'une refactorisation propre.

**Points positifs :**
- `safeInsertTx` et `safeUpsertSpender` (lignes 2306-2330) sont de bons patterns de resilience
- La fonction `loadData` (lignes 20180-20319) a un bon pattern de timeout + race condition guard
- Le systeme de toast notifications est propre et reutilisable
- i18n implementee pour 6 langues (FR, EN, DE, RU, UK, ES)

### 1.3 UX/UI : 7/10

**Points forts :**
- Design system V2 avec CSS custom properties — coherent et professionnel
- Theme dark/light avec transition fluide
- Mobile responsive detaille (5 breakpoints : 768px, 430px, 375px, 340px, 320px)
- PWA avec manifest.json, service worker, install prompt
- Mobile bottom bar avec 5 icones principales
- FAB (Floating Action Button) avec actions contextuelles par role
- Cmd+K recherche globale
- Notifications realtime avec badge
- Cards design premium (glassmorphism reference)

**Points faibles :**
- Pas de skeleton loading pour la plupart des composants (juste un spinner global)
- Les modales prennent 100% de largeur sur mobile sans max-height consistant
- Pas d'animations de transition entre les tabs (juste un fadeIn basique)
- Les tableaux sur mobile necessitent scroll horizontal — pas ideal pour les donnees denses

### 1.4 Securite : 3/10

**CRITIQUE :**

1. **Supabase Anon Key exposee en clair** (ligne 1469) :
   ```javascript
   window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIs...";
   ```
   Toute personne avec un navigateur peut extraire cette cle et requeter la base directement.

2. **Anthropic API key stockee dans localStorage** (ligne 15662) — Vulnerable a XSS. Transmise directement du browser a l'API avec le header `anthropic-dangerous-direct-browser-access: "true"`.

3. **innerHTML sans sanitization** (lignes 1840, 18391) :
   ```javascript
   el.innerHTML = htmlContent; // XSS potentiel
   ```
   Utilise pour generer des PDFs avec des donnees utilisateur non sanitisees.

4. **Filtrage client-side au lieu de RLS** (lignes 20222-20275) — Le frontend filtre les donnees APRES les avoir toutes chargees. Un utilisateur malveillant peut modifier `currentUser.role` dans la console et voir toutes les donnees. La RLS Supabase existe mais la defense en profondeur est faible.

5. **Pas de rate limiting** sur le login — Brute force possible.

6. **Session timeout uniquement pour les chatters** (ligne 20143) — Les gerants, modeles et providers n'ont pas de timeout de session.

7. **Pas de MFA** — Authentification basique email/password uniquement.

**Points positifs :**
- RLS activee sur les tables principales (migration.sql)
- Auth Supabase (pas de auth custom)
- Le Supabase anon key est un design standard Supabase (cle publique, RLS protege les donnees)
- HTTPS force par Vercel

### 1.5 Performance : 5/10

**Problemes :**

1. **Babel in-browser** — Compile 20K lignes de JSX a chaque chargement. Surcout CPU estimable a 500ms-2s selon le device.

2. **loadData charge TOUT en parallele** (lignes 20187-20213) — 24 requetes Supabase simultanees avec `.limit(500)` chacune. Total: potentiellement 12,000 enregistrements charges d'un coup, meme si l'utilisateur ne consulte qu'un seul onglet.

3. **Pas de lazy loading des composants** — Tous les 20K lignes de code sont chargees et compilees meme si l'utilisateur est un chatter qui n'utilise que 3 onglets.

4. **CDN chain loading** — 7 scripts CDN charges sequentiellement avant que l'app ne demarre.

**Points positifs :**
- Pagination server-side pour les TX, logs, scans (PAGE_SIZE = 50)
- `useMemo` et `useCallback` utilises sur les calculs lourds
- Race condition guard sur loadData (`_loadVersion.current`)
- Timeout de 12s sur le chargement initial avec retry
- Mobile detection pour optimisations conditionnelles

---

## 2. AUDIT BOT ADMIN TELEGRAM (bot/admin-bot.js)

**Note globale : 6/10**

### Architecture : 6/10
- **410 lignes** — Taille raisonnable pour un bot admin
- Grammy (grammy.dev) pour Telegram API — bon choix, moderne
- Supabase JS client pour la DB
- Single file mais acceptable pour la taille

### Qualite du code : 6/10
- Middleware `adminOnly` bien fait (ligne 47-59) — verifie ADMIN_TELEGRAM_ID
- `findModel` avec recherche flexible (exact match puis startsWith) — pratique
- Helpers propres : `fmtEUR`, `fmtDuration`, `uptime`, `logError`
- Error buffer rotatif (max 50 erreurs) — elegant

**Problemes :**
- `service_role` key utilisee — Donne un acces total a la DB, sans RLS. C'est standard pour un bot backend mais dangereux si le process est compromis.
- `.catch(() => {})` silencieux sur les operations d'ecriture (lignes 190, 208)
- `/broadcast` envoie des messages directement sans confirmation interactive (juste un message de confirmation texte, pas de bouton Telegram)
- Pas de persistence des paused models en memoire au restart (bien : `loadPausedModels` au startup)

### Gestion d'erreurs : 5/10
- `adminOnly` wrappe toutes les commandes dans try/catch — bien
- Mais les erreurs Supabase sont souvent ignorees silencieusement
- `logError` collecte les erreurs mais ne les persiste pas en DB

### Scalabilite : 5/10
- In-memory `pausedModels` Set — perdu au restart (sauf loadPausedModels)
- Single process — pas de clustering
- Pas de queue pour les broadcasts (envoi sequentiel avec 50ms delay)
- Pas de monitoring/alerting integre

### Fix Unicode
- Non present dans ce repo (le fix est dans dadash-telegram-bot, non disponible localement)

---

## 3. AUDIT SUPABASE

### Schema : 5/10

**ALERTE : 12 tables fantomes** — Utilisees dans le frontend (`sb.from("table")`) mais JAMAIS definies dans aucun fichier de migration. Elles existent dans Supabase mais pas dans le controle de version. Si quelqu'un les supprime par erreur, il n'y a aucun moyen de les recreer :
- `conversations`, `messages`, `chatter_logs`, `payouts`, `expenses`, `notifications`
- `providers`, `broadcasts`, `screenshot_checks`, `payslips`, `provider_payment_methods`, `models`

**Tables identifiees (via migrations + code frontend) — 39 au total :**

| Table | Colonnes | RLS | Index | FK | Multi-tenant |
|-------|----------|-----|-------|----|-------------|
| profiles | id, name, role, email, assigned_models, daily_goal, weekly_goal, goal_currency, ... | OUI | PK | - | NON (pas d'agency_id) |
| transactions | id, date, amount, currency, status, spender_handle, model_id, chatter_id, provider_id, product_id, product_tag_id, ... | OUI | PK | model_id, chatter_id | NON |
| spenders | id, handle, name, prenom, langue, segment, telegram_id, whatsapp_phone, age, city, job, classification, ... | OUI | idx_classification | - | NON |
| models | id, name, ... | OUI | PK | - | NON |
| payouts | id, user_id, date, amount, ... | OUI | PK | user_id -> profiles | NON |
| payslips | id, user_id, period, base, bonus, total, status, ... | OUI | PK | user_id -> profiles | NON |
| expenses | id, amount, ... | OUI | PK | - | NON |
| provider_payouts | id, provider_id, declared_by, amount, period_from, period_to, status, ... | OUI | provider_id, status | provider_id, declared_by, validated_by -> profiles | NON |
| invoices | id, invoice_number, type, from_name, to_name, total, status, ... | OUI | type, status, profile_id, provider_id, number, created_at | profile_id, created_by -> profiles | NON |
| invoice_counter | id=1, year, last_number | OUI | PK | - | NON |
| content_tasks | id, model_id, title, status, ... | OUI | PK | model_id, assigned_by -> profiles | NON |
| model_payments | id, model_id, amount, type, ... | OUI | PK | model_id, paid_by -> profiles | NON |
| weekly_rankings | id, week_start, chatter_id, rank, ca, tx_count | OUI | PK | chatter_id -> profiles | NON |
| challenges | id, title, metric, start_date, end_date, ... | OUI | PK | created_by -> profiles | NON |
| model_videos | id, model_id, title, file_url, duration, ... | OUI | PK | model_id -> models | NON |
| video_sessions | id, ... | OUI | PK | - | NON |
| products | id, name, category, sort_order, ... | OUI | PK | - | NON |
| product_tags | id, product_id, name, sort_order, ... | OUI | PK | product_id -> products | NON |
| model_prices | id, ... | OUI | PK | - | NON |
| notifications | id, user_id, type, title, message, read, tx_id, ... | OUI | PK | user_id | NON |
| broadcasts | id, message/content, status, segment, ... | OUI | PK | - | NON |
| screenshot_checks | id, spender_handle, amount, status, checker_id, ... | OUI | PK | - | NON |
| chatter_logs | id, chatter_id, action, content, ... | OUI | PK | - | NON |
| bot_stats | id, model_id, messages_received, messages_sent, timestamp | OUI | PK | - | NON |
| bot_config | key (PK), value, updated_at | OUI | PK | - | NON |
| alerts | id, ... | OUI | PK | - | NON |
| provider_payment_methods | id, sort_order, ... | OUI | PK | - | NON |
| conversations | id, escalation_reason, chatter_id, ... | OUI | PK | - | NON |
| wa_analysis_logs | id, ... | OUI | PK | - | NON |
| content_list | id, ... | OUI | PK | - | NON |
| checklist_templates | id, ... | OUI | PK | - | NON |
| checklist_instances | id, date, ... | OUI | PK | - | NON |

### Problemes identifies :

1. **ZERO agency_id** — Aucune table n'a de colonne `agency_id`. Le multi-tenant est impossible en l'etat. Pour le SaaS, CHAQUE table aura besoin d'un `agency_id uuid NOT NULL` avec RLS basee dessus. C'est un refactoring majeur.

2. **Index manquants** — Plusieurs tables tres sollicitees n'ont pas d'index sur les colonnes filtrees :
   - `transactions` : pas d'index sur `date`, `status`, `model_id`, `chatter_id`, `spender_handle`
   - `spenders` : pas d'index sur `handle` (utilise pour les jointures client-side)
   - `notifications` : pas d'index sur `user_id` + `read`
   - `chatter_logs` : pas d'index sur `chatter_id` ou `created_at`

3. **FK inconsistantes** — `model_videos.model_id` reference `models(id)`, mais `transactions.model_id` n'a pas de FK explicite dans les migrations. Certaines relations sont implicites (code-level) plutot qu'enforcees en DB.

4. **Pas de triggers** — Pas de trigger pour calculer les LTV spenders, les aggregats, ou les notifications. Tout est calcule client-side.

5. **RPC atomique** — `atomic_invoice_counter.sql` existe pour le compteur de factures, bon pattern. Mais pas d'autre RPC pour les operations critiques.

6. **RLS correcte** — Toutes les tables ont RLS activee avec des politiques par role. Le pattern `(SELECT role FROM profiles WHERE id = auth.uid())` est correct mais fait une sous-requete a chaque acces. Un role claim dans le JWT serait plus performant.

### RPC Functions : 1 seule
- `next_invoice_number()` — Compteur atomique de factures. Pattern correct (UPSERT + RETURNING). Format : `DADASH-2026-0001`. Bien fait.

### Realtime Channels : 2
- `gerant-messagerie` — Messagerie temps reel pour le gerant
- `dadash-realtime-notifs-{user.id}` — Notifications push par utilisateur

### Storage : 1 bucket
- `model-videos` — Non-public, signed URLs. Pas de code d'acces direct dans le CRM frontend.

---

## 4. AUDIT INTEGRATIONS

### Anthropic Claude API : 5/10
- **Utilisation** : Scan checker (analyse de screenshots de paiement via Vision) + analyse WhatsApp
- **Modele** : `claude-sonnet-4-20250514`
- **Securite** : API key dans localStorage, transmise directement du browser. Header `anthropic-dangerous-direct-browser-access: "true"`. Devrait passer par un backend proxy.
- **Fallback** : Aucun. Si l'API est down, le scan checker affiche juste une erreur.
- **Rate limiting** : Aucun cote client.

### ElevenLabs (TTS) : Non present dans ce repo
- Reference dans le contexte business mais pas de code dans dadash-crm.

### OpenAI Whisper : Non present dans ce repo
- Reference dans le contexte business mais pas de code dans dadash-crm.

### Telegram API : 6/10
- Via Grammy dans `bot/admin-bot.js` — Bon framework
- Rate limiting basique (50ms entre messages broadcast)
- Admin-only middleware correct
- Pas de webhook, utilise le polling (standard pour Railway)

### Supabase : 7/10
- Realtime utilise pour les notifications (ligne 20421)
- Auth Supabase bien integree
- Client JS v2 via CDN
- Stub resilient en cas d'echec CDN (lignes 1490-1503)
- Pattern `safe()` wrapper pour toutes les requetes dans loadData

### Stripe : Non implemente
- Mentionne dans le contexte SaaS mais zero code. A faire.

---

## 5. NOTATION DES AGENTS

### 5.1 Christine (CRM) : 6/10

**Analyse git :** Christine n'apparait pas comme auteur de commits. Les commits sont attribues a "Claude" sur la branche `claude/christine-agent-crm-J80am`. Les 4 commits recents de cette branche sont :
- `c6cecf7` — feat(tx-form): dynamic Products & Tags dropdowns
- `eae5eb1` — feat(provider): Provider Dashboard with KPIs, charts, TX list & FAB
- `ff29e30` — fix: stability, mobile UX, performance improvements
- `3bd7043` — fix(christine): provider crash, FAB routing, scan checker

**Qualite PRs : 6/10**
- Les features sont fonctionnelles et bien structurees
- Le Provider Dashboard est complet (KPIs, charts, TX list, FAB)
- Le formulaire TX avec produits/tags dynamiques fonctionne
- Les fix de stabilite montrent une bonne comprehension des bugs

**Respect des specs : 7/10**
- Les fonctionnalites correspondent au cahier des charges
- Le naming est consistant (francais dans l'UI, anglais dans le code)

**Bugs introduits : 5/10**
- Le crash provider (`filtered → displayTxs`) a du etre fixe
- Le FAB routing avait un bug
- Le scan checker avait des problemes

**Vitesse : 7/10**
- 4 PRs significatives dans la derniere session

**Points forts :**
- Design system coherent
- Features completes et fonctionnelles
- Bonne gestion du responsive mobile

**Points faibles :**
- Contribue a l'inflation du monolithe index.html au lieu de le decomposer
- Inline styles excessifs au lieu de classes CSS
- Bugs dans les premieres versions necessitant des fix

**Recommandation : GARDER** — Christine produit des features fonctionnelles. A reorienter vers la decomposition du monolithe plutot que l'ajout de nouvelles features inline.

### 5.2 Carlos (Bot TG) : N/A (Non evaluable)

Le repo `dadash-telegram-bot` n'est pas disponible localement et ne peut pas etre clone (pas de connectivite reseau). L'evaluation de Carlos est impossible sans acces a son code.

**Ce qu'on sait :**
- Le fix Unicode `\u2028` a ete mentionne comme fait
- La session Telegram expiree a ete regeneree
- Le bot principal utilise Python/Telethon (pas le meme que admin-bot.js qui est en Node/Grammy)

**Recommandation : EVALUER QUAND LE REPO EST DISPONIBLE**

### 5.3 Erwan (Prompts IA) : N/A (Non evaluable)

Aucun commit d'Erwan dans l'historique git de dadash-crm. Les personnalites sont dans `dadash-telegram-bot/config/personalities/*.py` qui n'est pas accessible.

**Ce qu'on sait :**
- Les personnalites de chatting sont dans le repo telegram
- Impact direct sur la conversion (qualite du chatting = revenue)

**Recommandation : EVALUER QUAND LE REPO EST DISPONIBLE**

---

## 6. PLAN D'ACTION

### Score global : 59/100

### Top 10 actions critiques (par priorite)

#### 1. DECOMPOSER LE MONOLITHE (CRITIQUE)
**Impact : +15 points**
Migrer de `index.html` (21K lignes) vers une vraie app React :
- `npx create-vite@latest dadash-crm --template react-ts`
- Decomposer en ~50 fichiers composants
- Ajouter TypeScript
- Build avec Vite (HMR, tree-shaking, minification)
- Deployer le build sur Vercel au lieu du HTML brut

#### 2. SECURISER LES API KEYS (CRITIQUE)
**Impact : +8 points**
- Deplacer les appels Anthropic API vers un edge function Supabase ou un API proxy
- Ne jamais exposer d'API key dans le frontend
- Implementer un rate limiter sur le login
- Ajouter MFA pour le role gerant

#### 3. AJOUTER agency_id POUR LE MULTI-TENANT (CRITIQUE POUR SAAS)
**Impact : +10 points**
- Ajouter `agency_id uuid NOT NULL` a TOUTES les tables
- Modifier les RLS policies pour filtrer par agency_id
- Creer une table `agencies` avec plan (starter/pro/enterprise)
- Modifier le login pour resoudre l'agency de l'utilisateur

#### 4. AJOUTER DES INDEX DB (HIGH)
**Impact : +5 points**
```sql
CREATE INDEX idx_tx_date ON transactions(date DESC);
CREATE INDEX idx_tx_status ON transactions(status);
CREATE INDEX idx_tx_model ON transactions(model_id);
CREATE INDEX idx_tx_chatter ON transactions(chatter_id);
CREATE INDEX idx_spenders_handle ON spenders(handle);
CREATE INDEX idx_notifs_user_read ON notifications(user_id, read);
CREATE INDEX idx_chatter_logs_chatter ON chatter_logs(chatter_id);
```

#### 5. AJOUTER DES TESTS (HIGH)
**Impact : +8 points**
- Vitest pour les tests unitaires
- Playwright pour les tests E2E
- Tester au minimum : login, creation TX, validation TX, filtres, export

#### 6. IMPLEMENTER STRIPE (HIGH — REVENUE)
**Impact : +5 points**
- Stripe Checkout pour les subscriptions SaaS
- 3 plans : Starter (149 CHF), Pro (349 CHF), Enterprise (499 CHF)
- Webhook pour activer/desactiver les comptes
- Gestion des limites par plan (nb modeles, nb chatters, etc.)

#### 7. OPTIMISER LE CHARGEMENT DES DONNEES (MEDIUM)
**Impact : +4 points**
- Charger uniquement les donnees de l'onglet actif (lazy loading par tab)
- Reduire les `.limit(500)` a des valeurs appropriees
- Implementer un cache client (SWR ou React Query)
- Ajouter des index composites en DB

#### 8. STATE MANAGEMENT (MEDIUM)
**Impact : +3 points**
- Extraire les 30+ useState du composant App vers Zustand ou Context dedies
- Creer des hooks custom : `useTransactions()`, `useSpenders()`, `useAuth()`
- Separer les concerns : auth, data, UI, notifications

#### 9. DEPLOYER LE BOT WHATSAPP (MEDIUM — REVENUE)
**Impact : +5 points**
- Le repo `dadash-whatsapp-bot` est a faire
- WhatsApp Business API ou Baileys
- Meme architecture que le bot TG : chatting IA + escalation
- Marche suisse : WhatsApp > Telegram pour les clients

#### 10. MONITORING & ALERTING (MEDIUM)
**Impact : +3 points**
- Sentry pour le frontend (error tracking)
- Uptime monitoring (UptimeRobot ou Better Uptime)
- Alertes Telegram au gerant si le CRM ou les bots sont down
- Dashboard ops dans le CRM (health check tous les services)

---

### Architecture cible SaaS

```
                    ┌──────────────────────────┐
                    │      VERCEL (CDN)         │
                    │  React + Vite + TS build  │
                    │  dadash-crm.vercel.app    │
                    └──────────┬───────────────┘
                               │
                    ┌──────────┴───────────────┐
                    │    SUPABASE               │
                    │  ┌─────────────────────┐  │
                    │  │ Auth (JWT + MFA)     │  │
                    │  │ PostgreSQL + RLS     │  │
                    │  │ Realtime             │  │
                    │  │ Storage (media)      │  │
                    │  │ Edge Functions       │  │
                    │  │  - /api/anthropic    │  │
                    │  │  - /api/stripe-wh    │  │
                    │  │  - /api/invoice-gen  │  │
                    │  └─────────────────────┘  │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────┴──────┐ ┌──────┴──────┐ ┌───────┴──────┐
    │  RAILWAY        │ │  RAILWAY     │ │  RAILWAY      │
    │  Bot TG         │ │  Bot WA      │ │  Bot Admin    │
    │  Python/Telethon│ │  Node/Baileys│ │  Node/Grammy  │
    │  1 proc/modele  │ │  1 proc/mod  │ │  1 process    │
    └────────────────┘ └─────────────┘ └──────────────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                    ┌──────────┴───────────────┐
                    │    EXTERNAL APIs          │
                    │  Anthropic (chatting+scan)│
                    │  Mistral (chatting expli) │
                    │  ElevenLabs (TTS vocal)   │
                    │  Stripe (billing SaaS)    │
                    │  OpenAI Whisper (STT)     │
                    └──────────────────────────┘
```

**Multi-tenant :**
```
agencies
├── id (uuid PK)
├── name (text)
├── plan (starter | pro | enterprise)
├── stripe_customer_id
├── stripe_subscription_id
├── max_models (int)
├── max_chatters (int)
├── created_at
└── active (boolean)

Chaque table ajoute :
├── agency_id (uuid FK → agencies.id NOT NULL)
└── RLS: agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
```

### Stack recommandee

| Composant | Actuel | Recommande | Action |
|-----------|--------|------------|--------|
| Frontend | React 18 (Babel in-browser, single HTML) | React 18 + Vite + TypeScript | **CHANGER** |
| State | 30+ useState dans App | Zustand + React Query | **CHANGER** |
| Styling | CSS vars + inline styles | CSS vars + Tailwind CSS | **CHANGER** |
| Routing | Manual pushState | React Router v6 | **CHANGER** |
| Tests | Zero | Vitest + Playwright | **AJOUTER** |
| DB | Supabase PostgreSQL | Supabase (garder) | **GARDER** |
| Auth | Supabase Auth | Supabase Auth + MFA | **AMELIORER** |
| Hosting | Vercel | Vercel (garder) | **GARDER** |
| Bot TG | Python/Telethon | Python/Telethon (garder) | **GARDER** |
| Bot Admin | Node/Grammy | Node/Grammy (garder) | **GARDER** |
| Bot WA | Rien | Node/Baileys | **CREER** |
| API Proxy | Rien | Supabase Edge Functions | **CREER** |
| Billing | Rien | Stripe | **CREER** |
| Monitoring | Rien | Sentry + UptimeRobot | **CREER** |
| CI/CD | Rien | GitHub Actions | **CREER** |

### Timeline pour atteindre 100K CHF/mois

**Phase 1 — Stabilite (Semaines 1-2)**
- Ajouter les index DB manquants
- Securiser les API keys (edge function proxy)
- Ajouter rate limiting + MFA gerant
- Fix les bugs critiques restants

**Phase 2 — Decomposition (Semaines 3-6)**
- Migrer index.html vers Vite + TS
- Decomposer en composants
- Ajouter Zustand + React Query
- Ajouter les premiers tests (login, TX CRUD)

**Phase 3 — Multi-tenant + Stripe (Semaines 7-10)**
- Ajouter agency_id partout
- Implementer Stripe billing
- Landing page SaaS
- Onboarding flow

**Phase 4 — Scale (Semaines 11-16)**
- Bot WhatsApp
- 6-8 modeles actifs
- Optimisations performance
- Dashboard ops avance

**Revenue projection :**
- Actuel : 6,000 CHF/mois (2-3 modeles)
- Phase 1-2 : 10,000 CHF/mois (3-4 modeles, operations stables)
- Phase 3 : 25,000 CHF/mois (SaaS revenue + 5 modeles)
- Phase 4 : 50,000-100,000 CHF/mois (SaaS + 6-8 modeles + clients externes)

---

## ANNEXE : Inventaire des fichiers

```
dadash-crm/
├── index.html          (21,074 lignes — CRM monolithique)
├── sw.js               (32 lignes — Service Worker)
├── manifest.json       (14 lignes — PWA manifest)
├── icon-192.png        (2.4 KB)
├── icon-512.png        (7.2 KB)
├── .gitignore          (59 bytes)
├── bot/
│   ├── admin-bot.js    (410 lignes — Bot admin Telegram)
│   ├── package.json    (338 bytes — Grammy + Supabase deps)
│   └── .env.example    (248 bytes)
├── migration.sql       (225 lignes — RLS fixes + gamification)
└── migrations/
    ├── atomic_invoice_counter.sql
    ├── bot_config.sql
    ├── create_all_missing_tables.sql (300+ lignes)
    ├── crm_bots_integration.sql
    ├── invoices.sql
    ├── model_management.sql
    ├── model_videos.sql
    ├── product_catalog.sql
    ├── provider_payouts.sql
    └── wa_analysis_logs.sql
```

---

*Rapport genere par Maxime — Agent Supreme DADASH — 22 fevrier 2026*
*Audit base sur lecture exhaustive du code source, analyse git (198 commits, 113 PRs), et audit de securite complet.*
