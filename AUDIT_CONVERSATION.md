# AUDIT — Route /#/conversation

**Date** : 15 mars 2026 — 15:30 UTC
**Auditeur** : ALFRED (agent automatique)
**Fichier analysé** : `index.html` (application React single-file, ~57 000 lignes)

---

## ⚠️ Note préliminaire — Route exacte

La route `/#/conversation` **n'existe pas** dans le routeur. La messagerie classique 1-1 est rendue par le composant `GerantMessagerieTab` (ligne 29 717), accessible sous l'onglet interne `messagerie` du rôle **gérant**. Le composant riche utilisé par les chatters est `DadashMessagerieTab` (ligne 35 941), accessible via `/#/messagerie` (tab intégré à l'app principale).

**L'audit couvre les deux composants** car ils constituent ensemble la messagerie classique 1-1 de l'application.

---

## 1. FETCH HISTORIQUE

### GerantMessagerieTab (rôle gérant)

**Constat** : Messages chargés via Supabase directement, **aucune limite (`.limit()`)**, tri ascendant, au clic sur une conversation.

```javascript
// ligne 29 777–29 782
const loadMessages = async (convId) => {
  try {
    const { data } = await sb.from("tg_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  } catch (e) { setMessages([]); }
};
```

- **Table** : `tg_messages`
- **Colonnes** : `*` (toutes)
- **Limite** : ❌ Aucune — historique complet chargé d'un coup
- **Trigger** : sélection d'une conversation (via `selectConv`)

**Note** : ✅ OK pour la complétude, mais ⚠️ risque de performance si >1 000 messages

---

### DadashMessagerieTab (rôle chatter — composant principal)

**Constat** : Messages chargés via l'API Carlos (Railway), avec limite de 50 + offset pour pagination. Fallback Supabase en cas d'erreur API.

```javascript
// ligne 36 413–36 425
const data = await _dmsgFetch(
  "/conversations/" + cid + "/messages?limit=50&offset=0"
);
const raw = Array.isArray(data) ? data : (data.messages || data.data || []);
const list = [...raw].sort((a, b) =>
  new Date(a.created_at || a.timestamp || 0).getTime() -
  new Date(b.created_at || b.timestamp || 0).getTime()
);
// Fallback Supabase (ligne 36 457)
const { data } = await sb.from("tg_messages").select("*")
  .eq("conversation_id", convRow.id)
  .order("created_at", { ascending: true });
```

- **Source primaire** : API `https://dadash-autofill-v2-production.up.railway.app`
- **Table Supabase (fallback)** : `tg_messages`
- **Limite** : `?limit=50` (initial) + `?limit=50&offset=N` (pagination)
- **Tri** : ascendant par `created_at` (côté client après fetch)
- **Trigger** : sélection d'une conversation

**Note** : ⚠️ Limite 50 messages au premier chargement — historique complet nécessite scroll vers le haut

---

## 2. SCROLL VERS LE HAUT

**Constat** : Mécanisme de scroll infini **implémenté via un `onScroll` event handler** (pas d'IntersectionObserver). Il y a aussi un bouton clickable "Messages précédents".

```javascript
// ligne 36 765–36 787
const handleMsgScroll = useCallback((e) => {
  const el = e.currentTarget;
  const { scrollTop, scrollHeight, clientHeight } = el;
  const distBottom = scrollHeight - scrollTop - clientHeight;
  // Charger les messages précédents si on scroll vers le haut
  if (scrollTop < 50 && hasMoreMsgs && !loadingMore) {
    setLoadingMore(true);
    const prevHeight = el.scrollHeight;
    loadMoreMessages().then(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - prevHeight; // maintien position
        setLoadingMore(false);
      });
    });
  }
}, [hasMoreMsgs, loadingMore, loadMoreMessages]);
```

- **Élément observé** : `<div ref={msgContainerRef} id="messages-container" onScroll={handleMsgScroll}>`
- **Seuil** : `scrollTop < 50` px
- **Action** : appel `loadMoreMessages()` → `_dmsgFetch("/conversations/{cid}/messages?limit=50&offset=N")`
- **Position maintenue** : `el.scrollTop = el.scrollHeight - prevHeight` (via `requestAnimationFrame`)
- **Bouton alternatif** : `<div onClick={() => loadMoreMessages()}>↑ Messages précédents</div>` (ligne 38 478)

**Scroll auto vers le bas** : ✅ présent — `scrollToBottom('instant')` au mount + à chaque nouveau message si l'utilisateur n'a pas scrollé.

```javascript
// ligne 36 789–36 799
useEffect(() => {
  if (messages.length > prevMsgCountRef.current) {
    if (!isUserScrollRef.current) {
      scrollToBottom('instant');
    } else {
      setHasNewMessages(true); // bouton "↓ Nouveaux messages"
    }
  }
  prevMsgCountRef.current = messages.length;
}, [messages]);
```

**Note** : ✅ OK — scroll infini fonctionnel avec maintien de position

---

## 3. AFFICHAGE DATE/HEURE

**Constat** : Heure affichée sur chaque message + séparateurs de jour ("Aujourd'hui", "Hier", date longue).

### Format heure (DadashMessagerieTab, ligne 38 573–38 574)
```javascript
{ts && (() => {
  try {
    return new Date(ts).toLocaleTimeString("fr-CH", {
      hour: "2-digit", minute: "2-digit"
    });
  } catch (_) { return ""; }
})()}
```
→ **Format** : `"HH:mm"` locale `fr-CH` (ex. : `14:32`)

### Format heure (GerantMessagerieTab, ligne 30 027)
```javascript
<span style={{ fontSize: 9, color: "var(--text-quaternary)" }}>
  {msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString(fr ? "fr-FR" : "en-US", {
        hour: "2-digit", minute: "2-digit"
      })
    : ""}
</span>
```
→ **Format** : `"HH:mm"` locale `fr-FR` ou `en-US`

### Séparateurs de jour (ligne 9 091–9 115)
```javascript
const _formatMsgDate = (ts) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const msgDay = new Date(d); msgDay.setHours(0,0,0,0);
  if (msgDay.getTime() === today.getTime()) return "Aujourd'hui";
  if (msgDay.getTime() === yesterday.getTime()) return "Hier";
  return d.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long"
  });
};
const _shouldShowDateSep = (msg, prevMsg) => {
  // Compare les dates (jour uniquement) des messages consécutifs
  return a.getTime() !== b.getTime();
};
```

**Note** : ✅ OK — heure `HH:mm`, séparateurs "Aujourd'hui" / "Hier" / date longue en français

---

## 4. EMOJIS RX/TX

**Constat** : Les emojis sont affichés dans le texte des messages **sans traitement spécial**. Aucun regex pour détecter les emojis isolés, aucun `font-size` différent pour les emojis seuls.

```javascript
// ligne 38 567–38 570
{(text || !hasMedia) && (
  <div style={{ padding: "9px 13px", fontSize: 15, lineHeight: 1.45,
    wordBreak: "break-word" }}>
    {text || <span style={{ opacity: 0.5, fontStyle: "italic" }}>—</span>}
  </div>
)}
```

La barre d'envoi propose **8 emojis rapides** (ligne 38 622) :
```javascript
{["😘","🔥","💋","😈","🍑","💦","❤️","😏"].map(em => (
  <button key={em} onClick={() => setMsgInput(prev => prev + em)}
    style={{ fontSize: 18, ... }}>
    {em}
  </button>
))}
```

**Note** : ⚠️ Emojis affichés normalement sans traitement spécial — les messages constitués d'un seul emoji ne sont pas agrandis

---

## 5. APPELS

**Constat** : Aucune colonne `is_call`, `call_duration`, `message_type` exploitée dans le rendu des messages. Le champ `type` existe dans l'objet message mais est uniquement utilisé pour la **détection de médias** (photo/video/audio/document), pas pour distinguer des appels.

```javascript
// ligne 38 504–38 512
const rawType = msg.media_type || msg.type || null;
const mediaType = !mediaUrl ? null
  : (rawType === "photo" || rawType === "image") ? "image"
  : rawType === "video" ? "video"
  : (rawType === "document" || rawType === "audio" || rawType === "voice") ? "document"
  : mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? "image"
  : mediaUrl.match(/\.(mp4|mov|webm)(\?|$)/i) ? "video"
  : null;
```

**Note** : ❌ Aucun traitement spécifique pour les appels — pas d'icône téléphone, pas de durée, pas de bulle distincte

---

## 6. MÉDIAS (PHOTO/VIDÉO)

**Constat** : Rendu complet des médias — images, vidéos, documents/audio. Lightbox plein écran au clic sur une image.

### Détection (ligne 38 504–38 513)
```javascript
const mediaUrl = msg.media_url || msg.photo_url || msg.file_url || null;
const rawType  = msg.media_type || msg.type || null;
// → mediaType = "image" | "video" | "document" | null
```

### Rendu image (ligne 38 537–38 545)
```javascript
{mediaType === "image" && (
  <img
    src={mediaUrl}
    loading="lazy"
    onClick={() => setLightboxUrl(mediaUrl)}
    style={{ maxWidth: 320, cursor: "zoom-in", opacity: 0,
      transition: "opacity 0.3s" }}
    onLoad={e => { e.target.style.opacity = "1"; }}
  />
)}
```

### Rendu vidéo (ligne 38 548–38 554)
```javascript
{mediaType === "video" && (
  <video src={mediaUrl} controls preload="metadata"
    style={{ maxWidth: 320 }} />
)}
```

### Lightbox plein écran (ligne 39 585–39 596)
```javascript
const lightbox = lightboxUrl ? (
  <div onClick={() => setLightboxUrl(null)}
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
      zIndex: 9999, ... }}>
    <img src={lightboxUrl} style={{ maxWidth: "92vw", maxHeight: "92vh",
      objectFit: "contain" }} />
    <button onClick={() => setLightboxUrl(null)}>✕</button>
  </div>
) : null;
```

- **Colonnes** : `media_url`, `photo_url`, `file_url`, `media_type`, `type`
- **Image** : `<img>` inline (max 320 px), chargement lazy, fondu à l'apparition
- **Vidéo** : `<video controls preload="metadata">` (max 320 px)
- **Document/audio** : `<a href>` avec icône 📎 + nom du fichier
- **Modal plein écran** : lightbox inline (composant anonyme, pas de nom dédié), fermeture par clic ou bouton ✕

**Note** : ✅ OK — affichage des trois types de médias + lightbox fullscreen pour les images

---

## 7. STRUCTURE DU COMPOSANT

### Composant principal (ligne 35 941)
```javascript
const DadashMessagerieTab = ({ user, lang, spenders, models, profiles,
  txs, initialChatId }) => {
```

### Composant secondaire gérant (ligne 29 717)
```javascript
const GerantMessagerieTab = ({ user, lang, spenders, profiles, models,
  txs, onRefresh, navigateToSpender }) => {
```

### Sous-composants (inline, sans noms dédiés)
| Logique | Implémentation |
|---------|---------------|
| En-tête conversation | JSX inline (`leftPanel`, `centerPanel`) |
| Bulle message | JSX inline dans `.map((msg, i) => ...)` |
| Lightbox image | variable `lightbox` (JSX inline) |
| Barre d'envoi | JSX inline dans le render principal |

### État React (DadashMessagerieTab) — principaux
```javascript
const [conversations, setConversations] = useState([]);
const [messages, setMessages]           = useState([]);
const [selectedConv, setSelectedConv]   = useState(null);
const [msgInput, setMsgInput]           = useState("");
const [msgOffset, setMsgOffset]         = useState(0);
const [hasMoreMsgs, setHasMoreMsgs]     = useState(false);
const [lightboxUrl, setLightboxUrl]     = useState(null);
const [activeSpender, setActiveSpender] = useState(null);
```

### Temps réel Supabase (ligne 36 832–36 877)
```javascript
const channel = sb.channel('dmsg-messages-rt')
  .on('postgres_changes', { event: 'INSERT', schema: 'public',
    table: 'tg_messages' }, payload => {
    // Ajoute le nouveau message si appartient à la conv active
    setMessages(prev => [...prev, msg]);
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public',
    table: 'tg_messages' }, payload => {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
  })
  .subscribe();
```

Polling fallback toutes les **30 secondes** si Realtime indisponible.

**Note** : ✅ OK — architecture claire, Realtime Supabase + polling fallback

---

## 8. PERFORMANCE

### Virtualisation
**Aucune librairie de virtualisation** (`react-window`, `react-virtuoso`, `react-virtual`) n'est importée ni utilisée. Tous les messages sont rendus dans le DOM en une seule passe `.map(...)`.

### Memoization
- `useMemo` utilisé pour `convTotalsMap` (ligne 36 989) — calcul des totaux par spender
- `useCallback` utilisé pour `loadMessagesById`, `loadMoreMessages`, `selectConv`, `handleMsgScroll`, `scrollToBottom`, `getConvName`, `isUnanswered`
- **Aucun `React.memo`** sur les composants de bulle de message
- Cache messages en mémoire : `_DMSG_MSG_CACHE[chatId]` (TTL 60 s)
- Cache conversations : `_DMSG_CONV_CACHE` (TTL 30 s)

### Volume de messages chargés
- **Initial** : 50 messages (limite API `?limit=50`)
- **Pagination** : +50 par scroll vers le haut (`?offset=N`)
- **GerantMessagerieTab** : ❌ aucune limite — tous les messages en une requête

**Note** : ⚠️ Pas de virtualisation — risque de lenteur à partir de ~200 messages dans le DOM

---

## RÉSUMÉ EXÉCUTIF

| Point | Statut | Détail |
|-------|--------|--------|
| 1. Fetch historique | ⚠️ Partiel | DadashMessagerieTab : limite 50 OK avec pagination. GerantMessagerieTab : aucune limite ❌ |
| 2. Scroll infini | ✅ OK | `onScroll` + `scrollTop < 50` déclenche `loadMoreMessages()`, position maintenue |
| 3. Date/heure | ✅ OK | `HH:mm` (fr-CH) + séparateurs "Aujourd'hui" / "Hier" / date longue |
| 4. Emojis RX/TX | ⚠️ Manquant | Emojis affichés en texte brut, pas d'agrandissement pour emojis isolés |
| 5. Appels | ❌ Manquant | Aucun rendu spécifique pour les messages de type appel |
| 6. Médias photo/vidéo | ✅ OK | `<img>` lazy + `<video controls>` + lightbox fullscreen au clic |
| 7. Structure composant | ✅ OK | `DadashMessagerieTab` + Supabase Realtime + polling fallback 30 s |
| 8. Performance | ⚠️ Partiel | Cache mémoire + useCallback OK, mais pas de virtualisation du DOM |

- **Points OK** : 4/8
- **Points partiels / manquants** : 3/8
- **Problèmes critiques** : 1/8 (appels non rendus)

**Prochaine étape recommandée** : PR de modifications pour :
1. Ajouter `.limit(100)` dans `GerantMessagerieTab.loadMessages`
2. Implémenter la détection et le rendu des messages d'appel (`type === "voice_call"` / `"video_call"`)
3. Agrandir les emojis isolés (regex `^\p{Emoji}+$/u`, `font-size: 32px`)
4. Envisager `react-virtuoso` pour la liste de messages si >200 entrées fréquentes
