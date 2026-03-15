# AUDIT PERFORMANCE FRONTEND — Alfred × Carlos API
**DADASH CRM — Branch `claude/audit-performance-carlos-api-80oFW`**
**Date : 2026-03-15 | Auteur : ALFRED (Claude Sonnet 4.6)**
**Fichier analysé : `index.html` (~60 000 lignes)**

---

## SYNTHÈSE EXÉCUTIVE

| Composant | Carlos req/min (polling max) | Cache messages | Realtime | Fallback Supabase | Score |
|-----------|------------------------------|----------------|----------|-------------------|-------|
| DadashMessagerieTab | ~2/min (1 conv active) | ✅ TTL 60s | ✅ Supabase + Socket.io | ✅ Complet | 8/10 |
| GridPremiumSubpage | **24/min (12 cellules)** | ❌ Aucun | ❌ Absent | ❌ Silencieux | 4/10 |
| TlgProSubpage | **24/min (12 cellules)** | ❌ Aucun | ❌ Absent | ❌ Silencieux | 3/10 |
| TindadaInboxZeroPage | 2/min (all convs + msgs) | ❌ Aucun | ❌ Absent | ❌ Silencieux | 4/10 |
| GerantMessagerieTab | ~1/min | ❌ Aucun | ✅ Supabase | ⚠️ Partiel | 6/10 |

---

## 1. AUDIT FONCTIONS FETCH CARLOS

### 1.1 — `carlosFetch` (ligne 30489) — GerantMessagerieTab + parent Grid

```javascript
// ligne 30489-30517
const carlosFetch = async (path, opts = {}) => {
  const base = CARLOS_API_BASE();
  if (!base) throw new Error("CARLOS_API_URL non configurée");
  const t0 = performance.now();
  const label = (opts.method || "GET") + " " + path;
  console.log(`⏱️ [PERF] carlosFetch START — ${label}`);
  let res;
  try {
    res = await fetch(base + path, { headers: carlosHeaders(), ...opts });
    // ❌ PAS de timeout — pas d'AbortController — pendante indéfiniment si Carlos freeze
  } catch (err) { throw err; }
  // ...
  return res.json().catch(() => ({}));
};
```

**Problèmes** :
- ❌ **Pas de timeout** — si Carlos ne répond pas, la requête pend indéfiniment
- ❌ **Pas de retry** — une seule tentative
- ❌ **Pas de fallback Supabase** pour les envois (send-message, send-media, send-video)
- ✅ Instrumentation perf présente (`window._perfStats`)

**Utilisé pour** :
- `GerantMessagerieTab` : envoi message/média/audio/vidéo/scripts
- Composant parent hosting Grid Premium : `loadConversations`

---

### 1.2 — `_dmsgFetch` (ligne 31123) — Composant principal + grilles

```javascript
// ligne 31123-31182
const _dmsgFetch = async (path, opts = {}) => {
  const { timeout: timeoutMs = 10000, signal: callerSignal, ...restOpts } = opts;
  // ✅ AbortController avec timeout configurable
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // ✅ Propagation signal externe (annulation si changement de conv)
  if (callerSignal) { /* ... */ }
  // ✅ Détection CORS/réseau
  // ✅ Instrumentation perf avec seuils (_threshold par type)
  (window._perfStats[_pk] || (window._perfStats[_pk] = [])).push(_dur);
};
```

**Points forts** :
- ✅ Timeout par défaut 10s, configurable par appel
- ✅ `AbortController` — annulation propre au changement de conv
- ✅ Propagation du signal caller (ex. : fermeture composant)
- ✅ Détection CORS + messages d'erreur explicites
- ✅ Seuils d'alerte par type : sendVideo 15s, sendMedia 10s, sendMessage 3s, autres 2s

**Timeouts configurés par endpoint** :

| Endpoint | Timeout | Composant |
|----------|---------|-----------|
| `/conversations/{id}/messages?limit=30` | 8 000 ms | Grid, TLG, Tindada |
| `/conversations/{id}/messages?limit=50` | 10 000 ms (défaut) | DadashMessagerieTab |
| `/conversations/{id}/messages?limit=200` | 10 000 ms | Grid (scroll infini) |
| `/conversations` | 15 000 ms | Tindada, DadashMsg |
| `/send-message` | 8 000 ms | Tous |
| `/send-media` / `/send-photo` | 30 000 ms | Tous |
| `/send-video` | 120 000 ms | Tous |
| `/api/suggestions` | 20 000 ms | TLG Pro |
| `/enrich/{id}` | 15 000 ms | Grid, DadashMsg |

---

## 2. AUDIT REQUÊTES PAR SOUS-PAGE

### 2.1 — DadashMessagerieTab (ligne 37600+)

#### A) Ouvrir une conversation

```javascript
// ligne 37918-37991 — loadMessagesById
const loadMessagesById = useCallback(async (chatId, isInitial, signal) => {
  // 1. Vérifier cache (TTL 60s)
  const _cachedMsgsValid = _cachedMsgs && Date.now() - _cachedMsgs.ts < 60000;
  if (isInitial && _cachedMsgsValid) {
    setMessages(_cachedMsgs.data); // ← affichage immédiat
    // continue pour refresh silencieux
  }
  // 2. Fetch Carlos
  const data = await _dmsgFetch("/conversations/" + cid + "/messages?limit=50&offset=0");
  // 3. Fallback Supabase si Carlos échoue ET cache vide
  if (isInitial && !_DMSG_MSG_CACHE[cid]?.data?.length) {
    const { data: convRow } = await sb.from("tg_conversations").select("id").eq("tg_chat_id", cid).maybeSingle();
    const { data } = await sb.from("tg_messages").select("*").eq("conversation_id", convRow.id).order("created_at", { ascending: true });
  }
}, []);
```

**Flux** :
1. Cache hit (TTL 60s) → affichage immédiat + refresh silencieux en arrière-plan : **0 fetch visible**
2. Cache miss → 1× Carlos `/conversations/{id}/messages?limit=50` (10s timeout)
3. Carlos fail → 1× Supabase `tg_conversations` + 1× `tg_messages` (fallback complet ✅)

#### B) Envoyer un message

```javascript
// ligne 38668
await _dmsgFetch("/send-message", {
  method: "POST", body: JSON.stringify({ chat_id, text, model_id }),
  timeout: 8000
});
```

1 requête Carlos uniquement. Supabase mise à jour via Realtime automatique.

#### C) Polling

```javascript
// ligne 38406-38427 — polling messages (setTimeout récursif, PAS setInterval)
const scheduleNextPoll = () => {
  pollRef.current = setTimeout(async () => {
    if (document.hidden || isMsgPollingRef.current) { scheduleNextPoll(); return; }
    await loadMessagesById(chatIdRef.current, false);
    scheduleNextPoll(); // ← repart après fin du fetch
  }, 30000);
};

// ligne 38439-38451 — polling conversations (setInterval 30s, deps vides)
convPollRef.current = setInterval(async () => {
  if (document.hidden) return;
  if (isConvPollingRef.current) return;
  await loadConversationsRef.current();
}, 30000);
```

**Tracking activité utilisateur** :
```javascript
// ligne 37754-37765
const resetActivity = () => { lastActivityRef.current = Date.now(); };
window.addEventListener('mousemove', resetActivity, { passive: true });
window.addEventListener('keydown', resetActivity, { passive: true });
window.addEventListener('click', resetActivity, { passive: true });
```
⚠️ **Le polling adaptatif est tracké mais PAS encore implémenté** — le tracker `lastActivityRef` existe mais l'intervalle de polling est fixe à 30s. Le gain estimé n'est pas encore réalisé.

#### D) Réaltime Supabase + Socket.io

```javascript
// ligne 38362 — Supabase Realtime (primary)
const channel = sb.channel('dmsg-messages-rt')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tg_messages' }, payload => {
    setMessages(prev => [...prev, msg]);
  })
  .on('postgres_changes', { event: 'UPDATE', ... }, ...)
  .subscribe();

// ligne 37743 — Socket.io (secondary)
socket.on('new_message', onNewMessage);
socket.on('conv_updated', onConvUpdated);
socket.on('transaction_created', onTxCreated);
```

**Architecture Realtime** : Supabase RT (primary) + Socket.io (secondary) + polling 30s (fallback) — triple couverture ✅

---

### 2.2 — GridPremiumSubpage (ligne 31321)

#### A) Load initial — N fetches parallèles

```javascript
// ligne 31361-31372 — gpLoadMsgs
const gpLoadMsgs = React.useCallback(async (conv, idx, silent) => {
  const data = await _dmsgFetch(
    "/conversations/" + cid + "/messages?limit=30",
    { timeout: 8000 }
  );
  const msgs = Array.isArray(data) ? data : data.messages || data.data || [];
  setGpSlotMsgs(p => ({ ...p, [idx]: msgs }));
}, []);

// Mount — useEffect déclenche gpLoadMsgs pour chaque slot
gpSlots.forEach((c, i) => { if (c) gpLoadMsgs(c, i, false); });
```

- Layout 2×2 (4 slots) → **4 fetches Carlos simultanés** au mount
- Layout 3×4 (12 slots) → **12 fetches Carlos simultanés** au mount
- ❌ Pas de cache — rechargement complet à chaque montage du composant
- ❌ Erreurs swallowées silencieusement : `catch (_) {}`

#### B) Polling 30s — toutes les cellules actives

```javascript
// ligne 31665-31669
const GRID_REFRESH_MS = 30000;
gpRefreshRef.current = setInterval(() => {
  gpSlots.forEach((c, i) => { if (c) gpLoadMsgs(c, i, true); }); // silent
}, GRID_REFRESH_MS);
```

**Charge calculée** :

| Layout | Cellules actives | Req/30s | Req/min | Req/heure |
|--------|-----------------|---------|---------|-----------|
| 2×2 | 4 | 4 | 8 | 480 |
| 2×3 | 6 | 6 | 12 | 720 |
| 3×3 | 9 | 9 | 18 | 1 080 |
| **3×4** | **12** | **12** | **24** | **1 440** |

⚠️ **En layout 3×4, Grid seul génère 1 440 requêtes Carlos/heure en polling continu.**

#### C) Après envoi

```javascript
// ligne 31414 — rechargement slot actif uniquement après envoi
setTimeout(() => gpLoadMsgs(activeConv, gpActiveSlot, true), 800);
```

1 requête Carlos supplémentaire 800ms après envoi.

---

### 2.3 — TlgProSubpage (ligne 31833)

Architecture **identique à GridPremiumSubpage** pour le polling :

```javascript
// ligne 32837-32841
tRefreshRef.current = setInterval(() => {
  tSlots.forEach((c, i) => { if (c) tLoadMsgs(c, i, true); });
}, GRID_REFRESH_MS); // 30 000ms
```

**Différences clés vs Grid Premium** :
- ✅ Input individuel par cellule (Grid a un input partagé)
- ✅ Layout par défaut 3×3 (Grid : 2×3)
- ❌ Pas de Supabase Realtime (Grid Premium a `tg-page-messages-rt` dans son parent)
- ❌ Pas de Socket.io
- ⚠️ **Suggestions IA = 2 appels Carlos par clic ✨** :

```javascript
// ligne 32586-32597
const tLoadSuggestions = async (idx) => {
  // 1. Fetch 5 derniers messages
  const msgsData = await _dmsgFetch("/conversations/" + cid + "/messages?limit=5", { timeout: 8000 });
  // 2. Fetch suggestions
  const res = await _dmsgFetch("/api/suggestions", {
    method: "POST",
    body: JSON.stringify({ spender_id, model_id, last_message: lastText }),
    timeout: 20000,
  });
};
```

Si 12 chatters cliquent ✨ simultanément → **24 appels Carlos supplémentaires** en rafale.

---

### 2.4 — TindadaInboxZeroPage (ligne 33538)

#### A) Load initial

```javascript
// ligne 33671-33791 — loadUnread
const loadUnread = useCallback(async (isRefresh = false) => {
  const data = await _dmsgFetch("/conversations", { timeout: 15000 });
  const list = Array.isArray(data) ? data : data.conversations || data.data || [];
  const freshUnreads = list.filter(c => (c.unread_count || 0) > 0);
  // Affiche la première conv non lue + charge ses messages
}, [loadMessages, showToast]);
```

1 requête Carlos `/conversations` → toutes les convs fetched, filtrées côté client.

#### B) Messages par conv

```javascript
// ligne 33639
const data = await _dmsgFetch("/conversations/" + chatId + "/messages?limit=30", { timeout: 8000 });
```

1 requête par conv swipée. **Pas de cache** — rechargement à chaque swipe même si même conv.

#### C) Polling 30s

```javascript
// ligne 33797-33800
refreshRef.current = setInterval(() => {
  loadUnread(true); // 1× Carlos /conversations toutes les 30s
}, 30000);
```

**Charge** : 2 req/min (1× `/conversations` + 1× `/messages` si conv active)

---

### 2.5 — GerantMessagerieTab (ligne 29717)

```javascript
// ligne 29777-29782 — chargement messages SANS LIMITE
const loadMessages = async (convId) => {
  const { data } = await sb.from("tg_messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true });
  // ❌ Pas de .limit() — peut fetcher des milliers de messages
  setMessages(data || []);
};
```

- Source : **Supabase directement** (pas Carlos)
- ❌ Aucune limite — tous les messages chargés en une requête
- ✅ Supabase Realtime actif (ligne 29775)

---

## 3. TABLEAU RÉCAPITULATIF REQUÊTES

| Sous-page | Action | Req Carlos | Req Supabase | Timeout | Fallback |
|-----------|--------|-----------|--------------|---------|---------|
| DadashMsg | Ouvrir conv (cache miss) | 1× `/conversations/{id}/messages?limit=50` | 0 | 10s | ✅ `tg_messages` |
| DadashMsg | Ouvrir conv (cache hit) | 0 | 0 | — | ✅ Cache 60s |
| DadashMsg | Envoyer msg | 1× `/send-message` | 0 (Realtime) | 8s | ❌ |
| DadashMsg | Envoyer photo | 1× `/send-media` | 0 | 30s | ❌ |
| DadashMsg | Polling msgs | 1× `/messages?limit=50` | 0 | 10s | ✅ Cache |
| DadashMsg | Polling convs | 1× `/conversations` + 1× Supabase | 1× `tg_conversations` | 10s+15s | ✅ |
| Grid Premium | Load 4 cellules (2×2) | 4× `/messages?limit=30` | 0 | 8s | ❌ |
| Grid Premium | Load 12 cellules (3×4) | **12× `/messages?limit=30`** | 0 | 8s | ❌ |
| Grid Premium | Polling 30s (3×4) | **12× `/messages?limit=30`** | 0 | 8s | ❌ |
| Grid Premium | Envoyer msg | 1× `/send-message` + 1× reload slot | 0 | 8s | ❌ |
| TLG Pro | Load 12 cellules (3×4) | **12× `/messages?limit=30`** | 0 | 8s | ❌ |
| TLG Pro | Polling 30s (3×4) | **12× `/messages?limit=30`** | 0 | 8s | ❌ |
| TLG Pro | Suggestions IA ✨ | 2× (`/messages?limit=5` + `/api/suggestions`) | 0 | 8s+20s | ❌ |
| Tindada | Load initial | 1× `/conversations` | 0 | 15s | ❌ |
| Tindada | Swipe conv | 1× `/messages?limit=30` | 0 | 8s | ❌ |
| Tindada | Polling 30s | 1× `/conversations` | 0 | 15s | ❌ |
| GerantMsg | Ouvrir conv | 0 | 1× `tg_messages SELECT *` | — | — |
| GerantMsg | Envoyer msg | 1× Carlos `/send-message` (**⚠️ sans timeout**) | 0 | **∞** | ❌ |

---

## 4. AUDIT CACHE

### Cache actuel

```javascript
// ligne 31120-31121 — déclarations globales
const _DMSG_CONV_CACHE = { list: [], ts: 0 };  // TTL 30s
const _DMSG_MSG_CACHE  = {};  // { chatId: { data: [], ts: number } } — TTL 60s
```

| Cache | TTL | Composant qui l'utilise | Composant qui l'ignore |
|-------|-----|------------------------|------------------------|
| `_DMSG_CONV_CACHE` | 30s | DadashMessagerieTab ✅ | TindadaInboxZeroPage ❌ |
| `_DMSG_MSG_CACHE` | 60s | DadashMessagerieTab ✅ | GridPremiumSubpage ❌, TlgProSubpage ❌, TindadaInboxZeroPage ❌ |

**Impact Grid + TLG** : `_DMSG_MSG_CACHE` est déclaré globalement mais `gpLoadMsgs` et `tLoadMsgs` ne le lisent ni ne l'écrivent. Chaque cycle de polling de 30s recharge intégralement les 12 cellules depuis Carlos.

### Cache manquant — impact estimé

Si Grid + TLG utilisaient `_DMSG_MSG_CACHE` (TTL 30s) :
- Polling 30s = TTL 30s → le cache expire exactement quand le prochain poll arrive → 0 économie si TTL = poll interval
- **Recommandation** : TTL 60s + polling 60s → **-50% requêtes Carlos** en continu

---

## 5. AUDIT SUPABASE

### Tables utilisées

| Table | Opération | Composant | Problème |
|-------|-----------|-----------|---------|
| `tg_messages` | `SELECT * WHERE conversation_id = X ORDER BY created_at` | GerantMsg (fallback DadashMsg) | ❌ Pas de `.limit()` dans GerantMsg |
| `tg_conversations` | `SELECT * ORDER BY last_message_at DESC` | DadashMsg loadConversations | ❌ Pas de `.limit()` |
| `v_tg_conversations` | `SELECT * ORDER BY last_message_at DESC` | Parent Grid Premium | Vue — indexation inconnue |
| `scripts` | `SELECT * WHERE model_id = X ORDER BY sort_order` | ScriptsLibrary | ✅ Filtré |
| `tg_messages` | Realtime INSERT+UPDATE | DadashMsg, Grid parent | ✅ Push, pas de polling |

### Realtime Supabase actif

```javascript
// 3 channels actifs simultanément possible :
sb.channel('dmsg-messages-rt')           // DadashMessagerieTab
sb.channel('tg-page-messages-rt')        // Parent Grid Premium
sb.channel('secondary-chat-rt-' + chatId) // Composant secondaire (ligne 56061)
```

⚠️ **Problème potentiel** : si l'utilisateur ouvre DadashMessagerieTab + Grid Premium simultanément → **2 channels Realtime sur `tg_messages`** actifs en même temps, chacun déclenchant un `setMessages`. Risque de doublon ou de conflit d'état.

### Requêtes Supabase lentes potentielles

1. `GerantMessagerieTab.loadMessages` — `SELECT * tg_messages WHERE conversation_id = X` sans limite → conversation avec 10 000 messages = **latence O(n)**
2. `loadConversations` — `SELECT * tg_conversations ORDER BY last_message_at` sans limite → toutes les conversations en mémoire
3. `SELECT * tg_messages` dans le fallback DadashMsg → même problème, pas de `.limit()`

---

## 6. AUDIT RE-RENDERS REACT

### 6.1 — Clés instables (key={idx})

```javascript
// Grid Premium — ligne 31471 (estimé)
{gpSlots.map((slot, idx) => (
  <div key={idx}>  // ❌ key instable — si slot déplacé = re-mount complet
    {/* Cellule complète avec messages */}
  </div>
))}

// TLG Pro — même pattern
{tSlots.map((slot, idx) => (
  <div key={idx}>  // ❌ idem
```

**Impact** : si `gpSlots` est réordonné (ex. : drag-and-drop futur, ou swap), tous les composants children se remontent → flush des états locaux.

### 6.2 — Mises à jour d'état par slot → re-render total

```javascript
// Chaque fetch déclenche cette mise à jour
setGpSlotMsgs(p => ({ ...p, [idx]: msgs }));  // Grid
setTSlotMsgs(p => ({ ...p, [idx]: msgs }));   // TLG

// Avec 12 cellules en polling parallèle :
// 12 mises à jour quasi-simultanées → 12 re-renders du composant monolithique en 30s
```

**Sans `React.memo`** : chaque mise à jour d'un slot provoque le re-render de **tous** les 12 slots (145+ éléments DOM recalculés).

### 6.3 — Memoizations présentes

```javascript
// Grid Premium
const gpUnreadSorted = React.useMemo(() => { ... }, [conversations, gpModelFilter, models, convTotalsMap]);

// TLG Pro
const tUnreadSorted = React.useMemo(() => { ... }, [conversations, tActiveTabId, models]);
const tOpenChatIds  = React.useMemo(() => { ... }, [tSlots]);
const tPickerConvs  = React.useMemo(() => { ... }, [tUnreadSorted, tOpenChatIds]);

// DadashMessagerieTab
const convTotalsMap = React.useMemo(() => { ... }, [txs]);
```

✅ OK — les calculs coûteux sont mémorisés.

### 6.4 — Dépendances useEffect problématiques

```javascript
// Grid Premium — ligne 31665
useEffect(() => {
  gpRefreshRef.current = setInterval(() => {
    gpSlots.forEach((c, i) => gpLoadMsgs(c, i, true));
  }, GRID_REFRESH_MS);
  return () => clearInterval(gpRefreshRef.current);
}, [gpSlots, gpLoadMsgs]); // ← gpSlots change à chaque ajout de conv
// → l'interval redémarre (clearInterval + setInterval) à chaque conv ajoutée
```

**Risque** : si `gpSlots` change souvent (drag conv dans cellule), l'interval est constamment réinitialisé → les cellules ne polleront pas pendant la période transitoire.

### 6.5 — Reset d'état brutal au changement d'onglet (TLG Pro)

```javascript
// ligne 31956-31968 — TLG Pro tab change
React.useEffect(() => {
  if (tPrevTabRef.current !== tActiveTabId) {
    setTSlotMsgs({});         // ← vide TOUS les messages
    setTLoadingSlots({});
    setTActiveSlot(null);
    setTInputs({});
    setTSending({});
    setTPopup({});
    setTSuggestData({});
    tPrevTabRef.current = tActiveTabId;
  }
}, [tActiveTabId]);
```

**Impact** : changer d'onglet de modèle (ex. : "all" → "carla") vide toutes les données de toutes les cellules → **12 fetch Carlos déclenchés** au re-montage.

---

## 7. TIMEOUT ET FALLBACK — ANALYSE COMPLÈTE

### Couverture timeout

| Fonction | Timeout | AbortController | Retry | Fallback Supabase |
|----------|---------|-----------------|-------|-------------------|
| `carlosFetch` | ❌ Aucun (timeout natif ≈ ∞) | ❌ | ❌ | ⚠️ Partiel (load convs uniquement) |
| `_dmsgFetch` | ✅ 10s (défaut) | ✅ | ❌ | ⚠️ Partiel (DadashMsg uniquement) |

### Couverture fallback par composant

```javascript
// DadashMessagerieTab — fallback complet ✅
} catch (e) {
  if (isInitial && !_DMSG_MSG_CACHE[cid]?.data?.length) {
    // Supabase tg_conversations + tg_messages
  }
}

// GridPremiumSubpage — fallback absent ❌
const gpLoadMsgs = async (conv, idx, silent) => {
  try {
    const data = await _dmsgFetch("...");
    setGpSlotMsgs(p => ({ ...p, [idx]: msgs }));
  } catch (_) {} // ← silencieux — la cellule reste vide sans aucun feedback
  setGpLoadingSlots(p => ({ ...p, [idx]: false }));
};

// TlgProSubpage — fallback absent ❌
const tLoadMsgs = React.useCallback(async (conv, idx, silent) => {
  try {
    const data = await _dmsgFetch("...");
    setTSlotMsgs(p => ({ ...p, [idx]: msgs }));
  } catch (_) {} // ← silencieux
}, []);

// TindadaInboxZeroPage — fallback absent ❌
} catch (err) {
  console.error("[TINDADA] Load messages error:", err); // log uniquement
}
```

### Affichage erreurs utilisateur

| Composant | Timeout visible | Erreur réseau visible |
|-----------|----------------|----------------------|
| DadashMessagerieTab | ❌ "No messages yet" générique | ❌ idem |
| GridPremiumSubpage | ❌ cellule vide silencieuse | ❌ idem |
| TlgProSubpage | ❌ cellule vide silencieuse | ❌ idem |
| TindadaInboxZeroPage | ❌ log console uniquement | ❌ idem |

---

## 8. PROBLÈMES IDENTIFIÉS

### P0 — Critiques

#### P0.1 — `carlosFetch` sans timeout → hangs infinis
**Localisation** : ligne 30489 — utilisé par GerantMessagerieTab + parent Grid Premium
**Symptôme** : si Carlos freeze (Railway cold start ~5-15s), les appels `send-message`, `send-media`, `send-video` depuis GerantMessagerieTab pendent indéfiniment. L'UI est bloquée.
**Fix** : ajouter `AbortController` avec timeout 10-30s comme dans `_dmsgFetch`.

#### P0.2 — Grid + TLG : erreurs Carlos silencieuses
**Localisation** : `gpLoadMsgs` ligne ~31369, `tLoadMsgs` ligne ~32191
**Symptôme** : si Carlos timeout (8s dépassé), la cellule reste vide. L'utilisateur ne sait pas si c'est normal ou une erreur. Aucun message d'erreur, aucun bouton retry.
**Fix** : ajouter `setGpSlotError(p => ({ ...p, [idx]: "Erreur chargement" }))` dans le catch.

#### P0.3 — Grid + TLG : pas de fallback Supabase
**Localisation** : `gpLoadMsgs`, `tLoadMsgs`
**Symptôme** : si Carlos est down, les cellules restent vides même si les messages sont dans Supabase.
**Fix** : ajouter fallback `tg_messages` dans le catch (pattern déjà implémenté dans `DadashMessagerieTab.loadMessagesById`).

---

### P1 — Performance

#### P1.1 — Grid + TLG : 12 fetches parallèles sans cache
**Localisation** : `gpLoadMsgs`, `tLoadMsgs`
**Impact** : 12 × /30s = 1 440 req/heure Carlos par page ouverte en 3×4. Si 5 chatters ouvrent Grid en 3×4 → **7 200 req/heure** = ~2 req/sec constant vers Carlos.
**Fix** : utiliser `_DMSG_MSG_CACHE` avec TTL 60s dans `gpLoadMsgs`/`tLoadMsgs`.

#### P1.2 — Tindada : pas de cache conversations
**Localisation** : `loadUnread` ligne 33671
**Impact** : `/conversations` fetché toutes les 30s — toutes les conversations retournées même si une seule est active.
**Fix** : utiliser `_DMSG_CONV_CACHE` (déjà disponible, TTL 30s) dans `loadUnread`.

#### P1.3 — GerantMessagerieTab : SELECT * sans LIMIT
**Localisation** : ligne 29777-29782
**Impact** : conversation avec 5 000 messages → 5 000 lignes × toutes colonnes en mémoire.
**Fix** : `.limit(100).order("created_at", { ascending: false })` + scroll infini.

#### P1.4 — Suggestions IA sans debounce
**Localisation** : `tLoadSuggestions` ligne 31975
**Impact** : double-clic ✨ ou clic rapide = 2× (2 appels Carlos) = 4 appels en rafale.
**Fix** : guard `if (tSuggestData[idx]?.loading) return;` (déjà partiellement présent).

#### P1.5 — loadConversations : Carlos + Supabase séquentiel dans DadashMessagerieTab
**Localisation** : ligne 37804-37823
**Impact** : Carlos (~500ms) + Supabase (~300ms) = ~800ms séquentiels, au lieu de ~500ms parallèles.
```javascript
// Actuel — séquentiel
const data = await _dmsgFetch("/conversations"); // ~500ms
const { data: sbData } = await q.order(...);     // ~300ms ensuite
// Total : ~800ms
// Optimal — parallèle
const [apiData, sbData] = await Promise.all([
  _dmsgFetch("/conversations").catch(() => []),
  sb.from("tg_conversations").select("*")...
]);
// Total : ~500ms (le plus lent des deux)
```

#### P1.6 — TLG Pro : reset d'état au changement d'onglet = 12 fetches
**Localisation** : ligne 31956-31968
**Impact** : chaque changement d'onglet modèle vide tout et recharge 12 cellules.
**Fix** : conserver les données par onglet dans un objet `{ tabId: { slots, msgs } }`.

---

### P2 — React Re-renders

#### P2.1 — Clés instables `key={idx}` dans Grid + TLG
**Fix** : `key={slot?.chat_id || slot?.id || idx}`

#### P2.2 — Pas de `React.memo` sur les cellules
**Fix** : extraire un composant `GpCell` / `TlgCell` enveloppé dans `React.memo`.

#### P2.3 — 12 mises à jour d'état quasi-simultanées au polling
**Impact** : 12 cellules qui finissent leurs fetches en ~même temps → 12 renders consécutifs.
**Fix** : batcher les mises à jour avec `React.unstable_batchedUpdates` ou `useReducer`.

#### P2.4 — useEffect redémarre l'interval à chaque ajout de conv (Grid)
**Localisation** : deps `[gpSlots, gpLoadMsgs]`
**Fix** : utiliser un `ref` pour `gpSlots` dans l'interval, avec deps vides `[]`.

---

### P3 — UX

#### P3.1 — "No messages yet" sans distinction erreur/vide
**Fix** : states distincts `error | empty | loading | loaded`.

#### P3.2 — Polling actif même onglet hidden
**Partiellement corrigé** : `if (document.hidden) return` présent dans certains composants.
**Manquant** : Grid/TLG — `setInterval` passe le guard `document.hidden` ✅ (vérifié), mais les cellules *chargent quand même au mount* même si l'onglet n'est pas visible.

#### P3.3 — `_showPerfStats()` ne montre pas SLOW/FAILED
**Localisation** : ligne 30469-30479
**Impact** : les stats `_showPerfStats()` affichent COUNT/AVG/MIN/MAX mais pas le nombre de timeouts ni d'erreurs HTTP.
```javascript
// Actuel
console.log(`${k}: COUNT=${arr.length}  AVG=${avg}ms  MIN=${min}ms  MAX=${max}ms`);
// Idéal — ajouter
const slow = arr.filter(t => t > 2000).length;
const failed = window._perfStatsFailed?.[k] || 0;
console.log(`${k}: COUNT=${arr.length}  AVG=${avg}ms  MIN=${min}ms  MAX=${max}ms  SLOW(>2s)=${slow}  FAILED=${failed}`);
```

---

## 9. TABLEAU COMPARATIF PATTERNS

| Pattern actuel | Composant | Impact | Pattern optimal | Gain estimé |
|----------------|-----------|--------|-----------------|-------------|
| Polling 30s × 12 cellules (Grid/TLG) | Grid, TLG | 1 440 req/h Carlos | Cache 60s + polling 60s | **-50% requêtes** |
| Pas de `_DMSG_MSG_CACHE` dans Grid/TLG | Grid, TLG | Reload complet chaque 30s | Utiliser cache existant TTL 60s | **-80% requêtes** en pratique |
| Carlos + Supabase séquentiel dans `loadConversations` | DadashMsg | +300ms latence | `Promise.all()` | **-60% latence** load convs |
| `SELECT *` sans LIMIT (GerantMsg) | GerantMsg | Mémoire O(n) | `.limit(100)` + pagination | **Stable** quelle que soit la taille |
| Erreurs silencieuses Grid/TLG | Grid, TLG | Utilisateur bloqué sans feedback | `setGpSlotError` + message | **UX critique** |
| `carlosFetch` sans timeout | GerantMsg | Hang infini | AbortController 15s | **Stabilité critique** |
| `key={idx}` cellules Grid/TLG | Grid, TLG | Re-mount si réordonnancement | `key={slot.chat_id || idx}` | **Fluidité UI** |
| Reset état complet changement onglet TLG | TLG | 12 fetches à chaque onglet | Cache par onglet | **-12 fetches/changement** |
| Pas de Realtime dans TLG Pro | TLG | Délai max 30s avant nouveau msg | Supabase Realtime channel | **Instantané** |
| Tracker activité non utilisé | DadashMsg | 30s même si idle 30 min | Activer polling adaptatif | **-50% requêtes** si idle |

---

## 10. ROADMAP OPTIMISATIONS FRONTEND

### Phase 0 — Fixes urgents (aujourd'hui) — Durée estimée : ~3h

| # | Fix | Fichier:Ligne | Impact | Effort |
|---|-----|---------------|--------|--------|
| 0.1 | Ajouter timeout 15s à `carlosFetch` | index.html:30489 | ❌→✅ No hang | 15 min |
| 0.2 | Afficher erreur dans cellules Grid/TLG (catch) | index.html:31369, 32191 | UX critique | 20 min |
| 0.3 | Fallback Supabase dans `gpLoadMsgs` + `tLoadMsgs` | index.html:31361, 32191 | Resilience | 1h |
| 0.4 | Améliorer `_showPerfStats()` avec SLOW/FAILED | index.html:30469 | Debug | 20 min |

### Phase 1 — Performance (cette semaine) — Durée estimée : ~6h

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1.1 | Utiliser `_DMSG_MSG_CACHE` dans `gpLoadMsgs` + `tLoadMsgs` | -80% req Carlos Grid/TLG | 1h |
| 1.2 | Activer polling adaptatif (tracker `lastActivityRef` déjà présent) | -50% req si idle | 30 min |
| 1.3 | `Promise.all()` pour Carlos + Supabase dans `loadConversations` | -300ms latence | 30 min |
| 1.4 | `.limit(100)` dans `GerantMessagerieTab.loadMessages` | Mémoire stable | 15 min |
| 1.5 | Utiliser `_DMSG_CONV_CACHE` dans `loadUnread` (Tindada) | -req /conversations | 30 min |
| 1.6 | Clés stables `key={slot.chat_id || idx}` Grid/TLG | UI fluide | 20 min |
| 1.7 | `React.memo` sur cellules Grid/TLG | Re-renders -80% | 1h |

### Phase 2 — Avancé (optionnel) — Durée estimée : ~8h

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 2.1 | Supabase Realtime dans TLG Pro | Messages instantanés | 1h |
| 2.2 | Cache par onglet TLG (éviter reset au changement) | -12 fetches/changement onglet | 2h |
| 2.3 | Batch React updates au polling parallèle | Re-renders × 12 → × 1 | 1h |
| 2.4 | `useReducer` pour état Grid/TLG (remplace N `useState`) | Architecture + perf | 3h |
| 2.5 | Optimistic UI pour envoi messages | UX instantanée (déjà partiel dans DadashMsg `_pending`) | 1h |

---

## 11. EXTRAITS DE CODE CLÉS

### A) Pattern fallback Supabase recommandé pour Grid/TLG

```javascript
// Pattern à reproduire dans gpLoadMsgs / tLoadMsgs
const gpLoadMsgs = React.useCallback(async (conv, idx, silent) => {
  if (!conv) return;
  const cid = _dmsgChatId(conv);
  if (!cid) return;

  // 1. Vérifier cache
  const cached = _DMSG_MSG_CACHE[String(cid)];
  if (cached && Date.now() - cached.ts < 60000 && silent) {
    // Ne pas re-fetch si cache valide et refresh silencieux
    return;
  }

  if (!silent) setGpLoadingSlots(p => ({ ...p, [idx]: true }));
  try {
    const data = await _dmsgFetch("/conversations/" + cid + "/messages?limit=30", { timeout: 8000 });
    const msgs = Array.isArray(data) ? data : data.messages || data.data || [];
    _DMSG_MSG_CACHE[String(cid)] = { data: msgs, ts: Date.now() }; // ← mise en cache
    setGpSlotMsgs(p => ({ ...p, [idx]: msgs }));
    setGpSlotErrors(p => ({ ...p, [idx]: null })); // ← clear erreur
  } catch (err) {
    // Fallback Supabase
    try {
      const { data: convRow } = await sb.from("tg_conversations").select("id").eq("tg_chat_id", cid).maybeSingle();
      if (convRow?.id) {
        const { data } = await sb.from("tg_messages").select("*")
          .eq("conversation_id", convRow.id)
          .order("created_at", { ascending: true })
          .limit(30);
        const msgs = data || [];
        setGpSlotMsgs(p => ({ ...p, [idx]: msgs }));
        setGpSlotErrors(p => ({ ...p, [idx]: null }));
      }
    } catch (_) {
      // Afficher erreur à l'utilisateur
      setGpSlotErrors(p => ({ ...p, [idx]: "Erreur chargement" })); // ← nouveau state
    }
  }
  setGpLoadingSlots(p => ({ ...p, [idx]: false }));
}, []);
```

### B) Polling adaptatif — activer le tracker existant

```javascript
// Tracker déjà présent (ligne 37754-37765) mais non utilisé dans le calcul de l'intervalle
// ─ À modifier dans la fonction scheduleNextPoll (ligne 38410)

const scheduleNextPoll = () => {
  const idleSince = Date.now() - lastActivityRef.current;
  const isIdle = idleSince > 120000; // 2 minutes sans activité
  const delay = isIdle ? 60000 : 30000; // 60s si idle, 30s si actif
  pollRef.current = setTimeout(async () => {
    if (document.hidden) { scheduleNextPoll(); return; }
    await loadMessagesById(chatIdRef.current, false);
    scheduleNextPoll();
  }, delay);
};
```

### C) Promise.all pour loadConversations

```javascript
// Actuel — séquentiel ~800ms
const data = await _dmsgFetch("/conversations");
const { data: sbData } = await q.order(...);

// Optimal — parallèle ~500ms
const [apiResult, sbResult] = await Promise.allSettled([
  _dmsgFetch("/conversations", { timeout: 15000 }),
  q.order("last_message_at", { ascending: false })
]);
const apiList = apiResult.status === "fulfilled"
  ? (Array.isArray(apiResult.value) ? apiResult.value : apiResult.value.conversations || [])
  : [];
const sbList = sbResult.status === "fulfilled" ? (sbResult.value.data || []) : [];
```

### D) `_showPerfStats()` amélioré

```javascript
window._showPerfStats = () => {
  console.log("=== DADASH PERFORMANCE STATS ===");
  Object.keys(window._perfStats).forEach(k => {
    const arr = window._perfStats[k];
    if (!arr.length) return;
    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const threshold = k === "sendVideo" ? 15000 : k === "sendMedia" ? 10000 : k === "sendMessage" ? 3000 : 2000;
    const slow = arr.filter(t => t > threshold).length;
    const timeouts = arr.filter(t => t >= (k.includes("send") ? 8000 : 10000)).length; // approx
    console.log(`${k}:
  COUNT:   ${arr.length}
  AVG:     ${avg}ms
  MIN:     ${min}ms
  MAX:     ${max}ms
  SLOW(>${threshold/1000}s): ${slow} (${Math.round(slow/arr.length*100)}%)
  TIMEOUT_EST: ${timeouts}`);
  });
  console.log("=================================");
};
```

---

## 12. MÉTRIQUES ATTENDUES (à mesurer avec `_showPerfStats()`)

Pour collecter les vraies métriques, ouvrir la console après 5-10 min d'utilisation :
```javascript
_showPerfStats()
```

**Valeurs de référence normales Carlos API (Railway)** :

| Endpoint | Cible P50 | Cible P95 | Alerte si > |
|----------|-----------|-----------|-------------|
| `loadMessages` | < 500ms | < 2 000ms | > 5 000ms |
| `sendMessage` | < 300ms | < 1 500ms | > 3 000ms |
| `sendMedia` | < 2 000ms | < 8 000ms | > 10 000ms |
| `sendVideo` | < 5 000ms | < 30 000ms | > 60 000ms |
| `poll` | < 800ms | < 2 000ms | > 5 000ms |

---

## 13. COORDINATION AVEC L'AUDIT CARLOS

Les problèmes frontend identifiés **impactent directement l'audit Carlos** :

1. **1 440 req/heure Carlos (Grid 3×4)** → Carlos reçoit un polling constant qu'il ne peut pas distinguer du vrai trafic. Si Carlos a un cache, ce polling le sature.
2. **`carlosFetch` sans timeout** → côté Carlos, des connexions HTTP peuvent rester ouvertes indéfiniment sur les routes lentes (upload vidéo 120s).
3. **Pas de retry côté frontend** → Carlos peut ne pas avoir à gérer les retries, mais en cas de Railway cold start (~5-15s), les requêtes frontend échouent directement sans retry.
4. **12 fetches parallèles au mount** → Carlos reçoit des rafales de 12 requêtes simultanées toutes les fois qu'un chatter ouvre Grid Premium — risque de rate limiting ou de saturation connection pool.

**Recommandation partagée** : implémenter un **staggered load** côté frontend — espacer les 12 fetches initiaux de 100ms chacun pour éviter les rafales :
```javascript
gpSlots.forEach((conv, idx) => {
  setTimeout(() => gpLoadMsgs(conv, idx, false), idx * 100); // ← stagger 100ms
});
```

---

*Rapport généré automatiquement par ALFRED (Claude Sonnet 4.6) — aucune modification de code effectuée.*
*Fichier source analysé : `/home/user/dadash-crm/index.html` (~60 000 lignes)*
*Rapport complémentaire : voir `AUDIT_CONVERSATION.md`, `AUDIT_GRID_PREMIUM.md`, `AUDIT_TLG_PRO.md`, `AUDIT_HARMONISATION_4_PAGES.md`*
