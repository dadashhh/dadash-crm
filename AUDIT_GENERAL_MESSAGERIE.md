# AUDIT GÉNÉRAL MESSAGERIE — DadashMessagerieTab & pages associées

**Date :** 2026-03-29
**Fichier :** `index.html` (~65 261 lignes)
**Scope :** Rôles, accès, filtrage, composants, race condition, dédup, TX tracking

---

## 1. RÔLES ET ACCÈS ACTUELS

### 1.1 Détermination du rôle

Le rôle vient de la table `profiles` en DB Supabase, **pas** du JWT.

| Contexte | Ligne | Query |
|----------|-------|-------|
| Login | L28313 | `sb.from("profiles").select("*").eq("id", data.user.id).single()` |
| Session restore | L60885 | `sb.from("profiles").select("*").eq("id", session.user.id).single()` |
| onAuthStateChange | L60221 | Idem |
| Composant messagerie | L39586-39590 | `sb.from('profiles').select('role, assigned_models').eq('id', authUser.id).single()` |

Le JWT Supabase (`access_token`) sert uniquement de Bearer token pour l'API Carlos. Il ne contient **aucun claim** `role`.

### 1.2 Fallback dangereux — **P0 SÉCURITÉ**

**L39594 et L39602** : si le fetch du profil échoue (erreur réseau, Supabase down), le code fait :
```js
setUserProfile({ role: 'gerant', assigned_models: [] });
```
**Impact** : un chatter dont le profil ne charge pas temporairement obtient le rôle `gerant` → voit TOUTES les conversations, tous les modèles. C'est une escalade de privilèges silencieuse.

### 1.3 Filtre par rôle sur les conversations

**Oui, double couche** — mais application-side uniquement :

| Couche | Ligne | Mécanisme |
|--------|-------|-----------|
| Query-time | L39732-39735 | `.in("model_id", _assigned)` sur la query Supabase `tg_conversations` |
| Client-side | L39798-39803 | `list.filter(c => assigned.includes(c.model_id))` |

**Aucune RLS** sur `tg_conversations` ni `tg_messages`. La clé anon Supabase est embarquée dans le HTML. Un chatter techniquement compétent peut requêter directement la DB et voir toutes les conversations.

### 1.4 Gérant vs Chatter — même code ou différent ?

**Même composant** (`MessagerieHubPage`) pour les deux rôles :
- Gérant (L61641-61642) : `<MessagerieHubPage user={user} ... />`
- Chatter (L62202) : `<MessagerieHubPage user={user} ... />`

Le composant s'adapte en interne via `userProfile.role` et `chatterCtx`.

### 1.5 Manager Chatter

**Le rôle `manager_chatter` existe** (L8258) avec ses propres pages :
```js
manager_chatter: ["mc_dashboard","mc_chatters","mc_transactions","mc_solde"]
```

**`messagerie` n'est PAS dans la liste** → un manager_chatter n'a pas accès à la messagerie via le tab router normal. **MAIS** les routes standalone (`STANDALONE_TABS`, L8274) contournent cette restriction — un manager_chatter qui navigue directement vers `/#/messagerie` y accède quand même (L8289 : `if (STANDALONE_TABS.has(tabId)) return true`).

La table `manager_chatters` (L26561) lie un `manager_id` à des `chatter_id`. Le scope modèle d'un manager est dérivé des `assigned_models` de ses chatters liés (L60705).

**Verdict :** l'infrastructure manager_chatter est partiellement en place (DB, pages mc_*), mais l'intégration messagerie n'est pas faite.

---

## 2. FILTRAGE PAR MODÈLE

### 2.1 Appels fetch vers Carlos API

| Endpoint | model_id inclus ? | Ligne | Détail |
|----------|-------------------|-------|--------|
| `GET /conversations` | **NON** | L39739 | `_dmsgFetch("/conversations")` — aucun param |
| `GET /conversations/{cid}/messages` | **Conditionnel** | L39892 | `+ (_selMid ? "&model_id=" + _selMid : "")` |
| `POST /send-message` | **Conditionnel** | L40830-40838 | `modelId ? { ..., model_id } : { ... }` |

**Problème** : le `GET /conversations` ne filtre pas par modèle côté API. C'est le CRM qui filtre après réception. Si Carlos retourne 500 convs pour tous les modèles, un chatter assigné à 1 seul modèle les reçoit TOUTES, puis filtre client-side.

### 2.2 Où se fait le filtre

| Niveau | Implémenté ? | Ligne |
|--------|-------------|-------|
| Carlos API | **NON** | L39739 — pas de param `model_id` |
| Supabase query | **OUI** (chatter) | L39732-39735 — `.in("model_id", _assigned)` |
| Client-side | **OUI** (chatter) | L39798 — `list.filter(...)` |
| RLS Supabase | **NON** | Aucune policy visible |

### 2.3 Convs qui passent sans filtre — **P1**

Le gérant ne filtre jamais → comportement correct.
Le chatter filtre par `assigned_models` → correct SI le profil charge.
**Si le profil fail → fallback `gerant`** (cf. 1.2) → le chatter voit tout.

La query Carlos `/conversations` ne passe aucun filtre → toutes les convs de l'agence transitent sur le réseau, même pour un chatter.

---

## 3. PAGES ET COMPOSANTS

### 3.1 Table récapitulative

| Route | Tab ID | Composant | Ligne rendu | Accès rôle |
|-------|--------|-----------|-------------|------------|
| `/#/messagerie` | `messagerie` | `MessagerieHubPage` | L61642 (gérant), L62202 (chatter) | gerant, chatter (ROLE_ACCESS) + tous (STANDALONE) |
| `/#/messagerie-conversations` | `messagerie-conversations` | `DadashMessagerieTab` | L61589 | Tous (STANDALONE) |
| `/#/messagerie-tlg-pro` | `messagerie-tlg-pro` | `TlgProStandalonePage` | L61544-61555 | Tous (STANDALONE) |
| `/#/messagerie-tindada` | `messagerie-tindada` | `TindadaInboxZeroPage` | L61557-61568 | Tous (STANDALONE) |
| `/#/messagerie-grid-premium` | `messagerie-grid-premium` | `GridPremiumStandalonePage` | L61570-61581 | Tous (STANDALONE) |
| `/#/messagerie-grid` | `messagerie-grid` | `MessagerieGridApp` | L61538 | Tous (STANDALONE) |
| `/#/messagerie-multi` | `messagerie-multi` | `MultiTabMessagerieApp` | L61527 | Tous (STANDALONE) |

### 3.2 `GerantMessagerieTab` — composant orphelin — **P3**

**Défini** à L29811 mais **jamais rendu**. Aucun `<GerantMessagerieTab />` dans le JSX. Code mort (~300 lignes).

### 3.3 Bugs par composant

| Composant | Bugs visibles |
|-----------|--------------|
| `DadashMessagerieTab` | BUG 1 (dédup tg_chat_id), BUG 2 (race condition — fix en cours), pas de virtualisation DOM |
| `TlgProStandalonePage` | Pas de scroll infini (30 fetch / 12 affichés), pas de Realtime, pas de date/heure sur bulles, pas de rendu médias reçus |
| `GridPremiumStandalonePage` | Pas de scroll infini, pas de Realtime, pas de date/heure, input partagé entre cellules, pas de rendu médias |
| `TindadaInboxZeroPage` | Grisage médias hardcodé `[]`, pas de TX modal, pas de media lib, pas de Realtime |
| `MessagerieHubPage` | Hub de navigation — redirige vers les sous-pages, pas de bug propre |

### 3.4 Accès identique ou différencié — **P2**

**Toutes les pages standalone** (`STANDALONE_TABS`) sont accessibles à **tous les rôles** sans vérification (L8289). Un utilisateur `provider` ou `modele` pourrait naviguer directement vers `/#/messagerie-tlg-pro` et voir les conversations. Aucun guard rôle dans ces composants standalone.

---

## 4. ÉTAT DU FIX RACE CONDITION (BUG 2)

### 4.1 Les 3 guards sont en place

Branche `fix/messages-stale-guard` — **PR #1048** — 6 lignes ajoutées, 0 supprimées.

| # | Ligne | Emplacement | Guard |
|---|-------|-------------|-------|
| 1 | L39952 | Path non-initial (polling) | `if (String(chatIdRef.current) !== cid) return;` |
| 2 | L39998 | Fallback Supabase | `if (String(chatIdRef.current) !== cid) return;` |
| 3 | L40006 | Catch fallback Supabase | `if (String(chatIdRef.current) !== cid) return;` |

### 4.2 Positionnement correct ?

**Oui.** Chaque guard est placé :
- **Après** le `await` (fetch Carlos L39892 / query Supabase L39979-39986)
- **Avant** le `setMessages(...)` correspondant
- Le `cid` est capturé **au début** de `loadMessagesById` (L39858 : `const cid = String(chatId)`)

Le pattern est correct : `cid` est frozen au lancement, `chatIdRef.current` reflète la conv courante au moment de la réponse.

### 4.3 Limite résiduelle

Le guard ne protège **pas** le path `isInitial=true` principal (L39945 : `setMessages(nList)`). Ce path est protégé par l'AbortController (`signal?.aborted` check L39893). Le signal est passé par `selectConv` → `loadMessagesById(chatId, true, controller.signal)` (L40173). La couverture est complète pour ce path.

**Le polling** (L40512) appelle `loadMessagesById(chatIdRef.current, false)` **sans signal** → c'est le guard #1 qui protège. Correct.

---

## 5. DÉDUP ET CLÉ DE CONVERSATION

### 5.1 Clé de déduplication dans `loadConversations`

**L39767** :
```js
const cid = c.id || c.tg_chat_id || c.chat_id;
```

L'API Carlos ne retourne **pas** de champ `id` sur les conversations (confirmé par commentaire L40258-40260). La clé retombe sur `tg_chat_id` = Telegram chat ID du spender.

**Conséquence** : pour un spender qui parle à Carla ET Sophie, les 2 convs ont le **même** `tg_chat_id`. La 2e conv est filtrée par `idSet.has(String(cid))` → **invisible**.

### 5.2 `_dmsgChatId` — ce que ça retourne

**L31578-31581** :
```js
const _dmsgChatId = (conv) => {
  if (!conv) return null;
  return conv.tg_chat_id || conv.chat_id || conv.telegram_chat_id || conv.tg_id || conv.id || null;
};
```

Retourne le **Telegram chat ID** brut. **Ne contient jamais `model_id`.**

### 5.3 `selectedChatId` — inclut-il `model_id` ?

**Non.** L40262 :
```js
const selectedChatId = selectedConv ? String(_dmsgChatId(selectedConv) || "") : "";
```

Même spender / modèle différent → même `selectedChatId` → les useEffect ne re-trigger pas.

### 5.4 Usages de `_dmsgChatId`

**118 occurrences** dans le fichier. Tout changement de sémantique de cette fonction impacterait massivement le code.

### 5.5 Résumé du problème de clé — **P0**

| Élément | Clé utilisée | Inclut model_id ? | Bug ? |
|---------|-------------|-------------------|-------|
| Dédup convs (loadConversations) | `c.id \|\| c.tg_chat_id` | **NON** | **OUI** — 2e conv invisible |
| selectedChatId (useEffect key) | `_dmsgChatId(conv)` | **NON** | **OUI** — effects ne re-trigger pas |
| Cache messages | `_DMSG_MSG_CACHE[cid]` | **NON** | **OUI** — messages cross-modèle |
| markConversationAsRead | `_dmsgChatId(c) === _dmsgChatId(conv)` | **NON** | **OUI** — marque les 2 convs read |
| isActive (rendu liste) | `_dmsgChatId(selectedConv) === cid` | **NON** | **OUI** — 2 items actifs |
| Fetch messages Carlos | `cid + "&model_id=" + _selMid` | **OUI** | Non — API OK |

---

## 6. TRACKING TX MANQUANT

### 6.1 Par page

| Page | TX modal ? | Création TX ? | Lien conv→spender ? | Ligne |
|------|-----------|--------------|---------------------|-------|
| `DadashMessagerieTab` | **OUI** | **OUI** | **OUI** (via spender_id) | L36250+ (TX slot modal) |
| `TlgProStandalonePage` | **NON** | **NON** | Partiel (affiche LTV) | — |
| `GridPremiumStandalonePage` | **NON** | **NON** | Partiel (affiche LTV) | — |
| `TindadaInboxZeroPage` | **NON** | **NON** | **NON** | — |

### 6.2 Ce qui manque — **P1**

**TlgPro, GridPremium, Tindada** n'ont aucun moyen de créer une transaction depuis la conversation. Le chatter doit :
1. Noter mentalement le spender
2. Revenir sur `/#/messagerie` (DadashMessagerieTab)
3. Retrouver la conv
4. Ouvrir le TX modal

C'est un gap UX majeur. Le manque est au niveau **composant** (pas de TX modal intégré). L'API et la DB supportent déjà la création de TX.

---

## VERDICT FINAL

### Ce qui empêche gérant et chatter d'avoir la même messagerie fonctionnelle aujourd'hui

| # | Blocage | Sévérité | Impact |
|---|---------|----------|--------|
| 1 | **Fallback `role: 'gerant'` sur erreur profil** (L39594, L39602) | **P0** | Chatter voit tout si Supabase lag |
| 2 | **Dédup convs par `tg_chat_id` seul** — BUG 1 | **P0** | Spender multi-modèle → conv invisible |
| 3 | **Pas de RLS sur `tg_conversations` / `tg_messages`** | **P0** | Bypass total possible via console |
| 4 | **`/conversations` sans filtre `model_id`** côté Carlos | **P1** | Toutes les convs transitent réseau pour tous |
| 5 | **STANDALONE_TABS bypass tous les rôles** (L8289) | **P1** | Provider/modèle peut accéder à la messagerie |
| 6 | **Pas de TX modal dans TlgPro/GridPremium/Tindada** | **P1** | Perte de ventes, workflow cassé |
| 7 | **`selectedChatId` sans `model_id`** | **P1** | useEffect ne re-trigger pas entre 2 convs même spender |
| 8 | **Cache messages partagé par `tg_chat_id`** | **P1** | Messages cross-modèle dans le cache |
| 9 | **`GerantMessagerieTab` code mort** | **P3** | ~300 lignes orphelines |
| 10 | **Race condition polling** — BUG 2 | **P1** | Fix en cours (PR #1048, guards OK) |

### Priorité de correction recommandée

1. **P0 immédiat** : changer le fallback L39594/L39602 de `'gerant'` à `'chatter'` avec `assigned_models: []` → un chatter en erreur voit 0 convs plutôt que toutes
2. **P0 structurel** : refonte clé de conversation avec `_dmsgConvKey()` = `${tg_chat_id}::${model_id}` (118 usages à migrer progressivement)
3. **P0 infra** : RLS Supabase sur `tg_conversations` et `tg_messages` filtrant par `model_id` selon le JWT
4. **P1** : ajouter `model_id` au `GET /conversations` Carlos pour réduire le payload réseau
5. **P1** : restreindre `STANDALONE_TABS` aux rôles `gerant` + `chatter` uniquement
6. **P1** : intégrer TX modal dans les 3 pages secondaires
