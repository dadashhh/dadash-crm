# AUDIT COMPLET — Alfred (dadash-crm) — Messagerie

**Date :** 2026-03-18
**Agent :** Alfred (dadash-crm)
**Branche :** `audit/messagerie-full-diagnostic`
**Statut :** AUDIT UNIQUEMENT — AUCUNE MODIFICATION DE CODE

---

## PARTIE 1 — POINT STABLE ET HISTORIQUE DES COMMITS

### POINT STABLE IDENTIFIÉ

```
Commit: ff556cd — feat: call /mark-read on conversation open — all subpages
Date:   2026-03-17 23:45:13 UTC
PR:     #917
```

Ce commit correspond au fix "messages non lus qui restaient marqués non lus". Tout fonctionnait correctement à ce moment-là.

### COMMITS APRÈS LE POINT STABLE (du plus ancien au plus récent)

| # | Hash | Description | +/- lignes | Fichiers |
|---|------|-------------|------------|----------|
| 1 | `86358cb` | fix: keep conversation list visible during polling refresh | +1/-1 | index.html |
| 2 | `6241e46` | perf: fix loading state, add hidden guards, tindada fallback, reduce re-renders | +16/-12 | index.html |
| 3 | `3492ad0` | hotfix: fix insert().catch() chain in handleConfirmSend | +4/-4 | index.html |
| 4 | `2e1bf7a` | fix: complete media tracking in all subpages for cross-page grisage | +11/-1 | index.html |
| 5 | `8d3169e` | **perf: preload conversations at boot + supabase-first display** | +101/-59 | index.html |
| 6 | `e033f36` | feat: live-refresh messaging hub KPIs every 30s | +78/-5 | index.html |
| 7 | `8569ed9` | fix: show media in conversation after send (remove isPending condition) | +4/-4 | index.html |
| 8 | `019cfc7` | feat: TG button on spender card navigates to Conversations page with deep-link | +37/-3 | index.html |
| 9 | `efeccdb` | fix: rename TG button label to "💬 Conv" on spender card | +1/-1 | index.html |
| 10 | `362e145` | **fix: never show stale DB messages, show retry prompt instead** | +32/-77 | index.html |
| 11 | `d339406` | fix: filter supabase conversations to last 48h only | +2/-1 | index.html |
| 12 | `db29221` | **fix: remove all supabase fallback display — carlos live only everywhere** | +38/-102 | index.html |
| 13 | `5e63472` | **fix: carlos-only messaging — cache fallback, 20s timeouts, socket reconnect** | +55/-24 | index.html |
| 14 | `3e754b3` | **fix: add retry x2 + timeout to all send endpoints, fix Zoo Chat body key** | +28/-30 | index.html |
| 15 | `ea0ec7f` | fix: preserve media in bubbles after send via _keepMedia timestamp | +25/-18 | index.html |
| 16 | `70f702d` | fix: pass model_id query param to all GET /conversations/{id}/messages calls | +29/-15 | index.html |
| 17 | `4382d94` | **perf: stop polling spam on Conversations page** | +24/-3 | index.html |
| 18 | `fe32367` | feat: scroll infini vers le haut — load more messages avec pagination offset | +15/-12 | index.html |
| 19 | `0fb68e5` | **fix: guard conversations & messages state against non-array values (React Error #300)** | +40/-31 | index.html |
| 20 | `b79a9fa` | fix: conversation model filter now correctly filters by model_id | +6/-9 | index.html |
| 21 | `d7baf73` | fix: make all conversation filters work on messagerie page | +116/-58 | index.html |
| 22 | `91e1d95` | debug: add visible filter counter (X / Y conversations) + reset button | +7/-0 | index.html |

**Total : 22 commits non-merge après le point stable, tous dans `index.html`.**

**Commits à risque élevé (en gras) :** #5, #10, #12, #13, #14, #17, #19 — ces commits modifient le flux de données fondamental (passage Carlos-only, suppression fallback Supabase, refonte du polling, ajout retry/timeout).

---

## PARTIE 2 — FLUX ENVOI DE MESSAGE

### Il existe 3 flux d'envoi distincts selon la sous-page active :

---

### FLUX A — Page "Conversations" (DadashMessagerieConversationsTab) — `index.html:40700`

#### 1. Handler
- **Fonction :** `sendMessage` (ligne 40700, `useCallback`)
- **Trigger :** Enter dans l'input ou clic bouton envoyer
- **Guard :** `if (!selectedConv || !msgInputRef.current.trim()) return;`

#### 2. Message optimiste
- **ID temporaire :** `"pending-" + Date.now()` (ligne 40711)
- **Format :** `{ id: localId, text, direction: "out", is_outgoing: true, sender_type: "chatter", created_at: new Date().toISOString(), _pending: true }`
- **Ajout au state :** `setMessages(prev => [...prev, optimistic])` (ligne 40721)
- **Dédup :** AUCUNE — le message est ajouté directement au tableau, pas de vérification si un message identique existe déjà

#### 3. Appel API Carlos
- **Endpoint :** `POST /send-message` via `_dmsgFetch` (ligne 40748)
- **Params :** `{ chat_id, text, model_id }` (model_id optionnel)
- **Timeout :** 20 000 ms (20s)
- **Retries :** 2 tentatives (boucle `for _attempt = 1 to 2`, ligne 40746)

#### 4. Réponse Carlos — mise à jour state
- **Succès :** Le message optimiste reste dans le state avec `_pending: false` et id = `localId + "_sent"` (ligne 40755-40756)
- ⚠️ **PROBLÈME :** L'id optimiste change de `"pending-123"` à `"pending-123_sent"`, mais il n'est JAMAIS remplacé par l'id serveur réel. Le message avec l'ancien id reste.
- **Réconciliation :** `setTimeout` 2s après envoi (ligne 40782), appel `GET /conversations/{chatId}/messages?limit=50`, puis `mergeMessages(prev, list)` (ligne 40788)

#### 5. Polling messages
- **Fréquence :** Adaptatif — 30s si actif, 60s si idle >2min (lignes 40435-40450)
- **Re-fetch après envoi ?** OUI, via la réconciliation à 2s + le polling continu
- **Dédup avec optimiste :** La fonction `mergeMessages` (ligne 32166) filtre les messages `_pending` dont le texte matche un message serveur (via `serverTexts` set)

#### 6. Realtime Supabase
- **Channel :** `global-tg-messages-rt` (ligne 60734)
- **Event :** `INSERT` sur `tg_messages` → dispatch `CustomEvent('tg-message-insert')` (ligne 60738-60739)
- **Handler dans Conversations :** ligne 40387-40407 — vérifie si `msg.conversation_id` correspond à la conv active, puis `setMessages(prev => { if (prev.some(m => m.id === msg.id)) return prev; return [...prev, msg]; })`
- ⚠️ **DÉDUP PARTIELLE :** Vérifie par `msg.id` serveur uniquement. Le message optimiste a un id `"pending-123_sent"`, donc le message Realtime avec un id serveur différent sera ajouté en doublon.

#### 7. Toast
- **Toast erreur :** Affiché APRÈS les 2 tentatives (ligne 40797) — `addToast("Erreur envoi: " + e.message)`
- **Pas de toast après la 1ère tentative** — correct
- ⚠️ **MAIS :** Aucun toast de succès n'est affiché ! Le message optimiste passe simplement à `_pending: false`.

---

### FLUX B — Page "TgCarlosMessagerieTab" — `index.html:43791`

#### 1. Handler
- **Fonction :** `sendMessage` (ligne 43791, `useCallback`)
- **Guard :** `if (!selectedConv || !msgInput.trim() || sending || isReadOnly) return;`

#### 2. Message optimiste
- **ID temporaire :** `Date.now()` (nombre, pas string — ligne 43799)
- **Format :** `{ id: localId, text, direction: "out", is_outgoing: true, sender_type: "chatter", created_at: new Date().toISOString(), _pending: true }`
- **Ajout au state :** `setMessages(prev => [...prev, optimistic])` (ligne 43802)

#### 3. Appel API Carlos
- **Endpoint :** `POST /send-message` via `carlosFetch` (ligne 43804) — ⚠️ **utilise `carlosFetch` (15s timeout) au lieu de `_dmsgFetch` (20s timeout)**
- **Timeout :** implicite 15s (carlosFetch default)
- **Retries :** **AUCUN** — un seul appel, pas de boucle retry

#### 4. Réponse Carlos
- **Succès :** Toast "Message envoyé" (ligne 43809), puis `setTimeout` 2s pour reconciliation (lignes 43811-43828)
- **Reconciliation :** re-fetch `GET /conversations/{convId}/messages?limit=500`, puis merge complexe : filtrer les `_pending` dont le texte matche, ajouter les nouveaux messages serveur
- ⚠️ **PROBLÈME DOUBLON :** La reconciliation fait `[...withoutStale, ...toAdd]` — elle filtre les `_pending` dont le texte matche (`confirmedTexts`), puis ajoute les messages serveur qui n'étaient pas déjà présents (`!existingIds.has`). Mais si le message optimiste a un id numérique (ex: `1710756000000`) et le serveur retourne un UUID, ils ne matcheront pas par ID → ajouté comme nouveau → **DOUBLON**.

#### 5. Polling
- **Fréquence :** 30s (ligne 43640)
- **Re-fetch après envoi ?** OUI — le `setInterval` tourne en permanence, et la reconciliation 2s s'ajoute par-dessus

#### 6. Realtime
- Même handler que les autres pages (ligne 43614-43621)
- **Dédup :** `if (prev.some(m => m.id === msg.id)) return prev;` — par ID serveur uniquement
- ⚠️ **PROBLÈME :** Le message optimiste a id=`Date.now()` (nombre), le message Realtime a un UUID → pas de match → **DOUBLON**

#### 7. Toast
- **Erreur :** Message optimiste SUPPRIMÉ, texte restauré dans l'input (ligne 43832-43834)
- **Succès :** Toast "Message envoyé" affiché (ligne 43809) — OK

---

### FLUX C — Grid Premium (GridPremiumSubpage) — `index.html:33054`

#### 1. Handler
- **Fonction :** `_gpDoSend` (ligne 33054), appelé par `gpSendMessage` (ligne 33087)

#### 2. Message optimiste
- **ID :** `"opt-" + Date.now()` (string, ligne 33057)
- **Ajout :** via `setGpSlotMsgs` par slot (ligne 33059)

#### 3. API
- **Endpoint :** `POST /send-message` via `_dmsgFetch` (ligne 33068)
- **Timeout :** 20s
- **Retries :** 2 tentatives

#### 4. Réponse
- **Succès :** Le message optimiste est SUPPRIMÉ (`.filter(m => m.id !== _optId)`, ligne 33070), puis `gpLoadMsgsRef.current()` est appelé 800ms plus tard pour re-fetch (ligne 33072)
- ✅ **Pas de risque de doublon** — le message optimiste est supprimé avant le re-fetch

#### 5. Toast
- **Succès :** "Message envoyé" (ligne 33094)
- **Erreur :** "Erreur envoi : " + message (ligne 33096) — après les 2 tentatives

---

### SOURCES DE DOUBLONS IDENTIFIÉES

- [x] **Optimiste + polling** — Le message optimiste a un id temporaire (number ou "pending-*"), le polling ramène le message avec son id serveur (UUID) → les 2 coexistent dans le state
- [x] **Optimiste + realtime** — Le handler `tg-message-insert` ne déduplique que par `msg.id` serveur, jamais par correspondance texte avec les messages `_pending` → doublon
- [x] **Polling + realtime** — ⚠️ Risque modéré : le polling fait `mergeMessages()` qui déduplique par ID, et le realtime fait `prev.some(m => m.id === msg.id)` — si le même message arrive des 2 sources avec le même ID serveur, la dédup fonctionne. **MAIS** le timing peut causer un double-add si realtime arrive entre 2 polls.
- [x] **Retry crée un 2ème message optimiste** — NON pour les Flux A & C (le retry est dans une boucle, même optimiste). **MAIS** le retry utilisateur (clic "Réessayer") dans le flux C crée un NOUVEAU message optimiste (`gpRetryMsg` ligne 33102-33114 supprime l'ancien puis appelle `_gpDoSend` qui en crée un nouveau).

### SCÉNARIO TYPE DE DOUBLON (Flux A — Conversations)

1. User envoie "Salut" → optimiste `{id: "pending-123", text: "Salut", _pending: true}` ajouté
2. API Carlos OK → id changé en `"pending-123_sent"`, `_pending: false`
3. 2s plus tard : reconciliation GET → serveur retourne `{id: "uuid-abc", text: "Salut"}` → `mergeMessages` voit que "Salut" matche un texte existant → MAIS le message existant a `_pending: false` (plus pending) → il n'est PAS filtré par `localOnly` → le serveur message s'ajoute au Map avec une clé différente → **DOUBLON**

**C'est LE bug principal.** Après succès, `_pending` est mis à `false`, donc `mergeMessages` ne le considère plus comme "local only" et ne le filtre pas. Les 2 messages coexistent.

---

## PARTIE 3 — FLUX DE RÉCEPTION DE MESSAGES

### 1. Sources de données (3 sources simultanées)

| Source | Composant | Fréquence | Handler |
|--------|-----------|-----------|---------|
| **Supabase Realtime** | Global (MultiTabMessagerieApp, ligne 60734) | Temps réel | `CustomEvent('tg-message-insert')` dispatché, écouté par chaque sous-page |
| **WebSocket Carlos** | TgCarlosMessagerieTab (ligne 43649) | Temps réel | `socket.on('new_message', ...)` — ajoute au state + met à jour la conv |
| **Polling HTTP** | Chaque sous-page | 30s (ou 60s idle) | `GET /conversations/{id}/messages` ou `carlosFetch("/conversations")` |

### 2. Polling conversations

| Sous-page | Fréquence | Détails |
|-----------|-----------|---------|
| Conversations (DadashMessagerieConversations) | 30s (ligne 40467) | `setInterval` stable (deps vides), guard `isConvPollingRef` pour éviter // |
| TgCarlosMessagerieTab | 30s (ligne 43640) | Aussi rafraîchit les messages de la conv active |
| Grid Premium | 30s (ligne 32940, 32949) | 2 intervals : un pour les slots, un pour le refresh tick |
| MessagerieHub | 30s (ligne 39277) | KPIs seulement |

### 3. Conflit polling vs realtime

#### Dans Conversations (ligne 40387-40407) :
- **Realtime handler :** Ajoute le message si `msg.id` n'existe pas dans `prev` — dédup par ID ✅
- **Polling handler (loadMessagesById) :** Utilise `mergeMessages()` qui merge par ID Map — dédup par ID ✅
- ⚠️ **MAIS :** Si le realtime ajoute un message pendant que le polling est en cours, et que le polling retourne une liste qui n'inclut pas encore ce message (race condition), le message apparaît brièvement, disparaît au prochain poll, puis réapparaît — "messages fantômes"

#### Dans TgCarlosMessagerieTab (lignes 43614 + 43649) :
- **TRIPLE source :** Supabase Realtime (`tg-message-insert`) + WebSocket Carlos (`new_message`) + polling 30s
- ⚠️ Le handler Supabase (ligne 43617) et le handler WebSocket (ligne 43656) font tous les 2 un check `prev.some(m => m.id === msg.id)` — OK si même ID
- **MAIS :** Le Supabase Realtime retourne l'ID de la table `tg_messages`, tandis que le WebSocket Carlos peut retourner un objet avec un format d'ID différent → risque de doublon si les formats diffèrent

### 4. Latence perçue ("5 min de retard")

**Cause probable :** Combinaison de :
1. **Supabase Realtime non fiable :** Le channel `global-tg-messages-rt` peut se déconnecter silencieusement (pas de heartbeat visible, pas de reconnexion automatique)
2. **Polling à 30s :** Si le realtime tombe, le fallback polling est lent (30s minimum, 60s si idle)
3. **`document.hidden` guard :** Tous les polls sont skippés si l'onglet est caché (lignes 40439, 43641) — si l'utilisateur revient après 5 min, il attend le prochain tick de polling
4. **Pas de refresh au `visibilitychange` dans les sous-pages messages** — seul le Hub a un `visibilitychange` handler (ligne 39286). Les pages Conversations et TgCarlos n'en ont PAS.

---

## PARTIE 4 — AUDIT DES FILTRES

### Page "Conversations" (DadashMessagerieConversationsTab)

Tous les filtres sont définis dans un `useMemo` (lignes 40601-40697).

#### 1. Filtre Modèle (`filterModel`)
- **State :** `useState("all")` (ligne 39468)
- **Application :** `result.filter(c => String(c.model_id || "") === String(filterModel))` (ligne 40619)
- **UI :** Pills modèles (ligne 41694)
- ✅ **Fonctionne** — compare `model_id` (UUID) directement

#### 2. Filtre Segment / Tier (`filterTier`)
- **State :** `useState("all")` (ligne 39469)
- **Application :** Lignes 40628-40659 — vérifie `spender.tier` d'abord, fallback sur `TIER_RANGES` (montants)
- **Dépendance :** `spenderFilterMap` — un Map qui lie `tg_chat_id` → données spender
- ⚠️ **PROBLÈME POTENTIEL :** Le `spenderFilterMap` est construit à partir de `spenders` (prop) et utilise `sp.telegram_user_id || sp.tg_user_id || sp.tg_chat_id` comme clé. Si la conversation Carlos utilise un `chat_id` différent du `tg_chat_id` du spender → le lookup échoue → le filtre ne matche rien.

#### 3. Filtre Langue (`filterLang`)
- **State :** `useState("all")` (ligne 39470)
- **Application :** Lignes 40663-40670 — récupère `sp.langue` via `_getSpender(c)` ou `c.spender_language`
- ⚠️ **PROBLÈME :** Si `_getSpender` retourne `null` (spender non trouvé dans le map), la langue est `""` → la conversation est exclue de TOUS les filtres langue sauf "all" et "other"

#### 4. Filtre Non-lus (`showUnreadOnly`)
- **State :** `useState(false)` (ligne 39471)
- **Application :** `result.filter(c => (c.unread_count || 0) > 0)` (ligne 40624)
- ✅ **Fonctionne** — si `unread_count` est correctement maintenu côté Carlos

#### 5. Filtre FREE / Payant (`filterSpender`)
- **State :** `useState("all")` (ligne 39467)
- **Application :** Lignes 40672-40681
- **"paying" :** `_getTotal(c) >= 1`
- **"free" :** `sp.tier === "free" || total === 0`
- ⚠️ **MÊME PROBLÈME** que le filtre segment — dépend de `spenderFilterMap` pour résoudre le spender

#### 6. Filtre Recherche (`searchQuery`)
- **Application :** Lignes 40684-40691 — recherche dans `first_name`, `display_name`, `username`, `tg_username`
- ✅ **Fonctionne** — recherche texte basique

### Pourquoi les filtres semblent "tous cassés" ?

**Cause racine : `spenderFilterMap` vide ou incomplet.**

Le `spenderFilterMap` (probablement construit via `spenders` prop) dépend de la correspondance entre les IDs Telegram des spenders et les `chat_id` des conversations Carlos. Depuis le passage à "Carlos-only" (commits #12-13), les conversations viennent de l'API Carlos qui peut utiliser des formats d'ID différents de Supabase. Si le mapping échoue :
- Filtre segment → ne trouve aucun spender → filtre tout
- Filtre langue → langue inconnue → filtre tout
- Filtre FREE → total = 0 pour tous → tout apparaît comme "free"

**Autre cause possible :** Les conversations Carlos n'ont pas de champ `model_id` dans le même format que les modèles Supabase → le filtre modèle compare des UUIDs qui ne matchent pas.

### Page "GerantMessagerieTab" (ligne 30298)

- **Filtre modèle :** Compare `conv.model_name` (string) avec `filterModel` (string) en `.toLowerCase()` (ligne 30468)
- ⚠️ **PROBLÈME :** Si `conv.model_name` est undefined (données Carlos), `getModelName(conv.model_id, models)` est appelé en fallback — mais `models` peut ne pas avoir le mapping pour les IDs Carlos
- **Filtre statut :** Basé sur `getConvStatus()` qui lit `conv.escalation_reason`, `conv.chatter_id`, `conv.status` — devrait fonctionner si ces champs existent
- **Filtre spender :** Utilise `getSpender(conv)` qui cherche par `handle` — fragile si les handles ne matchent pas

---

## PARTIE 5 — AUDIT DE LA STABILITÉ

### 1. React Error #300

**Qu'est-ce que React Error #300 ?**
`Minified React error #300` = "Objects are not valid as a React child" — se produit quand on essaie de rendre un objet dans le JSX au lieu d'une string/number/element.

**Cause identifiée :**
- Quand Carlos timeout, l'API peut retourner un objet d'erreur ou `{}` au lieu d'un array
- Avant le commit `0fb68e5`, le code faisait `.map()` directement sur `conversations` et `messages` sans vérifier que c'étaient des arrays
- Le commit `0fb68e5` a ajouté des guards `Array.isArray()` et `_safeConvs` (lignes 32825, 41301)

**Composants à risque :**
- `GerantMessagerieTab` (ligne 30623) — utilise `(Array.isArray(messages) ? messages : []).map(...)` ✅ (fixé)
- `TgCarlosMessagerieTab` — `setMessages([])` comme fallback quand Carlos échoue (ligne 43761) ✅
- `DadashMessagerieConversations` — `_safeConvs = Array.isArray(conversations) ? conversations : []` (ligne 41301) ✅

**Mais :** Les guards ne protègent pas contre un cas subtil — quand `carlosFetch` retourne `{}` (objet vide, pas d'erreur HTTP), `Array.isArray({})` = false, mais le code fait :
```js
const list = Array.isArray(data) ? data : (data.conversations || data.data || []);
```
Si `data = {}`, alors `list = []` — OK. **Mais** si `data = { conversations: "error" }` (string au lieu d'array), `list = "error"` → `.map()` crash sur une string.

### 2. Crash quand Carlos timeout

**Flux du timeout :**
1. `_dmsgFetch` attend 20s (via `AbortController`, ligne 31898)
2. Timeout → `throw new Error("Carlos timeout après 20000ms")` (ligne 31917)
3. Catch dans `loadConversations` → fallback Supabase (pour TgCarlos, ligne 43592-43604)
4. Si Supabase aussi échoue → `setConversations([])` (ligne 43604)

**Guards existants (post-commit `0fb68e5`) :**
- `Array.isArray(conversations)` checks avant `.map()` ✅
- `setConversations([])` comme fallback ✅
- `setMessages([])` comme fallback ✅

**Risque résiduel :**
- Le polling continue de tourner même pendant un timeout → si Carlos revient avec des données partielles pendant que le state est `[]`, il y a un flash de contenu
- Le WebSocket Carlos (`window.__dadashSocket`) peut aussi envoyer des events pendant que le state est en erreur → crash potentiel si le handler assume que `conversations` est peuplé

### 3. `_keepMedia` et `_keepUntil` — messages fantômes

**Mécanisme :**
- `_keepMedia` est un timestamp (ex: `Date.now() + 15000`) ajouté aux messages médias après envoi (commit `ea0ec7f`)
- **But :** Empêcher la reconciliation (polling/mergeMessages) de supprimer le `media_url` d'un message optimiste avant que le serveur ne confirme
- **Durée :** 15 secondes

**Problème de messages fantômes :**
- La fonction `mergeMessages` (ligne 32171-32172) garde les messages locaux qui ont `_keepMedia && Date.now() < _keepMedia`
- **Si le serveur ne confirme JAMAIS le message** (envoi échoué silencieusement, pas d'erreur retournée), le message avec `_keepMedia` reste visible pendant 15s, puis disparaît au prochain merge — l'utilisateur voit un message qui "s'évapore"
- **Si le message est confirmé mais avec un ID différent** → le message optimiste avec `_keepMedia` ET le message serveur coexistent pendant 15s → doublon temporaire visible

**`_keepUntil` :** Non trouvé dans le code actuel. Le mécanisme a probablement été renommé en `_keepMedia`.

---

## RÉSUMÉ DES BUGS CRITIQUES

### Bug #1 — Doublons message envoyé (CRITIQUE)
**Root cause :** Après succès API, le message optimiste passe `_pending: false` mais garde un ID temporaire. La reconciliation (mergeMessages) ne filtre que les messages `_pending: true`, donc le message confirmé par le serveur (avec un UUID différent) s'ajoute en plus → **DOUBLON**.

**Impact :** Chaque message envoyé apparaît 2 fois (parfois 3 avec le Realtime).

**Fix suggéré :** Après succès API, SUPPRIMER le message optimiste et ne garder que le message serveur. Ou bien : stocker l'ID serveur retourné par `/send-message` et remplacer l'optimiste.

### Bug #2 — Triple source de données dans TgCarlosMessagerieTab (CRITIQUE)
**Root cause :** 3 sources ajoutent des messages au state simultanément :
1. Supabase Realtime (`tg-message-insert`)
2. WebSocket Carlos (`new_message`)
3. Polling 30s

Les 3 handlers font une dédup par ID mais les formats d'ID peuvent différer entre sources.

**Impact :** Doublons, messages dans le désordre, "fantômes".

### Bug #3 — Pas de refresh au retour d'onglet (MODÉRÉ)
**Root cause :** Les sous-pages messages n'écoutent pas `visibilitychange` — quand l'utilisateur revient sur l'onglet, il doit attendre le prochain tick de polling (30-60s).

**Impact :** Latence perçue de "5+ minutes" — en réalité, c'est le délai avant le prochain poll.

### Bug #4 — Filtres dépendants de spenderFilterMap (MODÉRÉ)
**Root cause :** Les filtres segment, langue et FREE dépendent d'un mapping spender ↔ conversation via `tg_chat_id`. Si le mapping échoue (IDs incompatibles entre Carlos et Supabase), tous ces filtres retournent des résultats vides.

**Impact :** Filtres semblent "cassés" — sélectionner un segment filtre tout.

### Bug #5 — Toast erreur alors que message envoyé (MINEUR)
**Root cause :** Dans le flux A (Conversations), si la 1ère tentative timeout à 20s mais que Carlos a quand même traité le message, la 2ème tentative réussit (ou échoue aussi) → toast erreur affiché, mais le message a été envoyé côté serveur lors de la 1ère tentative.

**Impact :** L'utilisateur voit "Erreur envoi" alors que le message est bien parti.

### Bug #6 — Timeout 15s vs 20s incohérent (MINEUR)
**Root cause :** `carlosFetch` a un timeout de 15s (ligne 31126), `_dmsgFetch` a un timeout de 20s (ligne 31890). TgCarlosMessagerieTab utilise `carlosFetch` pour envoyer (15s) tandis que Conversations utilise `_dmsgFetch` (20s).

**Impact :** TgCarlos timeout 5s plus tôt que Conversations pour la même opération.

---

## RECOMMANDATION

**Option A — Revert ciblé :** Revenir au commit `ff556cd` (point stable), puis re-appliquer sélectivement :
- `fe32367` (scroll infini) — feature utile, risque faible
- `4382d94` (stop polling spam) — fix important
- `0fb68e5` (guards React Error #300) — fix important

**Option B — Fix forward :** Corriger les bugs identifiés dans l'état actuel :
1. Unifier le mécanisme de dédup : supprimer le message optimiste dès que le serveur confirme (comme Grid Premium le fait déjà)
2. Supprimer la triple source dans TgCarlosMessagerieTab (garder Realtime + polling, supprimer WebSocket OU garder WebSocket + polling, supprimer Realtime)
3. Ajouter `visibilitychange` listener dans toutes les sous-pages
4. Vérifier/fixer le mapping spenderFilterMap pour les IDs Carlos

**Option recommandée : A** — Le code a accumulé trop de patches contradictoires. Un revert propre + re-application sélective sera plus rapide et plus sûr qu'un fix forward.
