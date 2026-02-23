# DADASH DESIGN SYSTEM V3

**Auteur :** Jony, Directeur UX/UI
**Date :** 22 fevrier 2026
**Statut :** Specification complete — pret pour implementation

---

> *"Design is not just what it looks like and feels like. Design is how it works." — Steve Jobs*

---

## PRINCIPES FONDAMENTAUX

Avant chaque decision de design, verifier ces 10 principes :

1. **Clarte avant beaute** — Si c'est beau mais confus, c'est rate
2. **Mobile-first, toujours** — 70% des chatters sont sur mobile. Le mobile est la version PRINCIPALE
3. **3 secondes** — Toute info critique doit etre visible en 3 secondes
4. **Progressive disclosure** — Montre le minimum, revele le reste a la demande
5. **Coherence > creativite** — Memes patterns partout, zero surprise
6. **Feedback instantane** — Chaque action a une reaction visible
7. **Accessibilite = qualite** — Contraste WCAG AA minimum partout
8. **Zero dead end** — Toujours un next step, jamais d'ecran vide sans action
9. **Data-driven** — Les chiffres importants sont gros, les details sont petits
10. **Delightful** — Les petits details font la difference

---

## 1. COULEURS

### Palette Primaire (Brand)

Le violet/indigo reste la couleur brand de DADASH. On la clarifie et on la systematise.

```
Indigo-50:  #EEF2FF   — Fond subtil (light mode)
Indigo-100: #E0E7FF   — Hover light
Indigo-200: #C7D2FE   — Border active light
Indigo-300: #A5B4FC   — Texte secondaire accent
Indigo-400: #818CF8   — Accent principal (dark mode)
Indigo-500: #6366F1   — Accent principal (light mode), CTA
Indigo-600: #4F46E5   — Hover
Indigo-700: #4338CA   — Pressed
Indigo-800: #3730A3   — Texte sur fond clair
Indigo-900: #312E81   — Fond dense
```

**Regle :** L'indigo est UNIQUEMENT pour les elements interactifs primaires (boutons CTA, liens, icones actives, focus rings). Jamais pour du texte body ou des backgrounds informatifs.

### Palette Semantique

```
Success
  Light: #059669 (text) / #ECFDF5 (bg) / #A7F3D0 (border)
  Dark:  #34D399 (text) / rgba(52,211,153,0.12) (bg) / rgba(52,211,153,0.25) (border)
  Usage: TX validee, operation reussie, tendance positive

Warning
  Light: #D97706 (text) / #FFFBEB (bg) / #FDE68A (border)
  Dark:  #FBBF24 (text) / rgba(251,191,36,0.12) (bg) / rgba(251,191,36,0.25) (border)
  Usage: TX en attente, alerte non-critique, echeance proche

Danger
  Light: #DC2626 (text) / #FEF2F2 (bg) / #FECACA (border)
  Dark:  #F87171 (text) / rgba(248,113,113,0.12) (bg) / rgba(248,113,113,0.25) (border)
  Usage: TX refusee, erreur, suppression, action destructive

Info
  Light: #2563EB (text) / #EFF6FF (bg) / #BFDBFE (border)
  Dark:  #60A5FA (text) / rgba(96,165,250,0.12) (bg) / rgba(96,165,250,0.25) (border)
  Usage: Information neutre, conseil, aide
```

### Palette Neutrals (10 nuances)

```
                Dark Mode           Light Mode
Neutral-0:     #FAFAFA (text)      #FFFFFF (bg)
Neutral-50:    #F4F4F5             #F8FAFC
Neutral-100:   #E4E4E7             #F1F5F9
Neutral-200:   #A1A1AA             #E2E8F0
Neutral-300:   #71717A             #CBD5E1
Neutral-400:   #52525B             #94A3B8
Neutral-500:   #3F3F46             #64748B
Neutral-600:   #27272A             #475569
Neutral-700:   #1E1E22             #334155
Neutral-800:   #0F0F12             #1E293B
Neutral-900:   #09090B             #0F172A
```

### Mapping Dark/Light Mode

```css
:root {
  /* Backgrounds */
  --bg-base:     #09090B;      /* Page background */
  --bg-raised:   #0F0F12;      /* Cards, elevated surfaces */
  --bg-overlay:  #18181B;      /* Overlays, dropdowns, inputs */
  --bg-surface:  #1E1E22;      /* Nested surfaces */
  --bg-hover:    #27272A;      /* Hover state backgrounds */
  --bg-active:   #303034;      /* Active/pressed state backgrounds */

  /* Text */
  --text-primary:    #FAFAFA;  /* Headings, primary content */
  --text-secondary:  #A1A1AA;  /* Body text, descriptions */
  --text-tertiary:   #71717A;  /* Labels, captions, placeholders */
  --text-quaternary: #52525B;  /* Disabled text, subtle hints */

  /* Borders */
  --border-subtle:   rgba(255,255,255,0.06);  /* Separators */
  --border-default:  rgba(255,255,255,0.10);  /* Card borders, inputs */
  --border-strong:   rgba(255,255,255,0.16);  /* Hover borders */
  --border-accent:   rgba(99,102,241,0.40);   /* Focus, active states */

  /* Accent */
  --accent:        #818CF8;
  --accent-hover:  #6366F1;
  --accent-muted:  rgba(99,102,241,0.12);
  --accent-subtle: rgba(99,102,241,0.06);
}

[data-theme="light"] {
  --bg-base:     #F8FAFC;
  --bg-raised:   #FFFFFF;
  --bg-overlay:  #F1F5F9;
  --bg-surface:  #E2E8F0;
  --bg-hover:    #F1F5F9;
  --bg-active:   #E2E8F0;

  --text-primary:    #0F172A;
  --text-secondary:  #475569;
  --text-tertiary:   #94A3B8;
  --text-quaternary: #CBD5E1;

  --border-subtle:   rgba(0,0,0,0.05);
  --border-default:  rgba(0,0,0,0.10);
  --border-strong:   rgba(0,0,0,0.16);
  --border-accent:   rgba(99,102,241,0.50);

  --accent:        #6366F1;
  --accent-hover:  #4F46E5;
  --accent-muted:  rgba(99,102,241,0.08);
  --accent-subtle: rgba(99,102,241,0.04);
}
```

**Regle absolue :** JAMAIS de couleur hex hard-codee dans le JSX. Toujours `var(--token-name)`. Violation = revert.

---

## 2. TYPOGRAPHIE

### Font Stack

**Une seule font : Inter**

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Pourquoi Inter plutot que DM Sans :**
- Meilleure lisibilite aux petites tailles (critical pour les tableaux/labels a 11-12px)
- Support OpenType features superieur (tabular numbers pour les montants)
- Variable font = un seul fichier, tous les poids
- Standard de l'industrie SaaS (Linear, Vercel, Raycast)

**Font mono (pour montants et codes) :**
```css
font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
```

### Echelle Typographique

Base : 14px, ratio 1.25 (Major Third)

```
Token          Size    Weight  Line-Height  Letter-Spacing  Usage
────────────────────────────────────────────────────────────────────
display-lg     32px    800     1.1          -0.02em         Page title hero (dashboard CA)
display-sm     24px    700     1.2          -0.01em         Section titles
heading-lg     20px    700     1.3          -0.01em         Card headers, modal titles
heading-md     16px    700     1.4          0               Sub-section titles
heading-sm     14px    600     1.4          0               Group labels
body-lg        15px    400     1.6          0               Long-form text (rare)
body-md        14px    400     1.5          0               Default body text
body-sm        13px    400     1.5          0.005em         Table cells, compact text
caption        12px    500     1.4          0.01em          Timestamps, meta-info
label          11px    600     1.3          0.04em          Form labels, badges
micro          10px    600     1.3          0.05em          KPI labels, tags (uppercase)
```

### Regles Typographiques

1. **Maximum 3 tailles par ecran.** Si tu as besoin de plus, la hierarchie est cassee
2. **Les montants utilisent la font mono** avec `font-variant-numeric: tabular-nums` pour un alignement parfait en colonnes
3. **Jamais de uppercase sur du texte de plus de 2 mots** sauf labels de formulaire et badges de statut
4. **Line-height minimum 1.4** pour le body text (accessibilite)
5. **Pas de font-size en dessous de 11px.** Si c'est trop petit pour etre lu, ca ne devrait pas etre la

---

## 3. ESPACEMENT

### Echelle de Spacing

Base : 4px

```
Token     Value   Usage
──────────────────────────────────────────────
space-0   0px     Reset
space-1   4px     Inline element gap (icon + text)
space-2   8px     Tight component gap (chips, tags)
space-3   12px    Default inner padding (mobile)
space-4   16px    Default inner padding (desktop), form gaps
space-5   20px    Card padding (mobile)
space-6   24px    Card padding (desktop), section gaps
space-7   32px    Section separators
space-8   48px    Page section breaks
space-9   64px    Page top/bottom margins
```

### Grille Responsive

```
Breakpoint   Width        Columns   Gutter   Margin   Usage
─────────────────────────────────────────────────────────────
mobile-sm    < 375px      4         12px     12px     iPhone SE, petits Android
mobile       375-767px    4         16px     16px     iPhone standard, Android
tablet       768-1023px   8         20px     24px     iPad portrait
desktop      1024-1279px  12        24px     32px     Laptops
desktop-lg   >= 1280px    12        24px     48px     Desktop monitors
```

### Regles de Spacing

1. **Composant interne :** padding = `space-4` (16px) desktop, `space-3` (12px) mobile
2. **Entre composants siblings :** gap = `space-4` (16px) desktop, `space-2` (8px) mobile
3. **Entre sections :** margin-bottom = `space-6` (24px) desktop, `space-4` (16px) mobile
4. **Page content padding :** `space-6` (24px) desktop, `space-3` (12px) mobile

---

## 4. COMPOSANTS

### 4.1 Boutons

#### Bouton Primaire
```
Etat        Background          Text     Border          Shadow
────────────────────────────────────────────────────────────────
Default     var(--accent)       #FFFFFF  none            none
Hover       var(--accent-hover) #FFFFFF  none            0 4px 12px rgba(99,102,241,0.25)
Active      Indigo-700          #FFFFFF  none            none
Disabled    var(--bg-active)    var(--text-quaternary)  none  none
Loading     var(--accent)       spinner  none            none
```
- Taille : height 40px (desktop), 44px (mobile)
- Padding : 0 20px
- Border-radius : 10px
- Font : 13px/600 uppercase letter-spacing 0.5px
- Transition : all 0.15s ease

#### Bouton Secondaire
```
Etat        Background           Text                 Border
──────────────────────────────────────────────────────────────
Default     transparent          var(--text-secondary) 1px solid var(--border-default)
Hover       var(--bg-hover)      var(--text-primary)   1px solid var(--border-strong)
Active      var(--bg-active)     var(--text-primary)   1px solid var(--border-strong)
Disabled    transparent          var(--text-quaternary) 1px solid var(--border-subtle)
```

#### Bouton Ghost
```
Etat        Background           Text                 Border
──────────────────────────────────────────────────────────────
Default     transparent          var(--text-secondary) none
Hover       var(--bg-hover)      var(--text-primary)   none
Active      var(--bg-active)     var(--text-primary)   none
```

#### Bouton Danger
```
Etat        Background           Text      Border
──────────────────────────────────────────────────
Default     var(--danger-muted)  var(--danger)  1px solid rgba(danger, 0.2)
Hover       var(--danger)        #FFFFFF        none
Active      Danger-700           #FFFFFF        none
```

### 4.2 Inputs

#### Text Input
```
Propriete          Valeur
───────────────────────────────────
Height             44px (mobile & desktop — touch target minimum)
Padding            0 14px
Background         var(--bg-overlay)
Border             1px solid var(--border-default)
Border-radius      10px
Font               14px/400 Inter
Color              var(--text-primary)
Placeholder color  var(--text-tertiary)

Focus:
  Border           var(--accent)
  Ring             0 0 0 3px var(--accent-muted)

Error:
  Border           var(--danger)
  Ring             0 0 0 3px var(--danger-muted)
  + Message rouge 12px sous l'input

Disabled:
  Background       var(--bg-surface)
  Color            var(--text-quaternary)
  Cursor           not-allowed
```

#### Select
Meme specs que Text Input, avec :
- Chevron custom SVG a droite (12px, var(--text-tertiary))
- `appearance: none`
- Option background : var(--bg-raised)

#### Date Input
Meme specs que Text Input. Sur mobile, utiliser le date picker natif du navigateur.

#### Search Input
Comme Text Input, avec :
- Icone loupe (16px) a gauche, padding-left 40px
- Bouton clear (X) a droite quand non-vide
- Debounce 300ms sur la recherche

### 4.3 Cards

```
Propriete          Valeur
───────────────────────────────────
Background         var(--bg-raised)
Border             1px solid var(--border-default)
Border-radius      12px
Padding            20px (desktop), 16px (mobile)
Shadow             none (defaut), var(--shadow-sm) (hover)

Hover (si cliquable):
  Border-color     var(--border-strong)
  Shadow           var(--shadow-sm)
  Transform        translateY(-1px)
  Transition       all 0.15s ease
```

#### KPI Card
```
┌─────────────────────────────┐
│  LABEL (micro, tertiary)    │
│  VALUE (display-lg, primary)│
│  +12% vs last week (caption,│
│  success/danger)            │
└─────────────────────────────┘

- Largeur minimum : 160px
- Grid : repeat(auto-fit, minmax(160px, 1fr))
- Mobile : 2 colonnes fixes
- Valeur en font mono pour alignement
```

### 4.4 Tables (Desktop) → Cards (Mobile)

#### Desktop Table
```
Header:
  Background      var(--bg-overlay)
  Font            label (11px/600/uppercase)
  Color           var(--text-tertiary)
  Padding         12px 16px
  Border-bottom   1px solid var(--border-subtle)

Row:
  Padding         12px 16px
  Font            body-sm (13px)
  Color           var(--text-secondary)
  Border-bottom   1px solid var(--border-subtle)

Row Hover:
  Background      var(--bg-overlay)

Row Selected:
  Background      var(--accent-subtle)
  Border-left     3px solid var(--accent)

Pending Row:
  Background      var(--warning-muted)
```

#### Mobile Card (remplace la table)
```
┌──────────────────────────────────────┐
│  Avatar  Spender Name      €250     │
│          @handle            Pending  │
│          Model: Luna  •  il y a 2h  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  [Valider]  [Refuser]  [Details]    │
└──────────────────────────────────────┘

- Swipe left : actions rapides (valider/refuser)
- Swipe right : details
- Fond colore selon statut (vert valide, ambre pending, rouge refuse)
```

### 4.5 Badges / Tags

```
Type        Background           Text            Border
──────────────────────────────────────────────────────────
Validated   var(--success-muted) var(--success)  none
Pending     var(--warning-muted) var(--warning)  none
Refused     var(--danger-muted)  var(--danger)   none
Whale       var(--pink-muted)    #F472B6         none
VIP         var(--accent-muted)  var(--accent)   none
Dormant     var(--bg-surface)    var(--text-tertiary) none
New         var(--success-muted) var(--success)  none

Specs:
  Padding         4px 10px
  Border-radius   6px
  Font            11px/600/uppercase
  Height          24px (inline-flex centered)
```

### 4.6 Modals

```
Backdrop:
  Background      rgba(0,0,0,0.5)
  Backdrop-filter  blur(4px)
  Transition       opacity 0.15s ease

Modal Container:
  Background      var(--bg-raised)
  Border          1px solid var(--border-default)
  Border-radius   16px (desktop), 20px 20px 0 0 (mobile bottom sheet)
  Shadow          var(--shadow-lg)
  Max-width       480px (desktop), 100% (mobile)
  Max-height      85vh
  Overflow-y      auto

  Animation:
    Desktop: scale(0.95) opacity(0) → scale(1) opacity(1), 0.15s ease-out
    Mobile:  translateY(100%) → translateY(0), 0.25s ease-out (bottom sheet)

Header:
  Padding         20px 24px
  Border-bottom   1px solid var(--border-subtle)
  Font            heading-lg (20px/700)

Body:
  Padding         24px

Footer:
  Padding         16px 24px
  Border-top      1px solid var(--border-subtle)
  Display         flex, justify-content: flex-end, gap: 12px
```

**Regle :** Les modales sont pour les actions secondaires et les confirmations. Les actions frequentes (creation TX, creation spender) doivent etre des pages dediees sur mobile.

### 4.7 Toast Notifications

```
Container:
  Position        fixed, top: 20px, right: 20px (desktop)
  Position        fixed, top: env(safe-area-inset-top, 12px), left: 12px, right: 12px (mobile)
  Z-index         9999

Toast:
  Padding         14px 20px
  Border-radius   12px
  Shadow          var(--shadow-md)
  Font            body-sm (13px/600)
  Max-width       400px (desktop), 100% (mobile)

  Animation entree : translateX(120%) → translateX(0), 0.3s ease-out (desktop)
                     translateY(-100%) → translateY(0), 0.3s ease-out (mobile)
  Animation sortie : opacity → 0, translateY(-8px), 0.2s ease-in
  Auto-dismiss     : 4s (success/info), 6s (warning), manual (error)

Types:
  Success   Background: var(--success), Icon: check-circle
  Error     Background: var(--danger), Icon: x-circle
  Warning   Background: var(--warning), Color: #000, Icon: alert-triangle
  Info      Background: var(--accent), Icon: info
```

### 4.8 Navigation

#### Desktop Sidebar
```
Collapsed:
  Width           72px
  Logo            40x40px centered, gradient background, "D"
  Buttons         44x44px centered, icon only
  Active state    3px left border accent, bg accent-muted

Expanded:
  Width           240px
  Logo            Full "DADASH" text + icon
  Buttons         Full width, icon + label + optional badge
  Active state    Same as collapsed + label in accent color

Transition:
  Width           0.2s ease
  Labels          fade-in 0.15s (delay 0.1s after width transition)
```

#### Mobile Bottom Navigation
```
Height            64px + safe-area-inset-bottom
Background        var(--bg-raised)
Border-top        1px solid var(--border-subtle)
Backdrop-filter   blur(24px)

Buttons:
  Flex             1 (equal distribution)
  Height           100%
  Icon             22px (SVG, not emoji)
  Label            10px/600

  Default          Color: var(--text-tertiary)
  Active           Color: var(--accent), icon scale(1.05)
  Tap feedback     transform scale(0.92), 0.1s

Badge:
  Position         absolute, top: 4px, right: 50%, transform: translateX(14px)
  Size             min-width 18px, height 18px
  Font             9px/700
  Border-radius    9px
```

**Bottom nav par role :**
```
Gerant:   Dashboard | Business | Equipe | Automation | Plus
Chatter:  Dashboard | TX | Spenders | Scan | Plus
Provider: Dashboard | TX | Compta | — | —
Modele:   Dashboard | Tasks | Content | Payments | —
```

### 4.9 FAB (Floating Action Button)

```
Position          fixed, bottom: 32px, right: 32px
                  (mobile: bottom: calc(64px + 16px + safe-area))
Z-index           9999

FAB Button:
  Size            56px
  Border-radius   50% (cercle) → 16px quand expanded
  Background      var(--accent)
  Icon            + (plus), rotates 45deg on open
  Shadow          0 4px 20px rgba(accent, 0.3)
  Hover           scale(1.05), shadow intensified

FAB Menu (expanded):
  Direction       column-reverse (items above FAB)
  Gap             8px
  Item:
    Background    var(--bg-raised)
    Border        1px solid var(--border-default)
    Border-radius 12px
    Padding       12px 16px
    Icon          32px circle with colored background
    Label         14px/500
    Animation     stagger slide-up, 50ms delay per item
```

### 4.10 Tabs

```
Container:
  Border-bottom   1px solid var(--border-subtle)
  Gap             0
  Overflow-x      auto (scroll horizontal si trop de tabs)
  -webkit-overflow-scrolling: touch

Tab Button:
  Padding         12px 20px
  Font            14px/600
  Color           var(--text-tertiary)
  Border-bottom   2px solid transparent
  Background      none
  Transition      all 0.15s ease
  White-space     nowrap

  Active:
    Color          var(--text-primary)
    Border-bottom  2px solid var(--accent)

  Hover:
    Color          var(--text-secondary)
    Background     var(--bg-hover)
```

### 4.11 Filter Chips

```
Chip:
  Padding         8px 16px
  Height          36px (min 44px touch target via gap/margin)
  Border-radius   8px
  Border          1px solid var(--border-default)
  Background      transparent
  Font            12px/500
  Color           var(--text-secondary)
  Transition      all 0.15s

  Hover:
    Border-color   var(--border-strong)
    Color          var(--text-primary)

  Active:
    Background     var(--accent-muted)
    Border-color   var(--border-accent)
    Color          var(--accent)

Container:
  Display         flex
  Gap             8px
  Overflow-x      auto (mobile)
  Padding-bottom  4px (pour la scrollbar)
  Scrollbar       hidden (webkit)
```

### 4.12 Empty States

```
Container:
  Display         flex, column, center
  Padding         48px 24px
  Text-align      center

Icon:
  Size            48px (SVG illustration, not emoji)
  Color           var(--text-quaternary)
  Margin-bottom   16px

Title:
  Font            heading-md (16px/700)
  Color           var(--text-secondary)
  Margin-bottom   8px

Description:
  Font            body-sm (13px/400)
  Color           var(--text-tertiary)
  Max-width       320px
  Margin-bottom   20px

Action Button:
  Bouton Primaire standard
```

**Exemples de messages :**
- TX vide : "Aucune transaction. C'est le calme avant la tempete." + [Creer une TX]
- Spenders vide : "Pas encore de spenders. Le business va bientot decoller." + [Ajouter un spender]
- Filtres sans resultat : "Rien ne correspond a ces filtres. Essaie d'elargir ta recherche." + [Reinitialiser les filtres]

### 4.13 Loading States

#### Skeleton Loader
```
Background:
  Linear-gradient:
    90deg,
    var(--bg-surface) 25%,
    var(--bg-hover) 50%,
    var(--bg-surface) 75%

  Background-size: 200% 100%
  Animation: shimmer 1.5s infinite ease-in-out

Border-radius: meme que le composant qu'il remplace
Height:        meme que le composant qu'il remplace
```

#### Spinner
```
Size            24px (inline), 40px (page)
Border          3px solid var(--accent-muted)
Border-top      3px solid var(--accent)
Border-radius   50%
Animation       spin 0.8s linear infinite
```

### 4.14 Error States

```
Inline Error (sous un input):
  Font            12px/500
  Color           var(--danger)
  Margin-top      6px
  Icon            alert-circle 14px, margin-right 4px

Error Banner (page level):
  Background      var(--danger-muted)
  Border          1px solid rgba(danger, 0.25)
  Border-radius   12px
  Padding         12px 16px
  Display         flex, align-items: center, gap: 12px
  Icon            alert-triangle 20px var(--danger)
  Text            body-sm var(--danger)
  Action          [Reessayer] bouton ghost danger

Error Page (full):
  Meme structure qu'un empty state
  Icon            SVG illustration d'erreur
  Title           "Oops, quelque chose a plante"
  Description     Message technique en caption
  Actions         [Reessayer] + [Retour au dashboard]
```

---

## 5. ICONOGRAPHIE

### Style : Outlined (Lucide Icons)

**Pourquoi Lucide :**
- Open source, MIT license
- 1500+ icones coherentes
- Outline style = lisibilite maximale sur fond sombre
- Taille configurable, couleur stylable
- Tree-shakable
- Compatible React (`lucide-react`)
- Successor spirituel de Feather Icons

### Tailles Standard

```
Token       Size    Stroke   Usage
──────────────────────────────────────────
icon-sm     16px    1.5px    Inline (dans le texte, badges)
icon-md     20px    2px      Boutons, navigation, listes
icon-lg     24px    2px      Headers, actions principales
icon-xl     32px    1.5px    Empty states, illustrations
```

### Mapping Emoji → Icone SVG

```
Actuel (emoji)    Remplacement (Lucide)
──────────────────────────────────────────
📊 Dashboard      LayoutDashboard
💼 Business       Briefcase
👥 Equipe         Users
💬 Messagerie     MessageSquare
📈 Compta         TrendingUp
🤖 Automation     Bot
⚙️ Admin          Settings
🔔 Notifications  Bell
🔍 Search         Search
➕ FAB            Plus
🚪 Logout         LogOut
🔄 Refresh        RefreshCw
☀️ Light mode     Sun
🌙 Dark mode      Moon
💰 Transaction    ArrowUpDown
👤 Spender        UserCircle
📸 Scan           Camera
📢 Broadcast      Megaphone
📋 Tasks          CheckSquare
✅ Validate       Check
❌ Refuse         X
✏️ Edit           Pencil
🗑️ Delete         Trash2
```

---

## 6. OMBRES ET ELEVATIONS

```
Token       Value                              Usage
──────────────────────────────────────────────────────────────────
shadow-xs   0 1px 2px rgba(0,0,0,0.05)         Boutons subtils (light mode)
shadow-sm   0 1px 3px rgba(0,0,0,0.1),         Cards hover, dropdowns
            0 1px 2px rgba(0,0,0,0.06)
shadow-md   0 4px 12px rgba(0,0,0,0.15)        Modales, popovers
shadow-lg   0 8px 24px rgba(0,0,0,0.2)         Modales larges, overlays
shadow-xl   0 20px 60px rgba(0,0,0,0.3)        Notifications panel

dark mode:  Multiplier toutes les opacites par 2 (0.1 → 0.2, etc.)
```

**Regle :** En dark mode, les ombres sont quasi invisibles. La differenciation se fait via les border-color et les background levels (bg-base → bg-raised → bg-overlay → bg-surface).

---

## 7. BORDER RADIUS

```
Token       Value    Usage
────────────────────────────────────────────
radius-xs   4px      Badges, tags inline
radius-sm   6px      Inputs, small buttons, chips
radius-md   10px     Buttons, dropdowns
radius-lg   12px     Cards, modals (desktop)
radius-xl   16px     Large modals, bottom sheets
radius-2xl  20px     Mobile bottom sheets, FAB menu
radius-full 9999px   Avatars, pills, FAB button
```

---

## 8. ANIMATIONS ET TRANSITIONS

### Timing

```
Token          Duration   Easing          Usage
─────────────────────────────────────────────────────
instant        0ms        —               Immediate state changes
fast           100ms      ease-out        Hover states, color changes
normal         150ms      ease-out        Button press, chip toggle
moderate       200ms      ease-out        Card hover, dropdown open
slow           300ms      ease-out        Modal open, page transitions
extra-slow     500ms      ease-in-out     Page route transitions (rare)
```

### Regles d'Animation

1. **150-300ms** pour les interactions UI (boutons, toggles, dropdowns)
2. **300-500ms** uniquement pour les transitions de page ou les modales
3. **ease-out** pour les entrees (l'element arrive et decelere)
4. **ease-in** pour les sorties (l'element accelere et disparait)
5. **ease-in-out** uniquement pour les animations cycliques (breathing, pulse)
6. **Jamais de bounce** sauf feedback de succes (confetti)
7. **`prefers-reduced-motion`** respecte : pas d'animation si l'utilisateur le demande

### Animations Specifiques

```
Modal (desktop):
  Entree: opacity 0 + scale(0.95) → opacity 1 + scale(1), 0.2s ease-out
  Sortie: opacity 1 → opacity 0, 0.15s ease-in

Modal (mobile bottom sheet):
  Entree: translateY(100%) → translateY(0), 0.3s ease-out
  Sortie: translateY(0) → translateY(100%), 0.2s ease-in

Toast:
  Entree (desktop): translateX(120%) → translateX(0), 0.3s ease-out
  Entree (mobile):  translateY(-100%) → translateY(0), 0.3s ease-out
  Sortie:           opacity 1 → 0, 0.2s ease-in

Tab switch:
  Content: opacity 0 + translateY(4px) → opacity 1 + translateY(0), 0.15s ease-out

Card hover:
  Transform: translateY(-1px), 0.15s ease-out
  Shadow: 0 → shadow-sm, 0.15s ease-out

Skeleton shimmer:
  Background-position: 200% → -200%, 1.5s ease-in-out infinite

FAB open:
  Button: rotate(0deg) → rotate(45deg), 0.2s ease-out
  Menu items: stagger translateY(10px) opacity(0) → translateY(0) opacity(1)
              50ms delay per item, 0.25s ease-out each

Pull-to-refresh (mobile):
  Spinner appears at top, spring-like entrance
  Rotation animation while loading
  Check icon + scale bounce on success

Swipe-to-action (mobile cards):
  Card slides to reveal action buttons underneath
  Spring physics: 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)
  Snap back if swipe < 30% of card width
```

---

## 9. RESPONSIVE STRATEGY

### Mobile-First Approach

Tous les styles sont ecrits pour mobile d'abord. Les media queries ajoutent de la complexite pour les ecrans plus grands.

```css
/* Mobile (default) */
.kpi-grid {
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* Tablet */
@media (min-width: 768px) {
  .kpi-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .kpi-grid {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }
}
```

### Adaptations par Breakpoint

| Composant | Mobile (<768) | Tablet (768-1023) | Desktop (>=1024) |
|-----------|--------------|-------------------|-----------------|
| Navigation | Bottom bar + hamburger | Bottom bar + sidebar collapsed | Sidebar expanded |
| Tables | Card list | Table (compact) | Table (full) |
| KPIs | 2 colonnes | 3 colonnes | Auto-fit |
| Grids | 1 colonne | 2 colonnes | 2-3 colonnes |
| Modals | Bottom sheet full width | Centered 480px | Centered 480px |
| Forms | Full page | Full page | Modal ou inline |
| FAB | Above bottom bar | Bottom right | Bottom right |
| Filters | Horizontal scroll | Wrap | Wrap |
| Typography | -1 size step | Standard | Standard |

---

## 10. ACCESSIBILITE

### Minimum Requis (WCAG 2.1 AA)

1. **Contraste texte :** ratio >= 4.5:1 pour le body, >= 3:1 pour le large text (>= 18px bold)
2. **Touch targets :** minimum 44x44px
3. **Focus visible :** ring de 3px var(--accent-muted) sur tous les elements interactifs
4. **Keyboard navigation :** Tab order logique, Enter/Space pour activer
5. **Screen reader :** `aria-label` sur tous les boutons icones, `role` sur les widgets custom
6. **Zoom :** supporter jusqu'a 200% zoom sans perte de fonctionnalite. **Retirer `user-scalable=no`**
7. **Reduced motion :** `@media (prefers-reduced-motion: reduce)` desactive toutes les animations
8. **Color :** jamais communiquer une info uniquement par la couleur. Toujours ajouter une icone ou du texte

### Verification Contraste

```
                    Sur bg-base(dark)  Sur bg-raised(dark)  Sur bg-base(light)
text-primary        #FAFAFA (15.5:1)   #FAFAFA (13.8:1)     #0F172A (15.2:1)    ✅
text-secondary      #A1A1AA (7.2:1)    #A1A1AA (6.4:1)      #475569 (7.0:1)     ✅
text-tertiary       #71717A (4.6:1)    #71717A (4.1:1)       #94A3B8 (3.2:1)     ⚠️ large text only
accent on bg-base   #818CF8 (5.8:1)    #818CF8 (5.2:1)       #6366F1 (5.5:1)     ✅
success on bg-base  #34D399 (8.8:1)    —                     #059669 (4.6:1)     ✅
warning on bg-base  #FBBF24 (11.2:1)   —                     #D97706 (4.7:1)     ✅
danger on bg-base   #F87171 (5.3:1)    —                     #DC2626 (4.5:1)     ✅
```

---

## RESUME DES CHANGEMENTS VS V2

| Aspect | V2 (actuel) | V3 (propose) |
|--------|------------|-------------|
| Font | DM Sans + Inter + Space Mono | Inter uniquement + JetBrains Mono (montants) |
| Icones | Emojis Unicode | Lucide Icons (SVG) |
| Couleurs | CSS vars + hard-coded hex dans JSX | CSS vars UNIQUEMENT, zero hard-coded |
| Tables mobile | Scroll horizontal | Card list |
| Formulaires | Modales partout | Pages dediees (mobile), modales (desktop secondaire) |
| Bottom nav | Identique pour tous | Adaptee par role |
| Spacing | Inconsistant | Echelle 4px systematique |
| Touch targets | Variable (certains <44px) | 44px minimum garanti |
| Accessibilite | user-scalable=no, pas d'aria-labels | WCAG AA complet |
| Animations | Mix de durees et easings | Systeme tokenise coherent |
| Search | Desktop gerant uniquement | Universelle, tous roles, mobile inclus |
| Empty states | Basiques | Illustres, engageants, avec CTA |

---

*"True simplicity is derived from so much more than just the absence of clutter and ornamentation. It's about bringing order to complexity." — Jony Ive*
