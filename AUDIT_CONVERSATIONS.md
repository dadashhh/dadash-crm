# RAPPORT AUDIT — CONVERSATIONS (sous-page "Conversations 1-1")

## 1. COMPOSANT
- **Nom du composant :** `DadashMessagerieTab`
- **Lignes debut → fin :** 39831 → 43846
- **Route / hash :** `#/messagerie-conversations` (standalone plein ecran, rendu a ligne 62192-62198). Aussi accessible en tant qu'onglet interne `activeTab === "conversations"` a l'interieur du composant lui-meme (l. 43798, 43823). Aussi rendu dans le role chatter via `chatter_messagerie` (l. 62834).
- **Standalone plein ecran ou onglet dans MessagerieView ?** **Page standalone plein ecran** (`height: "100vh"`). Le composant est auto-suffisant avec sa propre navigation par onglets internes (`conversations | dadacast | scripts | media | analytics | gestion` — l. 39849). Il est liste dans `STANDALONE_TABS` (l. 8267 : `"messagerie-conversations"`).

## 2. CHARGEMENT DES CONVERSATIONS (liste gauche)
- **Source :** **Les deux** — Carlos API + Supabase direct en parallele (`Promise.allSettled`, l. 40216-40219)
- **Endpoints / tables utilises :**
  - Carlos API : `GET _DMSG_API + "/conversations"` (l. 40217), ou `_DMSG_API = "https://dadash-autofill-v2-production.up.railway.app"` (l. 32013)
  - Supabase : `sb.from("tg_conversations").select("*").order("last_message_at", {ascending: false})` (l. 40209-40214)
- **Filtres appliques :**
  - **Modele** : Si role chatter, filtre `.in("model_id", assigned)` cote Supabase (l. 40210-40212) + filtre client-side (l. 40270-40279)
  - **Non lus** : `showUnreadOnly` → filtre `c.unread_count > 0` (l. 41063-41064)
  - **Langue** : `filterLang` → filtre par `sp.langue` ou `sp.language` ou `c.spender_language` (l. 41052-41060)
  - **Badge/Tier** : `filterTier` → filtre par fourchettes de `total_spent` : sharks >=500, baleines 350-500, gorilles 200-350, etc. (l. 41031-41048)
  - **Modele pill** : `filterModel` (l. 41020-41029)
  - **Payant/Gratuit** : `filterSpender` = paying/free (l. 41001-41015)
  - **Recherche** : `searchQuery` filtre sur nom + dernier message (l. 40991-40997)
- **Polling / interval :** **OUI, toutes les 30 secondes** — `setInterval` stable (deps `[]`) a l. 40882-40894. Utilise `loadConversationsRef` pour eviter les re-creations. Protege par `isConvPollingRef` anti-doublon et `document.hidden` (l. 40884-40886).
- **Supabase Realtime :** **NON pour la liste conversations elle-meme dans DadashMessagerieTab.** Pas de `.channel()` sur `tg_conversations`. MAIS il y a un **canal global** sur `tg_messages` (l. 61056-61079) qui dispatch `CustomEvent('tg-message-insert')` → ecoute par le composant (l. 40809-40854) et qui declenche `loadConversationsRef.current()` quand un message entrant est detecte (l. 40835-40841).
- **Cache :** Double cache — `convsCache.current` (ref local, TTL 30s, l. 40174-40175) + `_DMSG_CONV_CACHE` global (survit aux remontages, l. 32016).

## 3. CHARGEMENT DES MESSAGES (zone centrale)
- **Quand le fetch se declenche :** A la **selection d'une conversation** (`selectConv` → `loadMessagesById(chatId, true, signal)`, l. 40577) + **polling toutes les 3s** (l. 40856-40870).
- **Source :** **Carlos API** en priorite, **Supabase en fallback** si l'API echoue (l. 40412-40431).
- **Endpoint / requete exacte :**
  - Carlos API : `GET _DMSG_API + "/conversations/" + chatId + "/messages?limit=50&offset=0"` (l. 40352)
  - Fallback Supabase : `sb.from("tg_messages").select("*").eq("conversation_id", convRow.id).order("created_at", {ascending: true})` (l. 40420-40422) — **PAS de .limit()** sur le fallback Supabase !
- **LIMITE (.limit()) :** **Oui, 50 messages** par page cote Carlos API (`limit=50`, l. 40352).
- **Tri (.order()) :** Tri cote client `sort by created_at ascending` (l. 40356-40359). Fallback Supabase : `.order("created_at", {ascending: true})`.
- **Scroll infini / pagination :** **OUI** — pagination par offset. `loadMoreMessages` (l. 40438-40463) charge les messages precedents avec `?limit=50&offset=` + nextOffset. Declenche quand `scrollTop < 50` (l. 40754). `hasMoreMsgs` est calcule par `raw.length >= 50` (l. 40388).

## 4. AFFICHAGE LIVE DES MESSAGES
- **Mecanisme actuel :** **Triple couche** :
  1. **Polling HTTP** toutes les 3 secondes (`setInterval` l. 40860-40868) — appelle `loadMessagesById(chatId, false)` qui fait un `GET /conversations/{chatId}/messages?limit=50` a l'API Carlos.
  2. **Supabase Realtime** via canal global `'global-tg-messages-rt'` (l. 61061) sur `tg_messages` INSERT/UPDATE → dispatch `CustomEvent('tg-message-insert')` → ecoute l. 40809-40854 → ajout immediat dans `setMessages`.
  3. **Socket.IO** (optionnel) — si `window.__dadashSocket` existe (l. 40087-40156), ecoute `'new_message'` et `'conv_updated'` pour mise a jour instantanee.
- **Si polling :** 3 secondes (l. 40868). Protege par `isMsgPollingRef` anti-doublon et `document.hidden`.
- **Messages ENVOYES — Optimistic UI :** **OUI** — message `_pending: true` ajoute immediatement dans `setMessages` (l. 41095-41106). Affiche avec indicateur visuel (l. 42561). Input vide immediatement (l. 41092-41093). Apres confirmation API, le pending est marque `_sent: true` (l. 41134-41136). Reconciliation complete apres 3s via re-fetch (l. 41161-41168).
- **Messages RECUS — sans refresh manuel :** **OUI** — via les 3 mecanismes live (polling 3s, Realtime Supabase, Socket.IO). Le Realtime Supabase est quasi-instantane. Le polling HTTP ajoute au max 3s de delai.
- **Delai observe :** ~0ms pour Socket.IO/Realtime, ~3s max pour polling HTTP. Pour l'envoi, affichage instantane (optimistic).

## 5. TYPES DE MESSAGES SUPPORTES
- **Texte :** **OUI** — `msg.text || msg.content || msg.message` (l. 42559)
- **Emojis :** **OUI** — affichage natif Unicode, pas de traitement special
- **Photos (inline ou lien) :** **INLINE** — detection `msg.media_url || msg.photo_url` (l. 42567), affichage inline si `mediaType === "image"` avec tag `<img>` (l. 42569-42570). Extensions supportees : jpg, jpeg, png, gif, webp (l. 42573).
- **Videos (inline ou lien) :** **INLINE** — detection `msg.video_url` ou `media_type === "video"` (l. 42571, 42574). Extensions : mp4, mov, webm.
- **Appels (indicateur) :** **OUI** — detection `rawType === 'call' || 'phone_call' || 'video_call'` (l. 42578). Statut missed : `msg.call_status === 'missed'` (l. 42579).
- **Messages vocaux :** **OUI (partiel)** — detection `rawType === "audio" || "voice"` → classe en `"document"` (l. 42572). Envoi via `/send-voice` dans les scripts (l. 31550).
- **Stickers/GIFs :** **NON detecte explicitement** — les GIF sont traites comme images (extension .gif dans le regex l. 42573), mais pas de rendu sticker Telegram natif.

## 6. ENVOI DE MESSAGES
- **Endpoint d'envoi texte :** `POST _DMSG_API + "/send-message"` avec body `{ chat_id, text, model_id }` (l. 41125-41133). Timeout : 15000ms.
- **Endpoint d'envoi photo/video :**
  - Photo : `POST /send-photo` ou `/send-media` (l. 31329, 33520)
  - Video : `POST /send-video` avec `{ chat_id, video_url, caption, model_id, width, height, duration }` (l. 31331, 33518). Timeout : 120000ms (video) / 30000ms (photo).
  - Audio/Vocal : `POST /send-voice` avec `{ chat_id, audio_url }` (l. 31550)
  - Script media : `POST /send-photo` | `/send-video` | `/send-audio` (l. 31329)
- **Optimistic UI :** **OUI** — message pending affiche immediatement (l. 41095-41106). Input vide instantanement. Conv remontee en haut de liste (l. 41110-41121).
- **Gestion d'erreur si envoi echoue :** Le message est marque `_error: true` (l. 41172-41173) et reste visible dans le chat. Toast d'erreur affiche (l. 41175). Bouton **Retry intelligent** disponible : verifie d'abord si le message a deja ete envoye (reponse perdue) avant de renvoyer (l. 41183-41214).
- **Anti-doublon :** Verrouillage via `isSendingMsgRef` (ref synchrone, l. 41077-41080) + cooldown 2s entre envois (l. 41082-41086) + deverrouillage apres 3s min (l. 41178).

## 7. SCROLL
- **Auto-scroll en bas a l'ouverture :** **OUI** — `scrollToBottom('instant')` apres chargement initial (l. 40389) + dans `selectConv` via setTimeout 300ms (l. 40789).
- **Auto-scroll sur nouveau message :** **OUI** — si `!isUserScrollRef.current` → `scrollToBottom('instant')` (l. 40769-40770). Si l'user a scrolle → affichage badge "Nouveaux messages" (l. 40772).
- **Scroll intelligent :** **OUI** — `isUserScrollRef` est true si `distBottom >= 80px` (l. 40750), false si `< 80px` (l. 40747). Quand user scrolle en haut et nouveau message arrive → bouton flottant "↓ Nouveaux messages" (l. 42518-42522). Bouton scroll-to-bottom permanent si `distBottom >= 80` (l. 42524-42526).
- **Scroll infini vers le haut (historique) :** **OUI** — quand `scrollTop < 50` → `loadMoreMessages()` (l. 40754-40763). Preserve la position de scroll : `el.scrollTop = el.scrollHeight - prevHeight` (l. 40759). Indicateur "Chargement..." pendant le chargement (l. 42529-42533). Indicateur "— Debut de la conversation —" quand plus rien a charger (l. 42541-42544).
- **Auto-scroll periodique :** Toutes les 2s, si l'user n'a pas scrolle, maintient la position en bas (l. 40794-40807).

## 8. CHANGEMENT DE CONVERSATION
- **Anciens messages nettoyes :** **OUI** — dans `selectConv`, si le cache est frais (< 60s), les messages cached sont affiches immediatement (l. 40557-40558). Sinon `setMessages([])` (l. 40560). Puis `loadMessagesById(chatId, true)` (l. 40577).
- **Loading state :** **OUI** — `msgLoading` est true pendant le chargement initial (l. 40348-40349, 40433). Spinner affiche (l. 42546-42550).
- **Polling/realtime se reabonne-t-il au bon chat_id :** **OUI** — `chatIdRef.current` est mis a jour immediatement dans `selectConv` (l. 40549). Le polling utilise `chatIdRef.current` (l. 40864). L'ancien fetch en cours est annule via `AbortController` (l. 40543-40547). Le Realtime global compare `chatIdRef.current` pour filtrer les messages (l. 40814-40815).
- **Bugs connus :**
  - **Flash ancien contenu** : Possible brievement si le cache est invalide mais que les messages ne sont pas encore vides — mitige par affichage du cache quand frais (l. 40557).
  - L. 40656-40659 documente un **BUG RACINE corrige** : les convs Carlos n'avaient pas de champ `id` → `selectedConv?.id` etait toujours `undefined`, empechant les useEffect de se redeclencher. Corrige par `selectedChatId` (l. 40660).

## 9. FICHE SPENDER (panneau droit)
- **Donnees chargees depuis :**
  1. **Match rapide** dans les props `spenders` pour affichage instantane (l. 40678-40682)
  2. **Hydratation Supabase** : `sb.from("spenders").select("*").or(telegram_id.eq.{chatId},tg_user_id.eq.{chatId}).maybeSingle()` (l. 40684-40698)
  3. Fallback : objet minimal `_dmsgMinimalSpender(conv)` si rien trouve (l. 40694)
- **Se met-elle a jour quand on change de conv :** **OUI** — `useEffect` sur `selectedChatId` (l. 40662-40700). `setActiveSpender(null)` immediat dans `selectConv` (l. 40569), puis rechargement.
- **Bouton sync present et fonctionnel :** **OUI** — `syncSpenderAnalysis` (l. 42988-43032). Appelle `POST _DMSG_API + "/enrich/" + spenderId` puis s'abonne via Realtime Supabase sur la table `spenders` filtree par `id=eq.{spenderId}` pour recevoir les donnees enrichies (ai_personality, ai_interests, etc.). Timeout de securite 15s (l. 42995-42999).

## 10. PROBLEMES IDENTIFIES

### Bugs
1. **Pas de .limit() sur le fallback Supabase messages** (l. 40420-40422) : `sb.from("tg_messages").select("*").eq("conversation_id", convRow.id).order("created_at", {ascending: true})` → peut charger des milliers de messages si l'API Carlos est down. Risque de crash navigateur.

2. **Double polling conversations** : Le polling conversations (30s, l. 40882-40894) + le refresh declenche par realtime sur `tg-message-insert` (l. 40835-40841) + le refresh post-envoi (l. 41138) peuvent causer des appels API excessifs. Le throttle `lastConvRefreshRef` (5s pour realtime, 30s pour polling messages, l. 40406/40837) aide mais reste agressif.

3. **Variable `chatId` non definie dans `syncSpenderAnalysis`** (l. 43003) : `const enrichId = activeSpender?.id || chatId;` — `chatId` n'est pas declare dans ce scope. **Bug potentiel** si `activeSpender?.id` est null.

4. **`onRefresh` appele sans existence** (l. 41448) : `if (onRefresh) onRefresh();` est en dehors du try/catch/finally. `onRefresh` n'est pas dans les props de `DadashMessagerieTab` — appel a une variable inexistante (erreur silencieuse car protege par le `if`).

5. **Anti-spam sendMessage verrouille 3s minimum** (l. 41178) : `setTimeout(() => { isSendingMsgRef.current = false; }, 3000)` — l'utilisateur ne peut pas envoyer 2 messages en moins de 3s.

### Incoherences
6. **Champs messages incoherents** : Le code gere 4 noms de champs pour le texte (`text`, `content`, `message`), 5 pour l'ID (`id`, `message_id`, `tg_message_id`, `_localId`), et 6 pour le chat_id (`tg_chat_id`, `chat_id`, `telegram_chat_id`, `tg_id`, `id`). Manque de normalisation entre Carlos API et Supabase.

7. **Incoherence direction messages** : `isOut` verifie 5 conditions differentes (l. 42558). Meme chose pour `isUnanswered` (l. 40927-40934) qui utilise d'autres champs.

8. **Cache TTL incoherents** : convsCache=30s, _DMSG_CONV_CACHE=30s, _DMSG_MSG_CACHE=60s, IndexedDB=5min, polling convs=30s, polling msgs=3s. Le polling conversations (30s) egal au TTL cache (30s) → cache quasi-toujours perime au moment du poll.

### Code mort / TODOs
9. **`ENABLE_VIRTUALIZATION = false`** (l. 39829) : Feature flag pour react-window jamais utilise. react-window n'est pas charge.

10. **`activeTab` valeurs inutilisees** : L'etat (l. 39849) liste `scripts | media | analytics` mais seuls `conversations`, `dadacast`, `gridpremium`, `ressources`, et `gestion` sont utilises dans le rendu.

11. **IndexedDB messages cache jamais lu par DadashMessagerieTab** : `_idbGetMsgs` et `_idbSetMsgs` definis (l. 32059-32081) mais DadashMessagerieTab n'appelle jamais `_idbGetMsgs`.

12. **Socket.IO conditionnel** : script charge en defer (l. 174) mais `window.__dadashSocket` est conditionnel — le code Socket.IO dans DadashMessagerieTab (l. 40087-40156) est un bonus silencieux.

13. **`prevMsgCountRef` reset redondant** : Reinitialise dans `selectConv` (l. 40567) ET dans le useEffect sur `selectedChatId` (l. 40783).

14. **`showScrollBtn` set 2 fois** dans le meme useEffect (l. 40781 et 40784) — doublon.
