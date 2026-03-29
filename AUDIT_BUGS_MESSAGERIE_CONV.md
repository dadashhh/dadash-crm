# AUDIT — 2 BUGS MESSAGERIE CONVERSATIONS (DadashMessagerieTab)

**Date :** 2026-03-29
**Fichier :** `index.html` (~65 261 lignes)
**Composant :** `DadashMessagerieTab` → sous-page Conversations

---

## BUG 1 — Spender multi-modèles : conv visible sur une seule modèle

### Cause racine confirmée

La déduplication dans `loadConversations` utilise `c.id || c.tg_chat_id || c.chat_id` comme clé unique — or l'API Carlos ne retourne **PAS** de champ `id` sur les conversations (confirmé par le commentaire L40252-40254). La clé retombe donc sur `tg_chat_id`, qui est le **Telegram chat ID du spender** — identique pour toutes les conversations de ce spender quel que soit le modèle. Résultat : la 2e conv (même spender, autre modèle) est écrasée par le `idSet.has()`.

### Lignes exactes impliquées

| Ligne | Code | Problème |
|-------|------|----------|
| **39767** | `const cid = c.id \|\| c.tg_chat_id \|\| c.chat_id;` | `c.id` est `undefined` (API Carlos) → retombe sur `tg_chat_id` |
| **39768** | `if (cid && !idSet.has(String(cid)))` | 2e conv même spender a le même `tg_chat_id` → filtrée |
| **39769** | `idSet.add(String(cid));` | Le `tg_chat_id` est ajouté au set → bloque la 2e conv |
| **40252-40254** | Commentaire : *"les convs de l'API Carlos n'ont PAS de champ 'id'"* | Confirmation explicite du problème |
| **31580** | `return conv.tg_chat_id \|\| conv.chat_id \|\| ...` | `_dmsgChatId` renvoie le même ID pour les 2 convs |
| **40256** | `const selectedChatId = String(_dmsgChatId(selectedConv) \|\| "")` | Même selectedChatId pour les 2 convs → les useEffect ne re-trigger pas |
| **39943** | `_DMSG_MSG_CACHE[cid] = { data: nList, ts: Date.now() }` | Cache partagé par `tg_chat_id` → messages cross-modèle |

### Conséquences en cascade (même si la dédup est fixée)

1. **`selectedChatId` identique** (L40256) : si les 2 convs apparaissent dans la liste, cliquer de l'une à l'autre ne déclenche aucun useEffect (même clé).
2. **Cache messages partagé** (L39943) : `_DMSG_MSG_CACHE[cid]` utilise `tg_chat_id` → les messages de Carla écrasent ceux de Sophie.
3. **`markConversationAsRead`** (L40114-40116) : marque TOUTES les convs du même `tg_chat_id` comme lues (`String(_dmsgChatId(c)) === String(_dmsgChatId(conv))`).
4. **`isActive`** (L42087) : `_dmsgChatId(selectedConv) === cid` → les 2 conv items apparaissent comme "actifs" simultanément.

### Fix recommandé

1. **Clé de déduplication composite** : remplacer `c.id || c.tg_chat_id || c.chat_id` par une clé `${tg_chat_id}::${model_id}` dans la boucle de merge (L39767). Chaque paire spender+modèle est une conversation distincte.
2. **`_dmsgChatId` → `_dmsgConvKey`** : créer une fonction qui retourne `${tg_chat_id}::${model_id}` pour tous les usages liés à l'identité d'une conversation (selectedChatId, cache, isActive, markAsRead). Garder `_dmsgChatId` pour les appels API qui ont besoin du vrai Telegram chat_id.
3. **Cache messages** : utiliser la clé composite `${chatId}::${modelId}` au lieu de `cid` seul.
4. **`loadMessagesById`** passe déjà `model_id` en query param (L39892) → le fetch API est correct, seul le routing client-side est cassé.

### Risques si on touche ces lignes

- **Impact large** : `_dmsgChatId` est utilisé ~90 fois dans le fichier. Changer sa sémantique casserait tout. Il faut une NOUVELLE fonction (`_dmsgConvKey`) et migrer progressivement les usages qui identifient une conv (pas ceux qui ont besoin du vrai TG ID).
- **Polling** : le polling (L40512) utilise `chatIdRef.current` pour fetch → doit aussi utiliser la clé composite, sinon il fetch les messages du mauvais modèle.
- **Onglets** : le système d'onglets (`openTab`, L40142) utilise `_dmsgChatId` comme identifiant → 2 convs du même spender partageraient le même onglet.
- **Supabase fallback** (L39979-39981) : la query `.eq("tg_chat_id", cid)` ne filtre pas par `model_id` → retournerait les messages des 2 modèles mélangés.

---

## BUG 2 — Navigation rapide entre conversations : bug affichage/chargement

### Cause racine confirmée

Le polling (3s/10s) appelle `loadMessagesById(chatIdRef.current, false)` **sans AbortController ni signal**. Si un poll est en vol quand l'utilisateur change de conversation, le cleanup (`cancelled = true`) empêche de PLANIFIER le prochain poll mais **n'annule PAS le fetch HTTP en cours**. La réponse du poll pour conv A arrive après le switch vers conv B et `setMessages(prev => mergeMessages(prev, nList))` injecte les messages de A dans la vue de B.

### Lignes exactes impliquées

| Ligne | Code | Problème |
|-------|------|----------|
| **40512** | `await loadMessagesById(chatIdRef.current, false);` | Aucun `signal` passé → fetch non-annulable |
| **40527-40529** | `cancelled = true; clearTimeout(pollRef.current);` | Cleanup annule les FUTURS polls, pas celui en vol |
| **39892** | `const data = await _dmsgFetch("/conversations/" + cid + ...)` | `signal` est `undefined` pour les appels polling |
| **39893** | `if (signal?.aborted) return;` | `undefined?.aborted` = `undefined` → guard inopérant |
| **39951-39956** | `setMessages(prev => { ... return mergeMessages(prev, nList); });` | Pas de vérification `chatIdRef.current === chatId` avant merge |
| **39995** | `setMessages(list);` | Fallback Supabase : aucun check d'abort ni de chatId courant |
| **40522-40523** | `loadMessagesById(chatIdRef.current, false);` | `visibilitychange` handler : même problème, pas de signal |

### Scénario de reproduction

1. L'utilisateur est sur conv A. Le polling tick à 3s.
2. Un poll démarre : `loadMessagesById("A", false)` — fetch HTTP en cours.
3. L'utilisateur clique conv B (500ms plus tard).
4. `selectConv(B)` → `abortMsgRef.current.abort()` annule le fetch **initial** de A (si en cours), crée un nouveau controller pour B.
5. **Mais le poll de A n'a jamais reçu de signal** → sa `_dmsgFetch` continue.
6. `cancelled = true` empêche le PROCHAIN poll, pas celui en vol.
7. Le fetch du poll de A retourne → `signal?.aborted` = false (pas de signal) → continue.
8. `setMessages(prev => mergeMessages(prev, nList))` → les messages de A sont mergés dans l'état actuel (qui affiche B).
9. **Flash visible** : pendant ~100ms, les messages de A apparaissent dans la vue B, puis le fetch initial de B les remplace.

### Fix recommandé

1. **Passer le signal d'abort au polling** : stocker l'AbortController courant dans une ref (`pollAbortRef`), créer un nouveau controller à chaque cycle de polling, et l'annuler dans le cleanup du useEffect.
   ```
   // Dans le useEffect de polling :
   const pollController = new AbortController();
   await loadMessagesById(chatIdRef.current, false, pollController.signal);
   // Dans le cleanup :
   pollController.abort();
   ```

2. **Guard dans `loadMessagesById` (non-initial)** : avant `setMessages`, vérifier que `chatIdRef.current === cid` (le chatId passé en paramètre). Si différent → discard silencieux.
   ```
   // Avant setMessages (L39951) :
   if (String(chatIdRef.current) !== cid) return;
   ```

3. **Guard dans le fallback Supabase** (L39995) : même vérification avant `setMessages(list)`.

4. **`visibilitychange` handler** (L40522) : passer un signal abort ou au minimum vérifier le chatId au retour.

### Risques si on touche ces lignes

- **Guard chatIdRef** : risque faible — c'est un check lecture seule qui n'affecte pas le flux normal. Le seul cas edge : si le user revient sur conv A juste après, le guard pourrait dropper un fetch valide. Mais le prochain poll récupérera les données.
- **AbortController sur polling** : risque moyen — il faut s'assurer que l'abort du polling ne laisse pas `isMsgPollingRef.current = true` (ce qui bloquerait les polls suivants). Le `finally` block (L40513-40514) doit toujours s'exécuter.
- **`isInitialLoadingRef` stale** : si un fetch abortée en vol était le fetch initial, `isInitialLoadingRef.current` est reset dans le `finally` (L40009-40012) grâce au `finally` qui s'exécute même après `return` → pas de risque.
- **Performance** : créer un AbortController par poll tick ajoute un overhead négligeable (~0.01ms).

---

## Résumé des priorités

| Bug | Sévérité | Complexité fix | Impact utilisateur |
|-----|----------|----------------|-------------------|
| **BUG 1** — Dédup par `tg_chat_id` | **CRITIQUE** | Moyenne-haute (90 usages de `_dmsgChatId`) | Conversations invisibles |
| **BUG 2** — Polling sans abort | **HAUTE** | Basse (3 lignes de guard) | Flash de messages incorrects |

**Recommandation** : fixer BUG 2 en premier (quick win, 3 guards). BUG 1 nécessite une refonte de la clé d'identité de conversation avec une migration progressive.
