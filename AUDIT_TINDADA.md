# AUDIT — Route /#/tindada (alias /#/messagerie-tindada)

**Date** : 15 mars 2026 — 15:30 UTC
**Auditeur** : ALFRED (Claude Sonnet 4.6)
**Fichier analysé** : `index.html` (58 289 lignes)
**Composant principal** : `TindadaInboxZeroPage` (lignes 32426–33044)
**Route réelle** : `/#/messagerie-tindada` ⚠️ *(le contexte mentionne `/#/tindada` — la route exacte est `/#/messagerie-tindada`)*

---

## 1. FETCH HISTORIQUE

**Constat** : Les messages sont chargés via l'API Carlos (`_dmsgFetch`), **pas via Supabase directement**. L'endpoint est `/conversations/{chatId}/messages?limit=30`.

**Base URL** :
```javascript
const _DMSG_API = "https://dadash-autofill-v2-production.up.railway.app"; // ligne 31028
```

**Extrait de code** (lignes 32508–32526) :
```javascript
const loadMessages = useCallback(async (chatId, isSilent = false) => {
  if (!chatId) return;
  if (!isSilent) setMsgLoading(true);
  try {
    const data = await _dmsgFetch("/conversations/" + chatId + "/messages?limit=30", { timeout: 8000 });
    const raw = Array.isArray(data) ? data : data.messages || data.data || [];
    const sorted = [...raw].sort((a, b) =>
      new Date(a.created_at || a.timestamp || 0).getTime() -
      new Date(b.created_at || b.timestamp || 0).getTime()
    );
    setMessages(sorted);
```

| Paramètre | Valeur |
|-----------|--------|
| Endpoint | `GET /conversations/{chatId}/messages?limit=30` |
| Limite | **30 messages** |
| Table interrogée | N/A (API Carlos, pas Supabase) |
| Tri | Client-side, `ascending: true` (oldest → newest) |
| Colonnes utilisées | `text`, `content`, `message`, `caption`, `created_at`, `timestamp`, `is_outgoing`, `direction`, `is_from_me`, `id` |
| Déclencheur | Au mount (1ère conv) + à chaque `goToNext()` |

**Note** : ⚠️ **Limite de 30 messages** — historique complet non chargé. Pas de pagination, pas de "load more".

---

## 2. SCROLL VERS LE HAUT

**Constat** : Aucun mécanisme de scroll infini. Scroll automatique vers le bas au chargement initial. Préservation de la position lors du silent refresh.

**Extrait de code** (lignes 32455–32540) :
```javascript
const scrollToBottom = useCallback(() => {
  setTimeout(() => {
    if (msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, 100);
}, []);

// Sur silent refresh : préservation de la position
if (isSilent) {
  setTimeout(() => {
    const el = msgsAreaRef.current;
    if (!el) return;
    if (wasNearBottom) {
      el.scrollTop = el.scrollHeight;
    } else {
      const heightDiff = el.scrollHeight - prevScrollHeight;
      el.scrollTop = prevScrollTop + heightDiff;
    }
  }, 50);
} else {
  scrollToBottom(); // scroll to bottom on initial load
}
```

- **IntersectionObserver** : ABSENT dans `TindadaInboxZeroPage`
- **onScroll event** : ABSENT dans `TindadaInboxZeroPage`
- **Scroll automatique vers le bas** : ✅ Oui, via `msgsEndRef.scrollIntoView()`
- **Scroll infini** : **AUCUN scroll infini détecté**

**Note** : ⚠️ **Pas de "charger l'historique" en scrollant vers le haut** — les 30 premiers messages sont définitifs.

---

## 3. AFFICHAGE DATE/HEURE

**Constat** : Les messages affichent bien `created_at` (ou fallback `timestamp`). Le format est **relatif**, pas absolu, ce qui explique les "22h", "13h", "5h" vus sur le screenshot — ce sont de vraies valeurs calculées dynamiquement à partir de `created_at`, **pas des placeholders**.

**Extrait de code** (lignes 32489–32500) :
```javascript
const formatMsgTime = useCallback((ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "à l'instant";
  if (diffMins < 60) return diffMins + "min";
  const diffH = Math.floor(diffMins / 60);
  if (diffH < 24) return diffH + "h";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
    + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}, []);
```

| Cas | Format affiché |
|-----|---------------|
| < 1 minute | `à l'instant` |
| < 60 minutes | `Xmin` (ex: `42min`) |
| < 24 heures | `Xh` (ex: `13h`, `22h`, `5h`) |
| ≥ 24 heures | `JJ/MM HH:MM` (ex: `14/03 22:15`) |

- **Séparateurs de jour** ("Aujourd'hui", "Hier") : ABSENTS
- **Librairie date** : Aucune (dayjs, date-fns absents) — JavaScript natif uniquement

**Note** : ⚠️ **Pas de séparateurs de jour** — navigation temporelle difficile pour des échanges sur plusieurs jours. Les heures "22h", "5h" sont du vrai `created_at` relatif.

---

## 4. EMOJIS RX/TX

**Constat** : Aucun traitement spécial pour les emojis dans le rendu des messages. `_escapeHtml()` convertit le texte en innerHTML, les emojis passent normalement. Pas de regex, pas de font-size différent pour les emojis isolés.

**Rendu des messages** (ligne 32946) :
```javascript
{_escapeHtml(msg.text || msg.content || msg.message || msg.caption || "[média]")}
```

**`_escapeHtml`** (lignes 31306–31310) :
```javascript
const _escapeHtml = (text) => {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
};
```

**Panel EMOJIS RAPIDES** (lignes 32785–33000) :
```javascript
const EMOJIS = ["😘","❤️","🔥","😍","💋","😏","💕","🥰","😈","💦","🍑","🫦",
                "😜","💝","👅","🤤","💗","🥵","😻","💓","❣️","💞","😽","🫠"]; // 24 emojis

// Au clic :
const insertEmoji = useCallback((emoji) => {
  setMsgInput(prev => prev + emoji); // insertion dans l'input (pas d'envoi direct)
  if (inputRef.current) inputRef.current.focus();
}, []);
```

- **Position** : Sidebar droite (`.tindada-side-panel`)
- **Comportement au clic** : **Insertion dans l'input** — l'utilisateur doit envoyer manuellement
- **Emojis affichés normalement sans traitement spécial** pour les messages reçus/envoyés

**Note** : ✅ Panel emojis fonctionnel. ⚠️ Les emojis des messages reçus n'ont pas de rendu agrandi (pas de "big emoji mode").

---

## 5. APPELS

**Constat** : La `TindadaInboxZeroPage` **ne traite pas les appels spécifiquement**. Il n'y a aucune logique pour détecter `message_type`, `is_call`, ou `call_duration`. Un message d'appel serait affiché comme texte vide ou `[média]`.

Note : La colonne `call_duration` existe dans le composant `TlgProStandalonePage` (ligne 38549 : `const callDuration = msg.call_duration ? _formatCallDuration(msg.call_duration) : ''`) mais cette logique est **absente de TindadaInboxZeroPage**.

**Note** : ❌ **Aucun traitement spécifique pour les appels dans TindadaInboxZeroPage**. Les messages de type "appel" s'afficheront comme `[média]`.

---

## 6. MÉDIAS (PHOTO/VIDÉO)

**Constat** : Aucun rendu de médias dans `TindadaInboxZeroPage`. Les messages avec médias affichent `[média]` comme texte de fallback.

**Extrait de code** (ligne 32946) :
```javascript
{_escapeHtml(msg.text || msg.content || msg.message || msg.caption || "[média]")}
// Si le message est une photo/vidéo sans texte → affiche "[média]"
```

- **`<img>` / `<video>`** : ABSENTS dans TindadaInboxZeroPage
- **Modal plein écran** : ABSENT
- **Colonnes `media_url`, `photo_url`, `video_url`** : Présentes dans l'API (utilisées dans d'autres composants) mais **ignorées** dans TindadaInboxZeroPage
- **`msg.caption`** : Récupéré (fallback de texte pour les messages média), affiché comme texte

**Note** : ❌ **Aucun affichage de médias détecté** dans TindadaInboxZeroPage. Les photos/vidéos reçues s'affichent comme `[média]`.

---

## 7. SYSTÈME TINDADA (GAMIFICATION)

**Constat** : Système de queue complet avec stats, barre de progression, boutons d'action. L'animation CSS de swipe existe mais **aucun geste tactile swipe** n'est implémenté.

**Structure de la queue** (lignes 32432–32453) :
```javascript
const [unreadConvs, setUnreadConvs] = useState([]);  // stack de toutes les convs non lues
const [currentIdx, setCurrentIdx] = useState(0);     // pointeur dans la stack
const [stats, setStats] = useState({ treated: 0, skipped: 0, streak: 0, startTime: Date.now() });
// Conversations triées par total_spent DESC (highest LTV first)
```

**Navigation vers le suivant** (lignes 32702–32726) :
```javascript
const goToNext = useCallback((direction) => {
  setSwipping(direction); // CSS animation: "swipe-left" ou "swipe-right"
  setTimeout(() => {
    setSwipping(null);
    const next = currentIdxRef.current + 1;
    if (next >= stack.length) { setIsEmpty(true); return; }
    const nextConv = stack[next];
    currentChatIdRef.current = _dmsgChatId(nextConv);
    currentIdxRef.current = next;
    setCurrentIdx(next);
    loadMessages(nextCid);
  }, 400);
}, [loadMessages]);
```

**Auto-refresh** (lignes 32671–32683) :
```javascript
// ⚠️ DISCORDANCE : l'UI affiche "Auto-refresh 10s" mais l'intervalle est 30 000ms (30s) !
refreshRef.current = setInterval(() => {
  loadUnread(true); // refresh silencieux
}, 30000); // ← 30 secondes, pas 10
```

| Fonctionnalité | Implémentation |
|---------------|---------------|
| Header + stats | ✅ `stats.treated`, `stats.skipped`, `stats.streak`, `avgTime` |
| Barre de progression | ✅ `(currentIdx / unreadConvs.length) * 100` |
| Compteur | ✅ `(currentIdx + 1) / unreadConvs.length + " non lus"` |
| Bouton Skip | ✅ `handleSkip()` → skipped+1, streak reset à 0, goToNext("left") |
| Bouton Marquer lu & Next | ✅ `handleMarkRead()` → treated+1, streak+1, goToNext("right") |
| Bouton Envoyer & Next | ✅ `handleSend()` → POST message, treated+1, streak+1, goToNext("right") |
| Swipe CSS | ✅ Classes `swipe-left` / `swipe-right` avec animations |
| Swipe tactile | ❌ **ABSENT** — react-swipeable non utilisé, pas de onTouchMove |
| Auto-refresh | ⚠️ **30s réels** (UI affiche "Auto-refresh 10s") |
| Tri de la queue | ✅ Par LTV/total_spent DESC |
| Merge intelligent au refresh | ✅ Nouvelles convs ajoutées en fin de stack, conv actuelle préservée |

**Note** : ✅ Système de queue fonctionnel. ⚠️ **Système de boutons uniquement, pas de swipe tactile**. ❌ Discordance UI "10s" vs code "30s".

---

## 8. PANEL EMOJIS / RÉPONSES RAPIDES

**Constat** : Le panel est intégré directement dans `TindadaInboxZeroPage` (pas un sous-composant). Il est positionné en sidebar droite et contient 4 sections.

**Structure du panel** (lignes 32990–33039) :
```javascript
<div className="tindada-side-panel">
  {/* 1. Emojis rapides */}
  <div className="tindada-side-section">
    <div className="tindada-side-title">😊 Emojis rapides</div>
    <div className="tindada-emoji-grid">
      {EMOJIS.map((e, i) => (
        <button key={i} className="tindada-emoji-btn" onClick={() => insertEmoji(e)}>
          {e}
        </button>
      ))}
    </div>
  </div>

  {/* 2. Réponses rapides */}
  <div className="tindada-side-section">
    <div className="tindada-side-title">⚡ Réponses rapides</div>
    {QUICK_REPLIES.map((qr, i) => (
      <button key={i} className="tindada-quick-reply" onClick={() => insertQuickReply(qr)}>
        {qr}
      </button>
    ))}
  </div>

  {/* 3. Infos conversation */}
  {/* 4. Raccourcis clavier */}
</div>
```

**Réponses rapides disponibles** (lignes 32787–32794) :
```javascript
const QUICK_REPLIES = [
  "Hey bébé 😘 Comment tu vas ?",
  "Tu me manques tellement 💕",
  "J'ai quelque chose de spécial pour toi 😏",
  "Merci mon cœur ❤️",
  "T'es dispo là ? 🥰",
  "Je pense à toi tout le temps 💋",
];
```

| Élément | Comportement au clic |
|---------|---------------------|
| Emoji rapide | `setMsgInput(prev => prev + emoji)` → **ajout dans l'input** |
| Réponse rapide | `setMsgInput(text)` → **remplacement du contenu de l'input** |
| Envoi | ❌ Ni l'emoji ni la réponse rapide n'envoient directement |

**Note** : ✅ Panel fonctionnel. ⚠️ Les clics n'envoient pas directement, il faut confirmer avec Enter ou le bouton. ⚠️ Le contenu visible dans le screenshot (`😊❤️🔥😂💋🎂🌹💜🤩💯❤️‍🔥😘💕😍💖🥰😻💓`) **diffère des 24 emojis dans le code** (`😘❤️🔥😍💋😏💕🥰😈💦🍑🫦😜💝👅🤤💗🥵😻💓❣️💞😽🫠`) — le code actuel contient plus d'emojis NSFW.

---

## 9. STRUCTURE DU COMPOSANT

**Constat** : Composant unique monolithique, pas de sous-composants séparés.

```
TindadaInboxZeroPage (lignes 32428–33044)
├── State: loading, unreadConvs, currentIdx, messages, msgLoading,
│         msgInput, sending, swiping, stats, isEmpty, toastMsg
├── Refs: refreshRef, msgsEndRef, msgsAreaRef, inputRef, mountedRef,
│         currentChatIdRef, currentIdxRef, unreadConvsRef,
│         lastUnreadCountRef, isEmptyRef, refreshInFlightRef
├── useMemo: currentConv, progressPct, avgTime, spenderInitial, spenderDisplayName
├── useCallback: scrollToBottom, showToast, modelEmoji, modelName, getLtv,
│               getLangue, tierLabel, ltvColor, formatMsgTime, isUserNearBottom,
│               loadMessages, loadUnread, goToNext, handleSend, handleSkip,
│               handleMarkRead, handleKeyDown, insertEmoji, insertQuickReply
└── Render:
    ├── Toast (fixed position)
    ├── Header (logo + compteur + refresh indicator)
    ├── Progress bar
    ├── Stats bar (Traités / Skippés / Streak / Moy / Total)
    └── Main (isEmpty ? EmptyState : [CardArea + SidePanel])
        ├── CardArea: header spender + messages + input + action buttons
        └── SidePanel: emojis + quick replies + conv info + shortcuts
```

- **Hooks Supabase realtime** (`.from().on('INSERT')`) : **ABSENTS** — polling setInterval uniquement
- **React.memo sur le composant** : **ABSENT**

**Note** : ✅ Architecture claire. ⚠️ Composant très long (~620 lignes) tout-en-un. ❌ Pas de temps réel Supabase — polling seulement.

---

## 10. PERFORMANCE

**Constat** : Pas de virtualisation. useMemo/useCallback présents pour les dérivés et handlers.

| Technique | Présent | Détail |
|-----------|---------|--------|
| react-window | ❌ Non | — |
| react-virtuoso | ❌ Non | — |
| useMemo | ✅ Oui | `currentConv`, `progressPct`, `avgTime`, `spenderInitial`, `spenderDisplayName` |
| useCallback | ✅ Oui | Toutes les fonctions |
| React.memo | ❌ Non | Composant non mémoïsé |
| Messages chargés | ⚠️ 30 max | `?limit=30` — hardcodé |
| Conversations chargées | ✅ Toutes | Filtrées par `unread_count > 0`, triées par LTV |

Pour 30 messages maximum, la virtualisation n'est pas critique. Le risque de performance vient davantage du rechargement fréquent des conversations et du composant monolithique.

**Note** : ✅ Optimisations basiques présentes (useMemo/useCallback). ⚠️ Limite 30 messages hardcodée.

---

## RÉSUMÉ EXÉCUTIF

| Point | Status | Problème |
|-------|--------|----------|
| 1. Fetch historique | ⚠️ | Limite 30 messages, API Carlos (pas Supabase direct) |
| 2. Scroll infini | ⚠️ | AUCUN scroll infini — pas de "charger plus" |
| 3. Date/heure | ⚠️ | Format relatif uniquement, pas de séparateurs de jour |
| 4. Emojis | ✅ | Panel fonctionnel, insertion dans input |
| 5. Appels | ❌ | Aucun traitement — s'affiche comme `[média]` |
| 6. Médias | ❌ | Aucun rendu — s'affiche comme `[média]` |
| 7. Gamification | ✅ | Queue fonctionnelle, stats, animations CSS |
| 8. Panel rapide | ✅ | Emojis + réponses rapides, insertion dans input |
| 9. Structure | ✅ | Composant clair, mais monolithique, pas de realtime Supabase |
| 10. Performance | ✅ | useMemo/useCallback présents, 30 msgs max OK |

- **Points OK** : 5/10
- **Points partiels / manquants** : 3/10 (fetch limité, pas de scroll infini, format date partiel)
- **Problèmes critiques** : 2/10 (médias et appels non rendus)

### Anomalies supplémentaires détectées

1. **Route** : Le contexte mentionne `/#/tindada` mais la route réelle est `/#/messagerie-tindada`
2. **Auto-refresh** : L'UI affiche **"Auto-refresh 10s"** mais le code utilise **`setInterval(..., 30000)` (30 secondes)**
3. **Emojis du panel** : Les emojis visibles dans le screenshot diffèrent de ceux du code actuel (code contient des emojis NSFW)

### Prochaine étape

PR de modifications pour implémenter :
1. **Historique complet** : Augmenter la limite ou ajouter pagination (scroll to top → load more)
2. **Affichage date/heure** : Ajouter des séparateurs de jour (Aujourd'hui / Hier / DD/MM)
3. **Médias** : Rendre `<img>` / `<video>` pour les messages avec `media_url` ou `photo_url`
4. **Appels** : Détecter `message_type === "call"` ou `call_duration` et afficher une icône dédiée
5. **Corriger le label** : "Auto-refresh 10s" → "Auto-refresh 30s" pour correspondre au code

**SANS TOUCHER au système de gamification (queue, stats, streak, progress bar, boutons Skip/Next).**
