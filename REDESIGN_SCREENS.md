# DADASH REDESIGN SCREENS — Par Jony, Directeur UX/UI

**Date :** 22 fevrier 2026
**Methode :** Mobile-first wireframes texte + justifications

---

> *"The details are not the details. They make the design." — Charles Eames*

---

## ECRAN 1 — DASHBOARD GERANT (Cockpit)

### Probleme actuel
6+ KPIs en vrac, pas de hierarchie, deux sub-tabs (Analytics/Operations) qui fragmentent l'attention. Le gerant doit cliquer pour trouver ce qui est urgent.

### Redesign — Mobile (375px)

```
┌─────────────────────────────────────┐
│ ■ DADASH          🔔2  🔍  👤      │  ← Topbar sticky
├─────────────────────────────────────┤
│                                     │
│  Bonjour, Marc 👋                   │  ← Greeting contextuel
│  Lundi 22 fev · 14:32 CET          │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  CA AUJOURD'HUI             │    │  ← KPI Hero (1 seul, gros)
│  │  €4,280                     │    │     display-lg, 32px, mono
│  │  ↑ 23% vs hier             │    │     trend en vert/rouge
│  └─────────────────────────────┘    │
│                                     │
│  ┌──────────┐  ┌──────────┐        │  ← 2 KPIs secondaires
│  │ TX Pending│  │ TX Today │        │
│  │  ⚠ 7     │  │  34      │        │
│  │ à valider │  │ validees │        │
│  └──────────┘  └──────────┘        │
│                                     │
│  ── ACTIONS URGENTES ────────────  │  ← Section priorisee
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ⚠ 7 TX en attente          │    │  ← Card cliquable → TX pending
│  │ Depuis 2h en moyenne        │    │
│  │                 [Voir →]    │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 🔴 2 escalations messagerie │    │
│  │ Spender @whale_king urgent  │    │
│  │                 [Voir →]    │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── PERFORMANCE 7J ──────────────  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [Sparkline chart CA 7 jours]│    │  ← Mini chart inline
│  │  Lun Mar Mer Jeu Ven Sam Dim│    │
│  └─────────────────────────────┘    │
│                                     │
│  ── TOP CHATTERS AUJOURD'HUI ────  │
│                                     │
│  1. 🥇 Sarah    €1,200  ████████  │  ← Progress bar relative
│  2. 🥈 Karim    €890    ██████    │
│  3. 🥉 Jules    €650    ████      │
│                                     │
│  ── ACTIVITE RECENTE ────────────  │
│                                     │
│  • Sarah a cree TX €250 @bigsp    │  ← Feed temps reel
│  • Karim scan valide #SC-1042     │
│  • TX #1847 validee par systeme   │
│  • ...                [Voir tout]  │
│                                     │
├─────────────────────────────────────┤
│ 🏠  💼  👥  🤖  ···               │  ← Bottom nav
└─────────────────────────────────────┘
```

### Redesign — Desktop (1280px+)

```
┌──────┬──────────────────────────────────────────────────────┐
│      │  📊 Dashboard      Live 🟢   🔍 Search ⌘K   🔔2  Marc │
│  D   ├──────────────────────────────────────────────────────┤
│  📊  │                                                      │
│  💼  │  Bonjour, Marc · Lundi 22 fev 2026, 14:32 CET       │
│  👥  │                                                      │
│  💬  │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  📈  │  │CA AUJOURD   │ │TX PENDING  │ │TX VALIDEES │       │
│  🤖  │  │  €4,280     │ │  ⚠ 7      │ │  34        │       │
│  ⚙️  │  │ ↑23% vs hier│ │ moy 2h att │ │ +12% vs    │       │
│      │  └────────────┘ └────────────┘ └────────────┘       │
│      │                                                      │
│      │  ┌──────────────────────┐ ┌──────────────────┐      │
│      │  │                      │ │ ACTIONS URGENTES  │      │
│      │  │  [Graphique CA 30j]  │ │                   │      │
│      │  │  Area chart avec     │ │ ⚠ 7 TX pending   │      │
│      │  │  comparaison mois    │ │   → [Valider]    │      │
│      │  │  precedent en ghost  │ │                   │      │
│      │  │                      │ │ 🔴 2 escalations │      │
│      │  │  [Aujourd'hui|7j|30j]│ │   → [Voir]       │      │
│      │  │                      │ │                   │      │
│      │  └──────────────────────┘ │ 📊 P&L mensuel   │      │
│      │                           │   → [Ouvrir]     │      │
│      │  ┌──────────────────────┐ └──────────────────┘      │
│      │  │ TOP CHATTERS SEMAINE │                            │
│      │  │ 1. Sarah  €8,400 ██ │ ┌──────────────────┐      │
│      │  │ 2. Karim  €6,200 ██ │ │ ACTIVITE RECENTE  │      │
│      │  │ 3. Jules  €4,100 ██ │ │ • Sarah TX €250   │      │
│      │  │ [Voir classement]    │ │ • Scan #1042 OK   │      │
│      │  └──────────────────────┘ │ • TX #1847 valid. │      │
│      │                           │ [Voir tout →]     │      │
│      │                           └──────────────────┘      │
└──────┴──────────────────────────────────────────────────────┘
```

### Justifications

| Choix | Raison |
|-------|--------|
| 1 KPI hero au lieu de 6 | Le CA est LA metrique qui compte. Les autres sont secondaires. Reduit la charge cognitive de 6 elements a 1+2 |
| Section "Actions urgentes" | Le gerant ouvre le dashboard pour AGIR, pas pour contempler. Les TX pending et escalations sont front-and-center |
| Greeting personnalise | Humanise l'interface. Donne le contexte temporel (date, heure, timezone) |
| Feed activite recente | Le dashboard respire le temps reel. Le gerant voit instantanement les dernieres actions sans cliquer |
| Plus de sub-tabs Analytics/Operations | Un seul ecran cockpit. Progressive disclosure via scroll, pas via tabs |
| Desktop: layout 60/40 | Le chart prend le focus principal, les actions sont a droite — pattern Stripe |

### Metriques cibles
- **Temps pour trouver les TX pending :** 8s (actuel) → 1s (redesign)
- **Clics pour valider une TX en attente :** 3 (actuel) → 2 (redesign)
- **Comprehension du CA du jour :** immediate (1 chiffre, 1 trend)

### Reference : **Stripe Dashboard** + **Mercury**

---

## ECRAN 2 — DASHBOARD CHATTER (Focus Action)

### Probleme actuel
Le chatter doit naviguer dans des onglets pour creer une TX. La gamification existe mais n'est pas motivante. Le mobile est une version compressee du desktop.

### Redesign — Mobile (375px)

```
┌─────────────────────────────────────┐
│ ■ DADASH          🔔  Sarah  CHAT  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  MON CA AUJOURD'HUI         │    │  ← KPI hero personnel
│  │  €1,200                     │    │
│  │  Objectif: €2,000  ████░░ 60%│   │  ← Barre de progression
│  │  Il te reste €800 💪        │    │     Message motivant
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ╔═══════════════════════╗  │    │  ← CTA GEANT
│  │  ║   + NOUVELLE TX       ║  │    │     Full-width, 56px height
│  │  ║   Creer une transaction║  │    │     Accent color
│  │  ╚═══════════════════════╝  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌──────────┐  ┌──────────┐        │  ← Quick actions
│  │ 📷 Scan  │  │ 👤 Spender│        │
│  │ Verifier │  │ Nouveau  │        │
│  └──────────┘  └──────────┘        │
│                                     │
│  ── CLASSEMENT SEMAINE ──────────  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🏆 Tu es #2 cette semaine │    │
│  │  Sarah #1 (€8,400)         │    │  ← Gamification contextuelle
│  │  → Toi (€6,200) — 73%     │    │
│  │  À €2,200 de la 1ere place │    │  ← Message "a portee"
│  └─────────────────────────────┘    │
│                                     │
│  ── MES TX RECENTES ─────────────  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 👤 @whale_king    €250     │    │  ← Card TX compacte
│  │ Luna · Cam · il y a 15min  │    │
│  │ ✅ Validee                  │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 👤 @bigspender    €180     │    │
│  │ Mia · Tips · il y a 42min  │    │
│  │ ⏳ En attente               │    │
│  └─────────────────────────────┘    │
│  [Voir toutes mes TX →]            │
│                                     │
│  ── MES SPENDERS ACTIFS ─────────  │
│                                     │
│  @whale_king 🐋  €12,400 LTV      │
│  @bigspender     €8,200 LTV       │
│  @new_guy 🆕     €0 (nouveau)     │
│  [Voir tous →]                     │
│                                     │
├─────────────────────────────────────┤
│ 🏠  💰  👤  📷  ···               │
└─────────────────────────────────────┘
```

### Justifications

| Choix | Raison |
|-------|--------|
| CTA "Nouvelle TX" geant | Le chatter cree 20+ TX/jour. L'action #1 doit etre a 1 tap, pas dans un FAB |
| Barre de progression objectif | Le chatter voit instantanement ou il en est. Message motivant "il te reste €800" |
| Classement avec delta | "A €2,200 de la 1ere place" est plus motivant qu'un classement statique |
| Quick actions (Scan + Spender) | Les 3 actions les plus frequentes du chatter a 1 tap |
| TX recentes en cards | Plus lisible que la table actuelle. Info essentielle : qui, combien, statut |
| Bottom nav adaptee | Dashboard, TX, Spenders, Scan, Plus — les 4 actions chatter |

### Metriques cibles
- **Taps pour creer une TX :** 3 (actuel, via FAB) → 1 (redesign, CTA direct)
- **Visibilite de l'objectif :** absente (actuel) → immediate (redesign)
- **Motivation classement :** passive (actuel) → active avec delta (redesign)

### Reference : **Revolut** (action primaire geante) + **Duolingo** (gamification progressive)

---

## ECRAN 3 — DASHBOARD PROVIDER (Revenus Clairs)

### Probleme actuel
Le provider ne sait pas combien il gagne. Les chiffres sont noyes dans des tables. Pas de graphique de tendance.

### Redesign — Mobile (375px)

```
┌─────────────────────────────────────┐
│ ■ DADASH          🔔  Alex  PROV   │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  MES REVENUS CE MOIS        │    │  ← Focus financier
│  │  CHF 12,400                 │    │     Gros chiffre mono
│  │                             │    │
│  │  [Sparkline 30 jours ~~~~] │    │  ← Tendance inline
│  │                             │    │
│  │  ↑ 18% vs mois dernier     │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌──────────┐  ┌──────────┐        │
│  │ A recevoir│  │ TX ce mois│        │
│  │ CHF 3,200│  │  142      │        │
│  │ prochain  │  │ (+8%)     │        │
│  │ paiement  │  │           │        │
│  └──────────┘  └──────────┘        │
│                                     │
│  ── MES MODELES ─────────────────  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 👩 Luna                     │    │
│  │ CA: CHF 6,800  (55%)       │    │  ← Breakdown par modele
│  │ ████████████████░░░░        │    │
│  │ 82 TX · 34 spenders actifs │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 👩 Mia                      │    │
│  │ CA: CHF 5,600  (45%)       │    │
│  │ ████████████████░░░░░░      │    │
│  │ 60 TX · 28 spenders actifs │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── DERNIERS PAIEMENTS ──────────  │
│                                     │
│  ✅ CHF 8,000  15 fev  Virement   │
│  ✅ CHF 7,200  15 jan  Virement   │
│  ✅ CHF 6,800  15 dec  Crypto     │
│  [Historique complet →]            │
│                                     │
├─────────────────────────────────────┤
│ 🏠  💰  📊  ·                     │
└─────────────────────────────────────┘
```

### Justifications

| Choix | Raison |
|-------|--------|
| Revenu mensuel en hero | Le provider veut savoir UNE chose : combien il gagne. Reponse en 1 seconde |
| Sparkline inline | Tendance visible sans cliquer. Le provider voit si ca monte ou descend |
| "A recevoir" + "prochain paiement" | Les 2 questions suivantes : "Quand je suis paye ?" et "Combien ?" |
| Breakdown par modele | Le provider veut savoir quel modele performe. Cards avec barre de proportion |
| Historique paiements timeline | Confiance et transparence. Le provider voit son historique |

### Reference : **Wise Business** (solde central) + **Revolut** (timeline paiements)

---

## ECRAN 4 — CREATION TX (Ultra Rapide)

### Probleme actuel
Le formulaire est dans une modale. Trop de champs visibles. Pas d'autocompletion. Sur mobile, la modale est etriquee.

### Redesign — Mobile (page dediee, pas modale)

```
┌─────────────────────────────────────┐
│ ← Retour        NOUVELLE TX        │  ← Header sticky, bouton retour
├─────────────────────────────────────┤
│                                     │
│  ── ETAPE 1/3 · SPENDER ─────────  │
│  ████████░░░░░░░░░░░░░░░░░ 33%     │  ← Progress bar
│                                     │
│  Spender *                          │
│  ┌─────────────────────────────┐    │
│  │ 🔍 Chercher un spender...  │    │  ← Search-as-you-type
│  └─────────────────────────────┘    │
│                                     │
│  Suggestions :                      │
│  ┌─────────────────────────────┐    │
│  │ 👤 @whale_king   🐋 Whale  │    │  ← Dernier utilise en premier
│  │    LTV €12,400 · 3 TX/sem  │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 👤 @bigspender   💎 VIP    │    │
│  │    LTV €8,200 · 1 TX/sem   │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ + Nouveau spender           │    │  ← Creer inline
│  └─────────────────────────────┘    │
│                                     │
│                                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      [SUIVANT →]            │    │  ← CTA sticky bottom
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

         ↓ Apres selection spender ↓

┌─────────────────────────────────────┐
│ ← Retour        NOUVELLE TX        │
├─────────────────────────────────────┤
│                                     │
│  ── ETAPE 2/3 · DETAILS ─────────  │
│  ████████████████░░░░░░░░░ 66%     │
│                                     │
│  @whale_king 🐋                    │  ← Resume du spender selectionne
│                                     │
│  Montant (EUR) *                    │
│  ┌─────────────────────────────┐    │
│  │ € 0.00                     │    │  ← Input numerique, clavier num
│  └─────────────────────────────┘    │
│                                     │
│  Quick amounts:                     │
│  [ €50 ] [ €100 ] [ €200 ] [€500] │  ← Chips pre-remplis
│                                     │
│  Modele *                           │
│  ┌─────────────────────────────┐    │
│  │ ▼ Luna                     │    │  ← Pre-selectionne si 1 modele
│  └─────────────────────────────┘    │
│                                     │
│  Produit                            │
│  ┌─────────────────────────────┐    │
│  │ ▼ Cam Session              │    │  ← Select avec icone
│  └─────────────────────────────┘    │
│                                     │
│  ▼ Details avances                 │  ← Collapsed par defaut
│  (methode paiement, notes, etc.)   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │      [SUIVANT →]            │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

         ↓ Apres details ↓

┌─────────────────────────────────────┐
│ ← Retour        NOUVELLE TX        │
├─────────────────────────────────────┤
│                                     │
│  ── ETAPE 3/3 · CONFIRMATION ────  │
│  ████████████████████████████ 100%  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  RESUME                     │    │
│  │                             │    │
│  │  Spender  @whale_king 🐋   │    │
│  │  Montant  €250              │    │
│  │  Modele   Luna              │    │
│  │  Produit  Cam Session       │    │
│  │  Methode  Carte             │    │
│  └─────────────────────────────┘    │
│                                     │
│  Screenshot (optionnel)             │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │    📷 Prendre une photo     │    │  ← Camera directe
│  │    📁 Choisir un fichier    │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   ✅ CREER LA TRANSACTION  │    │  ← CTA vert, confirmation
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

         ↓ Apres creation ↓

┌─────────────────────────────────────┐
│                                     │
│                                     │
│           🎉                        │
│                                     │
│     TX #1848 creee !               │
│     €250 · @whale_king             │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  + Creer une autre TX       │    │  ← Shortcut pour enchainer
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │  ← Retour au dashboard     │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### Justifications

| Choix | Raison |
|-------|--------|
| Page dediee au lieu de modale | Sur mobile, les modales sont une UX degradee. Une page dediee offre tout l'espace |
| 3 etapes (wizard) | Progressive disclosure. Le chatter ne voit que ce dont il a besoin a chaque etape. Reduit la charge cognitive de 8+ champs visibles a 1-3 |
| Search-as-you-type spender | Les chatters connaissent le handle par coeur. Taper 2 lettres et selectionner = plus rapide qu'un dropdown |
| Quick amounts chips | Les montants reviennent souvent (50, 100, 200, 500). 1 tap au lieu de taper au clavier |
| Details avances collapsed | 80% des TX n'ont pas besoin de notes ou methode specifique. Cacher par defaut |
| Confirmation avant envoi | Eviter les erreurs (mauvais spender, mauvais montant). 1 ecran de review |
| "Creer une autre TX" en succes | Le chatter enchaine les TX. Pas besoin de repartir du dashboard a chaque fois |
| Camera directe | Le chatter peut photographier la preuve sans passer par la galerie |

### Metriques cibles
- **Temps pour creer une TX :** 45s (actuel) → 15s (redesign)
- **Nombre de taps :** 8+ (actuel) → 5 (redesign)
- **Erreurs de saisie :** reduites par autocompletion et confirmation

### Reference : **Stripe Checkout** (wizard), **Revolut Send Money** (quick amounts)

---

## ECRAN 5 — LISTE TX (Filtrage Intelligent)

### Probleme actuel
Table horizontale non adaptee mobile. Pas de bulk actions. Filtres basiques sans sauvegarde.

### Redesign — Mobile (375px)

```
┌─────────────────────────────────────┐
│ ← Business       TRANSACTIONS      │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 🔍 Rechercher TX, spender..│    │  ← Search global
│  └─────────────────────────────┘    │
│                                     │
│  [ Toutes ] [ ⏳ Pending 7 ]       │  ← Filter chips scroll
│  [ ✅ Validees ] [ ❌ Refusees ]   │     horizontal
│  [ 📅 Aujourd'hui ▼ ]              │
│                                     │
│  ── PENDING (7) ─────────────────  │  ← Grouped by status
│                                     │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│  │ ☐ Tout selectionner (7)    │    │  ← Bulk select
│  │ [✅ Valider tout] [❌ Refuser]│  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ☐ 👤 @whale_king   €250   │    │  ← TX Card (swipeable)
│  │    Luna · Cam · il y a 2h  │    │
│  │    ⏳ En attente            │    │
│  └─────────────────────────────┘    │
│       ← swipe: [✅] [❌] [···]    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ ☐ 👤 @bigspender   €180   │    │
│  │    Mia · Tips · il y a 1h  │    │
│  │    ⏳ En attente            │    │
│  └─────────────────────────────┘    │
│                                     │
│  ... (5 more pending)              │
│                                     │
│  ── VALIDEES AUJOURD'HUI (34) ─── │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 👤 @regular_guy     €50    │    │
│  │    Luna · Tips · 14:20     │    │
│  │    ✅ Validee               │    │
│  └─────────────────────────────┘    │
│  ...                               │
│                                     │
│  [Charger plus ↓]                  │  ← Infinite scroll
│                                     │
├─────────────────────────────────────┤
│ 🏠  💼  👥  🤖  ···               │
└─────────────────────────────────────┘
```

### Redesign — Desktop (1280px+)

```
┌──────┬──────────────────────────────────────────────────────┐
│      │  💼 Business > Transactions                          │
│  D   ├──────────────────────────────────────────────────────┤
│  📊  │  [Transactions] [Spenders] [Catalogue]    ← Sub-tabs │
│  💼◀ │──────────────────────────────────────────────────────│
│  👥  │                                                      │
│  💬  │  🔍 Rechercher...  [Statut ▼] [Modele ▼] [Date ▼]  │
│  📈  │                                                      │
│  🤖  │  Pending: 7 · Aujourd'hui: 34 · Total: 1,247       │
│  ⚙️  │                                                      │
│      │  ☐  SPENDER        MONTANT  MODELE  TYPE    STATUT  │
│      │  ─────────────────────────────────────────────────── │
│      │  ☐  @whale_king    €250     Luna    Cam     ⏳      │
│      │  ☐  @bigspender    €180     Mia     Tips    ⏳      │
│      │  ☐  @vip_client    €400     Luna    Priv    ⏳      │
│      │  ──────────────────────────────────────────────────  │
│      │  ☐  @regular_guy   €50      Luna    Tips    ✅      │
│      │  ☐  @casual        €30      Mia     Cam     ✅      │
│      │                                                      │
│      │  ── Actions groupees (3 selectionnes) ──             │
│      │  [✅ Valider (3)] [❌ Refuser (3)] [📋 Exporter]   │
│      │                                                      │
│      │  Page 1/42  [< Precedent] [Suivant >]               │
└──────┴──────────────────────────────────────────────────────┘
```

### Justifications

| Choix | Raison |
|-------|--------|
| Cards sur mobile au lieu de table | Tables horizontales = scroll penible sur mobile. Cards = lecture naturelle verticale |
| Swipe-to-action | Valider/refuser d'un swipe = pattern natif mobile. Ultra rapide |
| Bulk select + actions | Le gerant peut valider 7 TX pending en 2 taps au lieu de 14 |
| Groupement par statut | Les pending en haut, les validees ensuite. Priorisation naturelle |
| Infinite scroll mobile / pagination desktop | Mobile = scroll naturel. Desktop = controle precis avec pagination |
| Search unifie | Un seul champ pour chercher par spender, montant, modele, date |

### Reference : **Stripe Payments** (filtres + bulk) + **Linear Issues** (groupement)

---

## ECRAN 6 — DETAIL SPENDER (Vue 360)

### Probleme actuel
Le profile-panel essaie de tout montrer en une fois. Dense, pas de structure claire.

### Redesign — Mobile (page dediee)

```
┌─────────────────────────────────────┐
│ ← Spenders     @whale_king         │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🐋                         │    │  ← Avatar + badge
│  │  WHALE_KING                 │    │
│  │  🐋 Whale · Depuis dec 2024│    │
│  │                             │    │
│  │  LTV total                  │    │
│  │  €12,400                    │    │  ← Le chiffre cle
│  │  ↑ Actif · derniere TX 2h  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌──────────┐ ┌──────────┐         │
│  │ TX total │ │ Panier   │         │
│  │   142    │ │  moy €87 │         │
│  └──────────┘ └──────────┘         │
│  ┌──────────┐ ┌──────────┐         │
│  │ Modeles  │ │ Frequence│         │
│  │   3      │ │  3x/sem  │         │
│  └──────────┘ └──────────┘         │
│                                     │
│  [Infos] [Transactions] [Timeline] │  ← Tabs internes
│  ─────────────────────────────────  │
│                                     │
│  ── INFOS ───────────────────────  │
│                                     │
│  Telegram ID    @whale_king        │
│  Telegram #     12345678           │
│  Langue         FR 🇫🇷              │
│  Tags           #high-value #cam   │
│  Notes          "Client fidele,    │
│                  prefere Luna"     │
│  [Modifier les infos]              │
│                                     │
│  ── MODELES ASSOCIES ────────────  │
│                                     │
│  Luna    €8,200 (66%)  ████████    │
│  Mia     €3,400 (27%)  ████       │
│  Sofia   €800   (7%)   █          │
│                                     │
│  ── ACTIONS ─────────────────────  │
│                                     │
│  [+ Creer TX pour ce spender]      │
│  [📷 Verifier un scan]             │
│  [💬 Envoyer un message]           │
│                                     │
├─────────────────────────────────────┤
│ 🏠  💼  👥  🤖  ···               │
└─────────────────────────────────────┘
```

### Justifications

| Choix | Raison |
|-------|--------|
| Page dediee au lieu de panel lateral | Plus d'espace, meilleure lisibilite, fonctionne naturellement sur mobile |
| LTV en hero | Le spender se definit par sa valeur. C'est l'info #1 |
| 4 mini-KPIs | Les 4 metriques essentielles : nombre TX, panier moyen, modeles, frequence |
| Tabs internes (Infos/TX/Timeline) | Progressive disclosure. L'info complete est accessible mais pas ecrasante |
| Breakdown par modele | Le spender interagit avec plusieurs modeles. Qui rapporte le plus ? Visible en 1 seconde |
| Actions contextuelles | Depuis la fiche spender, on peut creer une TX, scanner, ou envoyer un message. Zero navigation |

### Reference : **HubSpot Contact** (vue 360) + **Notion Page** (structure sections)

---

## ECRAN 7 — SCAN CHECKER (2 Clics)

### Probleme actuel
Workflow fonctionnel mais pas de camera directe. Le resultat AI n'est pas assez actionnable.

### Redesign — Mobile (375px)

```
┌─────────────────────────────────────┐
│ ← Automation      SCAN CHECKER     │
├─────────────────────────────────────┤
│                                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │                             │    │
│  │    ┌───────────────────┐    │    │
│  │    │                   │    │    │
│  │    │   📷              │    │    │  ← Zone drop/camera
│  │    │                   │    │    │
│  │    │  Prendre une photo│    │    │
│  │    │  ou deposer un    │    │    │
│  │    │  screenshot       │    │    │
│  │    │                   │    │    │
│  │    └───────────────────┘    │    │
│  │                             │    │
│  │  ┌────────┐  ┌────────┐    │    │
│  │  │📷Camera│  │📁Galerie│   │    │  ← 2 options claires
│  │  └────────┘  └────────┘    │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘

         ↓ Apres upload ↓

┌─────────────────────────────────────┐
│ ← Scan           ANALYSE           │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [Thumbnail du screenshot]  │    │  ← Preview image
│  │  ┌─────────────┐           │    │
│  │  │  Analyse... │           │    │  ← Loading skeleton
│  │  │  ████░░░░░  │           │    │
│  │  └─────────────┘           │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘

         ↓ Resultat ↓

┌─────────────────────────────────────┐
│ ← Scan           RESULTAT          │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [Thumbnail]                │    │
│  │                             │    │
│  │  ✅ SCREENSHOT VALIDE       │    │  ← Resultat clair
│  │                             │    │
│  │  Montant detecte : €250     │    │
│  │  Plateforme : Cam           │    │
│  │  Confiance : 94%            │    │
│  └─────────────────────────────┘    │
│                                     │
│  ── CREER TX AVEC CES INFOS ────  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Spender : [🔍 Chercher..] │    │  ← Pre-remplir depuis l'AI
│  │  Montant : €250 (detecte)  │    │
│  │  Modele  : [▼ Selectionner]│    │
│  │                             │    │
│  │  [✅ CREER TX]              │    │  ← 1 tap pour creer
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [📷 Nouveau scan]         │    │  ← Enchainer
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│ 🏠  💰  👤  📷  ···               │
└─────────────────────────────────────┘
```

### Justifications

| Choix | Raison |
|-------|--------|
| Camera directe en premier | Le chatter est sur mobile. Il photographie la preuve de paiement. Camera > galerie |
| Resultat → formulaire pre-rempli | L'AI detecte le montant. Pourquoi le retaper ? Scan-to-TX en 2 taps |
| Loading avec progress bar | Le chatter voit que l'AI travaille. Feedback immediat |
| "Nouveau scan" en fin de flux | Le chatter enchaine les scans. Pas de retour au dashboard |

### Metriques cibles
- **Taps pour scan → TX :** 6+ (actuel) → 3 (redesign : photo, spender, creer)
- **Temps scan complet :** 30s (actuel) → 10s (redesign)

### Reference : **Revolut Receipt** + **Expensify Smart Scan**

---

## ANIMATIONS ET MICRO-INTERACTIONS

### Transitions entre ecrans

```
Navigation principale (sidebar/bottom nav):
  Sortie: opacity 1 → 0, 0.1s ease-in
  Entree: opacity 0 → 1, translateY(4px) → 0, 0.2s ease-out
  Total perceived: ~0.2s

Drill-down (liste → detail):
  Mobile: slide-in from right, 0.25s ease-out
  Retour: slide-out to right, 0.2s ease-in

Wizard (TX creation step → step):
  Forward: translateX(20px) opacity(0) → translateX(0) opacity(1), 0.2s ease-out
  Backward: translateX(-20px) opacity(0) → translateX(0) opacity(1), 0.2s ease-out
```

### Validation formulaire

```
Succes (input):
  Border: → var(--success), 0.15s
  Check icon: scale(0) → scale(1), 0.2s ease-out (bounce)

Erreur (input):
  Border: → var(--danger), 0.15s
  Shake: translateX(-4px) → 4px → -2px → 2px → 0, 0.3s
  Error message: height(0) opacity(0) → height(auto) opacity(1), 0.15s

Bouton submit loading:
  Text → spinner, width maintained, 0.15s
  Background stays accent

Bouton submit succes:
  Spinner → check icon, background → success, 0.3s
  Confetti burst (optional, on major actions)
```

### Mobile specifique

```
Pull-to-refresh:
  Spinner appears from top, spring entrance
  Rotation while loading
  Check + scale(1.2) → scale(1) on success, 0.3s

Swipe-to-action:
  Card slides left/right to reveal action buttons
  Spring physics: cubic-bezier(0.25, 0.1, 0.25, 1)
  Snap threshold: 30% of card width
  Beyond threshold: auto-complete slide + action

Scroll indicators:
  Fade gradient at bottom when content overflows
  Opacity tied to scroll position (1 at top, 0 at bottom)
```

### FAB

```
Ouverture:
  Backdrop: opacity 0 → 0.5, blur 0 → 4px, 0.2s
  Button: rotate(0) → rotate(45deg), 0.2s ease-out
  Menu items: stagger from bottom
    Each item: translateY(10px) opacity(0) → translateY(0) opacity(1)
    Delay: 50ms per item (first = 0ms, second = 50ms, etc.)
    Duration: 0.25s ease-out

Fermeture:
  All items: opacity 1 → 0, 0.1s ease-in (simultaneous)
  Button: rotate(45deg) → rotate(0), 0.15s ease-in
  Backdrop: opacity → 0, 0.15s
```

### Toasts

```
Entree (desktop): translateX(120%) → translateX(0), 0.3s ease-out
Entree (mobile):  translateY(-100%) → translateY(0), 0.3s ease-out
Idle: stack with 8px gap, reflow on dismiss
Sortie: opacity → 0, translateY(-8px), 0.2s ease-in
Auto-dismiss progress: thin bar at bottom, width 100% → 0%, linear
```

### Skeleton loading

```
Shimmer:
  Background: linear-gradient(90deg,
    var(--bg-surface) 25%,
    var(--bg-hover) 50%,
    var(--bg-surface) 75%)
  Background-size: 200% 100%
  Animation: 1.5s ease-in-out infinite

Apparition du contenu:
  Skeleton → real content
  opacity 1 → 0 (skeleton), 0.15s
  opacity 0 → 1 + translateY(2px) → 0 (content), 0.2s
```

---

## IMPLEMENTATION ROADMAP

### Sprint 1 (Semaine 1) — Quick Wins

| Tache | Impact | Effort |
|-------|--------|--------|
| Remplacer hard-coded colors par CSS vars | Coherence + light mode fix | Moyen (grep + replace) |
| Retirer `user-scalable=no` | Accessibilite | 1 minute |
| Ajouter `aria-label` sur boutons icones | Accessibilite | 2h |
| Augmenter touch targets a 44px | Mobile UX | 3h |
| Adapter bottom nav par role | Navigation | 4h |
| Ajouter time-range selector dashboard | Comprehension | 4h |

### Sprint 2-4 (Mois 1) — Structural

| Tache | Impact | Effort |
|-------|--------|--------|
| Remplacer emojis par Lucide Icons | Coherence visuelle | 2j |
| Cards TX sur mobile (au lieu de table) | Mobile UX | 3j |
| Page dediee TX creation (wizard 3 etapes) | Workflow principal | 3j |
| Bulk actions TX (select + batch validate) | Efficacite gerant | 2j |
| Dashboard redesign (KPI hero + actions urgentes) | Clarte | 3j |
| Search universelle mobile | Productivite | 2j |
| Page Settings centralisee | Organisation | 1j |
| Validation inline formulaires | Qualite saisie | 2j |
| Camera native Scan Checker | Workflow scan | 1j |
| Spender detail page dediee | Vue 360 | 2j |

### V3 (Post-SaaS) — Architecture

| Tache | Impact | Effort |
|-------|--------|--------|
| Migration Vite (supprimer Babel standalone) | Performance | 1 semaine |
| Code splitting + lazy loading | Performance | 1 semaine |
| Decomposition monolithe en fichiers | Maintenabilite | 2 semaines |
| Onboarding interactif par role | Retention | 1 semaine |
| Dashboard personnalisable (widgets) | Engagement | 2 semaines |
| Mode offline avec sync | Fiabilite | 2 semaines |
| Notifications push (Web Push API) | Engagement | 1 semaine |
| Theming par agence (multi-tenant SaaS) | Produit | 2 semaines |
| Swipe-to-action sur cards mobile | Efficacite | 3j |
| Animations completes (toutes les specs ci-dessus) | Delight | 1 semaine |

---

*"People think focus means saying yes to the thing you've got to focus on. But that's not what it means at all. It means saying no to the hundred other good ideas." — Steve Jobs*

*Ce redesign dit NON a la complexite, NON a la surcharge, NON au "on met tout sur l'ecran". Il dit OUI a la clarte, OUI a la vitesse, OUI a l'emotion d'un outil qui fonctionne sans friction.*
