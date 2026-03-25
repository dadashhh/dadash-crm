═══════════════════════════════════════════════════════════════════════════════
              AUDIT VISUEL & DESIGN COMPLET — DADASH CRM
              Fichier unique : /home/user/dadash-crm/index.html
              (~63 000 lignes, React/Babel in-browser)
              Date : 2026-03-25
═══════════════════════════════════════════════════════════════════════════════

TABLE DES MATIÈRES
──────────────────
  PARTIE A — PAGES GÉRANT (Dashboard, Spenders, Transactions, etc.)
  PARTIE B — PAGES GÉRANT (Modèles, Prestataires, etc.)
  PARTIE C — PAGES GÉRANT (Dadacast, Zoo, etc.)
  PARTIE D — PAGES CHATTER / MANAGER CHATTER / PROVIDER / MODÈLE (16 pages)
  PARTIE E — COMPOSANTS TRANSVERSAUX (CSS global, Topbar, Sidebar, Modales, etc.)


═══════════════════════════════════════════════════════════════════════════════
              PARTIE A — GÉRANT : DASHBOARD & SPENDERS
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════
PAGE : DASHBOARD (Composant: DashboardRedesign — Ligne: 11614)
RÔLE : gerant
═══════════════════════════════════════════════════════════════════

LAYOUT :
- Conteneur principal : <div> padding: 0 (desktop) / "0 12px" (mobile, < 768px)
- Structure verticale empilée : Toolbar > KPI strip > Graphe > Bottom grid 3 colonnes > Plateformes > Modales

HEADER / TOOLBAR (L11932-L11954) :
- Classe : .toolbar — display:flex, align-items:center, gap:8px, flex-wrap:wrap
- Period pills : ["24h","7j","30j","90j","All time"] dans un .period-filters (flex, gap:4px)
  Chaque pill : .filter-pill — padding:6px 16px, borderRadius:20px, border:1px solid var(--border-ds) [rgba(255,255,255,0.06)],
    background:rgba(255,255,255,0.04), fontSize:12px, fontWeight:600, color:var(--muted-ds) [rgba(255,255,255,0.35)]
    .active → background:var(--accent-s) [rgba(99,102,241,0.15)], border-color:var(--accent-b) [rgba(99,102,241,0.28)], color:#a5b4fc
- Séparateur : .filter-sep — width:1px, height:20px, background:var(--border-ds)
- DateRangePicker composant inline
- Séparateur
- Select modèle : .f-select — "Tous les modèles"

SECTION 1 — KPI STRIP (L11957-L11986) :
- Type : .kpi-row.cols-7 (mobile: .kpi-row.cols-2)
- Grid : 7 colonnes desktop, 2 colonnes mobile, gap:10px, marginBottom:18px
- 7 KPI cards + 1 SoldeWidget (8 total)
- Chaque .kpi-card :
    background: var(--bg2) [#0b1020], border: 1px solid var(--border-ds) [rgba(255,255,255,0.06)]
    borderRadius: var(--r) [14px], padding: 16px 18px 14px
    transition: all .22s, cursor:pointer
    ::after — barre colorée 2px en bas (gradient par classe)
    hover → border-color:var(--border2-ds) [rgba(255,255,255,0.1)], bg:var(--bg3) [#0e1428], translateY(-1px)
  - .kpi-card-label : fontFamily:'DM Sans', fontSize:12px, fontWeight:700, color:rgba(255,255,255,0.6),
      letterSpacing:.05em, textTransform:uppercase, marginBottom:6px
  - .kpi-card-value : fontFamily:'DM Sans', fontWeight:700, fontSize:22px (inline override: 26px pour DashboardTab),
      lineHeight:1.1, color:#e2e8f0, letterSpacing:-0.3px
      Variantes : .green → #10b981, .indigo → #818cf8, .amber → #f59e0b, .red → #ef4444, .white → #e2e8f0
  - .kpi-card-delta : fontSize:11px, fontWeight:600
      .up → #10b981, .down → #ef4444, .warn → #f59e0b, .dim → var(--dim-ds) [rgba(255,255,255,0.18)]
  - .kpi-card-hint : fontSize:9px, color:var(--dim-ds), fontFamily:'Space Mono',monospace
  - Barre ::after par couleur : .indigo → gradient #6366f1→#8b5cf6, .green → #10b981→#059669, .amber → #f59e0b→#d97706
  - Card KPI labels (DASHBOARD_METRICS L11526) :
      "CA BRUT" (indigo), "CA NET" (green), "CA BRUT EN ATTENTE" (amber), "TX EN ATTENTE" (amber),
      "TX REFUSÉES / ANNULÉES", "CA REFUSÉ / ANNULÉ", "PANIER MOYEN" (white), "TAUX VALIDATION" (green)
  - Active KPI : boxShadow: 0 0 0 2px {metric.color}
  - Click sur KPI inGraph → toggle affichage graphe ; click sur tx_pending → popup pending_list

SECTION 2 — GRAPHE MULTI-SMOOTH (L11988-L12092) :
- Container : background:var(--surface) [#0d0f18], border:1px solid var(--border) [rgba(99,102,241,0.09)],
    borderRadius:14px, padding:16px 20px, marginBottom:18px
- Titre : "Évolution des métriques" — fontSize:15px, fontWeight:800, color:var(--text)
- Sous-titre : fontSize:10px, color:var(--muted2) [#6b7280]
- View toggles : 3 boutons ["Courbe","Barres","Tableau"]
    padding:5px 11px, borderRadius:8, border:1px solid (actif→#8b5cf6 / inactif→var(--border)),
    background actif: rgba(139,92,246,0.15), color actif:#c4b5fd
- Metric pills : .filter-pill style — borderRadius:20px, border:2px solid color, fontSize:11px, fontWeight:600
    Active → background:color+22, dot coloré 7x7px
- Graphe LineChart (Recharts) : height:240px
    CartesianGrid stroke:rgba(255,255,255,0.04), vertical:false
    XAxis tick:fill:#64748b,fontSize:10, tickLine/axisLine:false
    YAxis tick:fill:#64748b,fontSize:10, width:52
    Tooltip bg:#1a2035, border:1px solid rgba(139,92,246,0.3), borderRadius:10, padding:10px 14px, boxShadow:0 8px 24px rgba(0,0,0,0.5)
    Lines : strokeWidth:2, dot:false, activeDot:r5
- BarChart : radius:[3,3,0,0], opacity:0.85
- Table view : fontSize:12, borderCollapse:collapse, header color = metric color

SECTION 3 — BOTTOM GRID (L12094-L12225) :
- Grid : 3 colonnes desktop → gridTemplateColumns:"1fr 1fr 340px", gap:14px, marginBottom:20px
    Mobile → 1fr
- COL 1 : Modèles actives + Chatters en shift
    Card : bg:var(--surface), border:1px solid var(--border), borderRadius:14px, padding:20px
    Titre : "🔥 Modèles actives" — fontSize:15px, fontWeight:800
    Par modèle : avatar 34x34 rounded 10px avec bg color+33, initiale fontWeight:800 fontSize:14
    Nom fontSize:13px fontWeight:700, stats fontSize:10px color:var(--muted2)
    Valeur CA : fontSize:14px fontWeight:800
    Barre progression : height:5px borderRadius:3 bg:rgba(255,255,255,0.06), fill color modèle
    Chatters : "👥 Chatters en shift" — avatar 32x32 rounded 10px bg:rgba(99,102,241,0.2)
    Badge "SHIFT" : fontSize:9px fontWeight:700, bg:rgba(52,211,153,0.15) color:#34d399
- COL 2 : TX récentes + Bots Status
    "🕐 TX récentes" — 5 dernières TX — @spender · modèle · provider · date · montant (color coded)
    Badge statut : fontSize:9px fontWeight:700, padding:1px 6px, borderRadius:6
    "📡 Bots Status" — dot animé (pulse 2s infinite) + nom + status
- COL 3 : AlertsPanel + Alertes collapsibles + To-Do
    "⚠️ Alertes (N)" — collapsible accordion (▼ animé)
    "✅ To-Do" — checkbox list, input + bouton "+" bg:#8b5cf6

SECTION 4 — PLATEFORMES WIDGET (L12227-L12249) :
- Visible si dashPlatformAccounts > 0
- Container : bg:var(--surface), border:1px solid var(--border), borderRadius:14px, padding:16px 20px
- "🔌 Plateformes" — fontSize:15px fontWeight:800
- Chips : gap:10px, padding:6px 12px, borderRadius:9, dot 7x7 coloré

MODALES ACCESSIBLES :
- "pending_list" (DashModal) : TX en attente triées, maxWidth:820
- "bots" (DashModal) : grid 3 cols, par bot 2 tabs (Stats/Logs), maxWidth:900
- "alerts" (DashModal) : alertes, maxWidth:700
- "todos" (DashModal) : To-Do list CRUD, maxWidth:600

HOVER/INTERACTIONS :
- KPI cards : translateY(-1px), ::after opacity 0.7→1
- Modèles cards : border-color → #8b5cf6
- TX récentes card : border-color → #f59e0b
- Bots card : border-color → #38bdf8
- Top Spenders : translateY(-2px), boxShadow:var(--shadow-md)

RESPONSIVE :
- 1024px : kpi-row.cols-7 → repeat(3,1fr), spender-grid/chatter-grid → repeat(2,1fr), bottom grid → 1fr 1fr
- 768px : kpi-row → repeat(2,1fr)!important, kpi-card-value→fontSize:20px, sidebar→hidden,
    mobile bottom bar visible, filter-pill→padding:5px 12px fontSize:11px
- 430px : kpi-value:17px, content padding:10px
- 375px : font-size base:13px, mobile-bottom-bar height:56px

COULEURS UTILISÉES :
- #080c14 (--bg), #0b1020 (--bg2), #0e1428 (--bg3), #0d0f18 (--surface), #131624 (--surface2)
- rgba(255,255,255,0.06) (--border-ds), rgba(99,102,241,0.09) (--border)
- #e2e8f0 (--text-ds), rgba(255,255,255,0.35) (--muted-ds), rgba(255,255,255,0.18) (--dim-ds)
- #6366f1 (--accent-c), rgba(99,102,241,0.15) (--accent-s), rgba(99,102,241,0.28) (--accent-b)
- #8b5cf6, #a5b4fc, #818cf8
- #10b981 (--green-c), #059669, #34d399
- #f59e0b (--amber), #d97706
- #ef4444 (--red-c), #dc2626, #f87171
- #ec4899 (--pink-c)
- #06b6d4, #38bdf8, #f97316
- #64748b, #6b7280 (--muted2), #4a5568 (--muted)
- #1a2035 (tooltip bg)
- #f8fafc, #c4b5fd

TYPO UTILISÉES :
- fontFamily: 'DM Sans', sans-serif (principal)
- fontFamily: 'Space Mono', monospace (hints, labels techniques)
- fontFamily: 'Syne', sans-serif (soldes)
- fontFamily: 'Inter', sans-serif (titre DADASH dans DashboardRedesign)
- fontFamily: 'DM Mono', monospace (téléphones)
- fontSize: 9px (hints, badges compacts), 10px (labels, sub), 11px (delta, pills),
  12px (labels KPI, body), 13px (feed, noms), 14px (noms modèles),
  15px (section titles), 18px (stat values), 20px (mobile KPI),
  22px (kpi-card-value), 26px (DashboardTab KPI inline)
- fontWeight: 400 (body), 500 (mobile nav), 600 (pills, delta, labels), 700 (KPI label, noms, values),
  800 (titres section, KPI value, avatars initiales)


═══════════════════════════════════════════════════════════════════
PAGE : SPENDERS (Composant: SpendersTab — Ligne: 16016)
RÔLE : gerant
═══════════════════════════════════════════════════════════════════

LAYOUT :
- Conteneur : <div> padding:0 (desktop) / "0 12px" (mobile)
- Vertical : Header > GlobalFilterBar > KPI row > Graphe > Activity bar > Toolbar > Alertes > Cards grid > Pagination

HEADER (L17038-L17041) :
- Titre : "👥 Spenders" — fontSize:15px, fontWeight:800, color:var(--text)
  (mode readOnly : "Mes Spenders")
- Sous-titre : "Gestion et analyse de votre base clients" — fontSize:10px, color:var(--muted2), marginTop:2px

SECTION 1 — GlobalFilterBar :
- Composant réutilisable avec dr (date range) + select modèle

SECTION 2 — KPI ROW (L17045-L17083) :
- 5 KPI cards (.kpi-row.cols-5 / mobile: .kpi-row.cols-2), marginBottom:14px
- Cards :
  1. "SPENDERS TOTAL" (indigo) — valeur = nombre, delta "↗ N total base", hint "Cliquer → liste complète"
  2. "ACTIFS 7J" (white) — avec toggle filtre, boxShadow quand actif, delta "%  de la base"
  3. "GORILLES" (amber) — toggle filtre, delta "objectif 5"
  4. "CA TOTAL" (green) — valeur formatée + currencySymbol, delta "↑ N TX validées"
  5. "PANIER MOY." (white) — valeur + currencySymbol, delta "par transaction"

SECTION 3 — GRAPHE SPENDERS (L17084-L17131) :
- Container : bg:var(--surface), border:1px solid var(--border), borderRadius:12px, padding:14px 16px 8px, marginBottom:16px
- 3 metric buttons : NOUVEAUX (#8b5cf6), ACTIFS (#10b981), LTV (#6366f1)
    padding:3px 12px, borderRadius:7, border:1px solid color, fontSize:11px, fontWeight:700
- LTV → BarChart horizontal (layout="vertical"), height:200
- Nouveaux/Actifs → LineChart, height:200, strokeWidth:2, dot:false, activeDot:r5

SECTION 4 — ACTIVITY BAR COMPACT (L17133-L17147) :
- .activity-bar-compact : display:flex, align-items:center, gap:10px, bg:var(--surface), border:1px solid var(--border),
    borderRadius:10px, padding:9px 16px, marginBottom:14px, cursor:pointer
    hover → border-color:rgba(139,92,246,0.4), boxShadow:0 0 8px rgba(139,92,246,0.08)
- Contenu : "⚡" + "Activités" + badges compteurs (🟢 new, ✏️ enrichments, 💬 messages)
    badges : fontSize:10px, fontWeight:700, padding:2px 8px, borderRadius:8, backgrounds rgba colorés
- Dot vert pulsant : 6x6, borderRadius:50%, bg:#10b981, animation:pulse 2s infinite
- "Voir →" : marginLeft:auto, fontSize:11px, fontWeight:600, color:var(--accent)

SECTION 5 — TOOLBAR (L17149-L17221) :
- .toolbar, marginBottom:14px
- Recherche : .f-search — padding:7px 11px, borderRadius:20px, border:1px solid var(--border-ds),
    bg:rgba(255,255,255,0.04), fontSize:12px, placeholder "🔍 Handle / nom…"
- Séparateur
- Select modèle : .f-select — "Tous les modèles"
- Select badge : .f-select — "Tous badges" (SHARK, WHALE, GORILLE, etc.)
- Select langue : .f-select — "Toutes langues" (LANG_FLAGS emoji)
- Select statut : .f-select — "Tous statuts" / "✅ Actif" / "💤 Inactif" / "🚫 Bloqué"
- Séparateur
- Category filters inline : Tous/Avec TG ID/Sans TG ID
    padding:4px 10px, borderRadius:8, fontSize:11px, fontWeight:700, fontFamily:'Space Mono'
    active → background color+22, border color, text color
    count badge : fontSize:10px, padding:0 4px, borderRadius:4
- Sort pills : LTV, VIP, Fréq., Récence, 🕐 Récents
- Reset pill : .filter-pill.red-active
- Filter pills : 🟢 NEW, ✏️ UPDATED (green-active / active)
- Actions droite : bouton "🔄 Sync TG" (.btn.btn-outline) + "➕ Nouveau" (.btn.btn-primary)

SECTION 6 — ALERTES IA (L17223-L17256) :
- ExpandableNotifyBar composant avec items type danger/warning/success/info
- Variant : danger si inactifs, warning si pending >3j, success si acheteurs réguliers, info si fiches incomplètes

SECTION 7 — SPENDER CARDS GRID (L17258-L17331) :
- Grid desktop : .spender-grid — grid repeat(4,1fr), gap:10px
- Mobile : grid 1fr, gap:10px, marginBottom:18px
- Rend <SpenderCardV2> (voir page dédiée ci-dessous)
- Pagination intégrée (spPag.paginatedData)
- Filtres actifs indicators : badges colorés (fontSize:11px, fontWeight:700, borderRadius:7, bg rgba)

MODALES ACCESSIBLES :
- Nouveau spender (showNewSpender) : formulaire création
- Delete confirm (deleteConfirm) : confirmation suppression
- Fusion modal (fusionModal) : recherche + fusion doublons
- Activity drawer (showActivityDrawer) : panneau latéral droit (width:min(420px,92vw))
    Tabs : new_spender / enrichment / messages / all
- Spender modal (selected) : fiche détaillée avec tabs profil/TX/modèles (via UnifiedSpenderModal)

RESPONSIVE :
- 1024px : .spender-grid → repeat(2,1fr)
- 768px : kpi-row → 2 cols, padding 0 12px
- 430px : content padding 10px

COULEURS : (identiques au Dashboard + mêmes variables)

TYPO : (identiques au Dashboard)


═══════════════════════════════════════════════════════════════════
PAGE : SPENDER CARD V2 (Composant: SpenderCardV2 — Ligne: 15912)
RÔLE : gerant
═══════════════════════════════════════════════════════════════════

LAYOUT :
- Card verticale : .spender-card-v2
    background:#13132b, border:1px solid #2a2a4a, borderRadius:12px, overflow:hidden
    display:flex, flex-direction:column, cursor:pointer
    transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s
    hover → border-color:rgba(167,139,250,0.5), translateY(-1px), boxShadow:0 4px 20px rgba(0,0,0,0.4)
- Classes spéciales :
    .spender-card-glow → border-color:rgba(99,102,241,0.30)!important, boxShadow:0 2px 10px rgba(0,0,0,0.25)
    .spender-card-highlight → border-color:rgba(129,140,248,0.50)!important, boxShadow:0 4px 16px rgba(0,0,0,0.35)

SECTION A — HEADER (.sc-header, L15951-L15988) :
- padding:14px 16px 10px, display:flex, align-items:flex-start, gap:12px
- Avatar (.sc-avatar) : width:40px, height:40px, borderRadius:50%, bg dynamique (getSpenderAvatar)
    Contenu : emoji ou initiale (fontWeight:600, fontSize:18, color:#fff)
- Info zone (.sc-info) :
    - Top row : flex, justify-between
        - Nom (.sc-name) : fontSize:14px, fontWeight:700, color:#fff, overflow:ellipsis
        - <ScammerBadge> inline
        - Handle (.sc-handle) : @username + badge TG inline (fontSize non spécifié en classe, petit)
            .sc-handle-tg-badge inline
        - Langue flag : marginLeft:2px
    - Time badge (.sc-time-badge) : temps relatif
    - Badges zone (.sc-badges) : display:flex, gap:5px, flex-wrap:wrap, marginTop:8px
        - Badge modèle (inline style) : bg:color+22, color:color, border:1px solid color+55, borderRadius:12px,
            fontSize:11px, fontWeight:600, padding:2px 8px
            Multi-modèles → gradient bg, "Multi-modèles" + count
            Sans modèle → color:#555, fontSize:11px
        - Badges spender (.sc-badge) : padding:3px 8px, borderRadius:20px, fontSize:10px, fontWeight:600
            .sc-badge-vip → bg:rgba(234,179,8,0.15), color:#eab308
            .sc-badge-tw → bg:rgba(239,68,68,0.15), color:#ef4444
            .sc-badge-new → bg:rgba(34,197,94,0.15), color:#22c55e
            Max 3 badges affichés, clic → toggleBadge

SECTION B — DIVIDER (.sc-divider) :
- height:1px, background:#2a2a4a

SECTION C — STATS 2x2 (.sc-stats, L15991-L15997) :
- display:grid, grid-template-columns:1fr 1fr, padding:10px 16px, gap:8px
- 4 stats :
    1. "Total spent" — valeur LTV arrondie + currencySymbol
    2. "Avg basket" — AOV arrondi + currencySymbol
    3. "Last TX" — temps relatif (aujourd'hui/hier/Nj ago/jamais)
    4. "TX count" — nombre
- .sc-stat-label : fontSize:9px, textTransform:uppercase, color:#555, letterSpacing:1px
- .sc-stat-value : fontSize:14px, fontWeight:700, color:#22c55e
    .zero → color:#555

SECTION D — VIP BAR (.sc-vip, L15998-L16002) :
- padding:0 16px 10px
- Row : flex justify-between, fontSize:10px, color:#555, "VIP" + score/100
    Score couleur : >=70 → #22c55e, >=40 → #eab308, <40 → #ef4444, fontWeight:600
- Bar (.sc-vip-bar) : height:3px, bg:#2a2a4a, borderRadius:2px
    Fill (.sc-vip-fill) : bg:#a78bfa, width:score%, transition:width 0.3s

SECTION E — DIVIDER

SECTION F — ACTIONS (.sc-actions, L16004-L16011) :
- display:flex, gap:6px, padding:10px 16px, onClick stopPropagation
- Boutons (.sc-btn) : flex:1, padding:6px 4px, borderRadius:6px, border:1px solid #2a2a4a,
    bg:transparent, color:#888, fontSize:10px, cursor:pointer, text-align:center, transition:all 0.15s
    hover → borderColor:#a78bfa, color:#a78bfa
- .sc-btn-primary : bg:rgba(139,92,246,0.15), borderColor:#a78bfa, color:#a78bfa, fontWeight:600
- .sc-btn-danger : flex:none, width:32px
    hover → borderColor:#ef4444, color:#ef4444
- Boutons : "+ TX", "Histo", "Profil", "✈ TG" (si telegram), "🗑" (si gérant+dbId)

ÉTATS :
- Card glow : nouveau <24h ou updated <24h → classe .spender-card-glow
- Highlighted : classe .spender-card-highlight (après clic activity)
- Zero values : .sc-stat-value.zero → color:#555

COULEURS :
- #13132b (card bg), #2a2a4a (borders/dividers), #555 (muted labels), #888 (btn text)
- #fff (nom), #22c55e (stats green), #eab308 (vip medium), #ef4444 (danger/low vip)
- #a78bfa (vip bar, btn hover, model badge), rgba(167,139,250,0.5) (hover border)
- rgba(139,92,246,0.15) (btn primary bg), rgba(99,102,241,0.30) (glow border)

TYPO :
- fontSize: 9px (stat-label), 10px (badges, btn, vip), 11px (model badge), 14px (nom, stat-value), 18px (avatar)
- fontWeight: 600 (avatar, badges, vip score, btn primary), 700 (nom, stat-value)


═══════════════════════════════════════════════════════════════════
PAGE : TRANSACTIONS (Composant: TransactionsTab — Ligne: 15182)
RÔLE : gerant
═══════════════════════════════════════════════════════════════════

LAYOUT :
- Conteneur : padding:"0 12px" (desktop et mobile)
- Vertical : Header > GlobalFilterBar > KPI row 6 cards > Graphe > Bouton + TX > Table paginée

HEADER (L15482-L15485) :
- .ui-section-header
- Titre : "💰 Transactions" — .ui-section-title, fontSize:20px (override inline)
- Sous-titre : "Validation et suivi des ventes — CA / TX en attente" — fontSize:11px, marginTop:3px

SECTION 1 — GlobalFilterBar (L15486-L15490) :
- Composant réutilisable avec dr, models, profiles
- Filtres actifs : modèle, provider (gérant), chatter (gérant), statut

SECTION 2 — KPI ROW (L15491-L15533) :
- 6 KPI cards (.kpi-row.cols-6 / mobile: .kpi-row.cols-2), marginBottom:12px
- Cards :
  1. "CA BRUT 💰" (indigo) — montant arrondi + currencySymbol, hint "Cliquer → graphe", toggle filtre
  2. "CA NET 🏦" (green) — montant arrondi + currencySymbol
  3. "CA EN ATTENTE ⏳" (amber) — montant arrondi
  4. "TX VALIDÉES ✅" (green) — nombre
  5. "TX PENDING ⏳" (amber si >0, white sinon) — nombre
  6. "PANIER MOYEN 🛒" (white) — montant
- Click sur certaines cards → setTxCardFilter toggle, boxShadow:0 0 0 2px color

SECTION 3 — GRAPHE TX (L15534-L15565) :
- Container : bg:var(--surface), border:1px solid var(--border), borderRadius:12px, padding:14px 16px 8px, marginBottom:16px
- Toolbar : 2 pills "CA" / "NB TX" (.filter-pill)
- LineChart Recharts height:200px
    2 lignes : Validées (#10b981, strokeWidth:2, dot r:3) + Pending (#f59e0b, strokeWidth:2, dot r:3)
    CartesianGrid : strokeDasharray:"3 3", stroke:rgba(255,255,255,0.04), vertical:false
    Tooltip : bg:var(--surface), border:1px solid var(--border), borderRadius:8, padding:10px 14px, fontSize:12
- Empty state : height:200, flex center, color:var(--text-tertiary), fontSize:13

SECTION 4 — BOUTON CRÉER (L15566-L15568) :
- .ui-btn-primary, marginBottom:20px
- "+ Nouvelle TX"
- Visible si gerant ou chatter

SECTION 5 — TABLE TX (L15720-L15778+) :
- .ui-panel > .table-wrap (overflow-x:auto) > table.table
- .table : width:100%, borderCollapse:separate, borderSpacing:0 2px, fontSize:13px
- .table th : padding:10px 14px, textAlign:left, fontSize:10px, fontWeight:600, textTransform:uppercase,
    letterSpacing:1px, borderBottom:1px solid var(--table-border), color:var(--table-header-color)
- .table td : padding:10px 14px, color:var(--text-secondary), borderBottom:none
- .table tr:hover : bg:var(--table-row-hover)
- .table tr.pending-row : bg:var(--warning-muted)
- .table tr.tx-cancelled : (cancelled styles)
- .table tr.status-changing : opacity:0.6

- Colonnes (mode gerant) :
  1. Date/Heure (SortTh) — fontFamily:monospace, fontSize:12px, color:var(--text-secondary), whiteSpace:nowrap
  2. Spender (SortTh) — <Tag type="spender"> cliquable
  3. ID TELEGRAM — fontFamily:monospace, fontSize:12px, color:var(--text-secondary)
  4. Modèle (SortTh) — <Tag type="model">
  5. Provider (SortTh)
  6. Produit (SortTh)
  7. Détail produit
  8. Montant (SortTh)
  9. Facture — textAlign:center
  10. Méthode paiement
  11. Chatter (SortTh) — gerant only
  12. Statut (SortTh) — badge coloré
  13. Actions — boutons valider/refuser/edit/cancel
- Loading : <SkeletonRows> (rows:8, cols:12)
- Pagination serveur : TX_PAGE_SIZE=100, boutons page prev/next

MODALES ACCESSIBLES :
- Création TX (ModalShell, L15570-L15719) :
    maxWidth:560px, width:95vw, margin:16px, maxHeight:92vh, overflowY:auto
    Titre : "💸 Nouvelle Transaction" — fontSize:16px
    Formulaire grid 2 cols (mobile:1fr) gap:14px
    Champs : Spender* (autocomplete dropdown), Telegram ID*, Modèle*, Provider*, Produit*, Détail produit,
        Montant* (input number + toggle EUR/CHF), Méthode paiement*, Chatter (gérant), Notes
    Dropdown spender : bg:var(--surface), border:1px solid var(--border), borderRadius:8,
        maxHeight:220, boxShadow:0 8px 24px rgba(0,0,0,0.35)
    Content tags : pills toggle, borderRadius:10
    Actions : Annuler (.ui-btn-secondary flex:1) + Créer (.ui-btn-primary flex:1)
- Edition TX (editingTx) : même form
- Confirm refus (confirmRefuse)
- Annulation TX (txToCancel)
- Invoice validation provider (invoiceValidateTx)

RESPONSIVE :
- 768px : kpi-row → 2 cols
- Table : overflow-x scroll horizontal, min-width varie par breakpoint

COULEURS : (même palette Dashboard)
TYPO : (même palette Dashboard + monospace pour dates/IDs)


═══════════════════════════════════════════════════════════════════
PAGE : CATALOGUE PRODUITS (Composant: ProductCatalogTab — Ligne: 26445)
RÔLE : gerant
═══════════════════════════════════════════════════════════════════

LAYOUT :
- Conteneur : <div> sans padding explicite
- Vertical : GlobalFilterBar > KPIs > Tabs bar > Tab content (Produits / Détails / Providers)

HEADER :
- Pas de titre explicite — le GlobalFilterBar sert de header avec date range

SECTION 1 — KPIs (L26553-L26559) :
- .kpi-grid (display:grid), marginBottom:20px
- 4 KPICard composants :
  1. "Produits actifs" — value = count, icon "🛍️"
  2. "Détails actifs" — value = count, icon "🏷️"
  3. "CA Total" — valeur formatée + currencySymbol, icon "💰"
  4. "Ventes" — value = totalSales, icon "📋"

SECTION 2 — TABS BAR (L26561-L26566) :
- display:flex, gap:0, borderBottom:1px solid var(--border,rgba(255,255,255,0.06)), marginBottom:24px
- 3 tabs : "🛍️ Produits" / "🏷️ Détails Produit" / "🏦 Providers"
    padding:12px 20px, bg:none, border:none, fontSize:14px, fontWeight:600, fontFamily:'DM Sans'
    Active : borderBottom:2px solid #8B5CF6, color:#fff
    Inactive : borderBottom:2px solid transparent, color:#6B7280
    transition:all 0.2s

SECTION 3 — TAB PRODUITS (L26568-L26666) :
- Bouton "➕ Nouveau produit" (.btn.btn-primary), marginBottom:20px
- Par catégorie PRODUCT_CATEGORIES :
    Header catégorie : emoji (CAT_ICONS) fontSize:18px + nom fontSize:14px fontWeight:800
        + badge count : fontSize:11px, bg:rgba(255,255,255,0.06), padding:2px 8px, borderRadius:10
    Grid produits : grid repeat(auto-fill,minmax(270px,1fr)), gap:12px
    Product card :
        bg:var(--surface,#0e1420), border:1px solid rgba(139,92,246,0.2), borderRadius:14px, padding:16px
        inactive → opacity:0.55
        hover → border:1px solid rgba(139,92,246,0.5), translateY(-1px)
        Contenu :
            - Icon + Nom : icon fontSize:26px, nom fontSize:14px fontWeight:800
            - Duration : fontSize:10px, color:var(--text-tertiary), "⏱ Nmin"
            - Toggle ON/OFF : padding:3px 9px, borderRadius:8, fontSize:9px, fontWeight:700
                ON → bg:rgba(16,185,129,0.12), color:#10b981
                OFF → bg:rgba(255,255,255,0.05), color:var(--text-quaternary)
            - Stats 3 cols (grid 1fr 1fr 1fr, gap:6px) :
                padding:6px 8px, borderRadius:8, bg:rgba(255,255,255,0.04)
                Label : fontSize:8px, textTransform:uppercase, color:var(--text-tertiary), marginBottom:2px
                Valeur : fontSize:14px fontWeight:800 (prix) / fontSize:13px fontWeight:800 color:var(--success) (CA)
            - Tags preview : flex, gap:4px, wrap
                badge : fontSize:9px, padding:2px 7px, borderRadius:10, bg:color+22, color, fontWeight:700
- Empty state : textAlign:center, color:var(--text-quaternary), padding:40px

SECTION 4 — TAB DÉTAILS PRODUIT (L26668-L26766) :
- Description : fontSize:12px, color:var(--text-tertiary), maxWidth:500
- Bouton "➕ Nouveau détail"
- Par catégorie :
    Label : fontSize:11px, fontWeight:700, textTransform:uppercase, letterSpacing:0.5px
    Tags : flex wrap, gap:8px
        Tag chip : padding:8px 14px, borderRadius:12, bg:color+18, border:1.5px solid color+44
            hover → border color+99, bg color+30
            Dot : 8x8 circle, bg:color
            Nom : fontSize:12px, fontWeight:700, color
            OFF label : fontSize:9px, color:var(--text-quaternary)
            Prix add : fontSize:9px, fontWeight:600, color:var(--text-tertiary), "+NcHF"

SECTION 5 — TAB PROVIDERS (L26768-L26771) :
- Rend <PrestatairesTab> composant (non détaillé ici, hors scope)

MODALES ACCESSIBLES :
- Produit modal (prodModal, L26634-L26665) :
    Overlay : position:fixed, inset:0, bg:rgba(0,0,0,0.6), zIndex:5000
    Panel : maxWidth:480px, width:92vw, bg:var(--bg-raised,#12121F), border:1px solid rgba(255,255,255,0.06),
        borderRadius:16px, boxShadow:0 24px 64px rgba(0,0,0,0.6)
    Header : padding:20px 24px, borderBottom:1px solid var(--border-subtle), fontSize:16px fontWeight:800
    Body : padding:20px 24px, gap:14px, champs Nom/Icône/Catégorie/Prix/Durée/Actif
    Footer : padding:16px 24px, borderTop:1px solid var(--border-subtle), flex justify-between
        Delete (.btn.btn-danger fontSize:11px), Annuler (.btn), Sauvegarder (.btn.btn-primary)
- Tag/Détail modal (tagModal, L26727-L26765) :
    Même structure modale, maxWidth:440px
    Champs : Nom, Couleur (color picker + input), Produit associé (select), Prix additionnel, Actif
    Preview : padding:8px 12px, borderRadius:10, bg:rgba(255,255,255,0.04)
        Badge preview : padding:4px 12px, borderRadius:10, bg:color+22, color, fontSize:12px fontWeight:700

RESPONSIVE :
- 1200px : .kpi-grid → repeat(2,1fr)
- Product grid : auto-fill minmax(270px,1fr) s'adapte automatiquement

COULEURS :
- #0e1420 (product card bg), rgba(139,92,246,0.2/0.5) (product borders)
- #12121F (modal bg-raised), rgba(0,0,0,0.6) (overlay)
- #8B5CF6 (tab active, default tag color)
- #6B7280 (tab inactive)
- rgba(16,185,129,0.12) / #10b981 (ON toggle)
- rgba(255,255,255,0.04/0.05/0.06) (subtle backgrounds)

TYPO :
- fontSize: 8px (stat labels), 9px (toggle, tag), 10px (duration), 11px (count, description),
  12px (tag nom, body), 14px (tab, nom produit, prix), 16px (modal title), 18px (cat icon), 26px (product icon)
- fontWeight: 600 (tabs, prix add), 700 (tag, toggle, labels uppercase), 800 (cat nom, product nom, modal title)


═══════════════════════════════════════════════════════════════════
PAGE : CHATTERS (Composant: ChattersTab — Ligne: 20723)
RÔLE : gerant
═══════════════════════════════════════════════════════════════════

LAYOUT :
- Conteneur : <div> padding:0 (desktop) / "0 12px" (mobile)
- Vertical : Notification bars > KPI row > Toolbar > Cards grid > Empty state > Modal fiche chatter

ALERTES (L21017-L21020) :
- Stack de NotificationBarAccordion pour chaque alerte
    severity: danger/warning/info selon type, icon "🔔"

SECTION 1 — KPI ROW (L21022-L21054) :
- 5 KPI cards (.kpi-row.cols-5 / mobile: .kpi-row.cols-2), marginBottom:14px
    Mobile : gridTemplateColumns:"1fr 1fr"
- Cards :
  1. "CA ÉQUIPE" (green) — valeur arrondie + currencySymbol, delta "↑ N TX validées", hint "Cliquer → graphe"
  2. "COMMISSIONS DUES" (amber) — valeur arrondie, delta conditionnel "⚠ à verser" / "✓ à jour", hint "Cliquer → paiements"
  3. "TX VALIDÉES" (indigo) — nombre, delta "↑ vs préc."
  4. "CONV. RATE MOY." (white) — pourcentage, delta conditionnel "✓ bon taux" / "↗ à améliorer"
  5. "CHATTERS ACTIFS" (green) — nombre, delta "N en shift"

SECTION 2 — TOOLBAR (L21056-L21066) :
- .toolbar, marginBottom:14px
- Recherche : .f-search — placeholder "🔍 Rechercher un chatter…"
- Séparateur : .filter-sep
- Pills : "Tous les rôles" (active), "En shift", "Off"
- Bouton droit : .btn.btn-primary "➕ Nouveau chatter"

SECTION 3 — CARDS CHATTERS GRID (L21068-L21184) :
- .chatter-grid-a (desktop) — grid repeat(4,1fr), gap:10px
- Mobile : grid 1fr, gap:10px, marginBottom:18px
- Chaque card .chatter-a :
    bg:var(--bg2) [#0b1020], border:1px solid var(--border-ds) [rgba(255,255,255,0.06)]
    borderRadius:var(--r) [14px], padding:14px, gap:10px, transition:all 0.18s, cursor:pointer
    hover → border-color:var(--border2-ds), translateY(-1px), boxShadow:0 6px 20px rgba(0,0,0,0.3)
    .inactive → opacity:0.65

    A. HEAD (.chatter-a-head) :
        - LEFT : avatar (38x38, circle, bg dynamique, initial fontWeight:800 fontSize:15px color:#fff)
            Nom (.chatter-a-name) : fontFamily:'DM Sans', fontSize:13px, fontWeight:700, color:var(--text-ds)
            Meta (.chatter-a-meta) : fontSize:10px, color:var(--muted-ds), "N modèle(s) · N TX"
        - RIGHT :
            Level badge (.chatter-a-role) : padding:2px 8px, borderRadius:8px, fontSize:9px, fontWeight:700,
                fontFamily:'Space Mono', bg:level.color+22, color:level.color, border:1px solid level.color+44
            Shift badge (.chatter-a-shift) : padding:2px 7px, borderRadius:8px, fontSize:9px, fontWeight:700,
                .on → bg:var(--gs) [rgba(16,185,129,0.12)], color:var(--green-c) [#10b981], "● SHIFT"
                .off → bg:rgba(255,255,255,0.04), color:var(--dim-ds), "○ OFF"

    B. STATS 3 COLS — Row 1 (.chatter-a-stats3, L21100-L21113) :
        grid 3 cols, gap:6px
        .chatter-a-stat : bg:var(--bg3), borderRadius:9px, padding:8px
        .chatter-a-stat-lbl : fontFamily:'DM Sans', fontSize:10px, fontWeight:600, color:rgba(255,255,255,0.5),
            textTransform:uppercase, letterSpacing:.04em, marginBottom:4px
        .chatter-a-stat-v : fontFamily:'DM Sans', fontSize:15px, fontWeight:700, color:var(--text-ds),
            letterSpacing:-0.2px
            .green → var(--green-c), .indigo → #a5b4fc, .amber → var(--amber)
        Stats :
            - "CA GÉNÉRÉ" (green) — montant + currencySymbol
            - "TAUX CONV." (green si >=50, sinon indigo) — pourcentage
            - "COMMISSION" (amber) — montant

    C. STATS 3 COLS — Row 2 (L21115-L21128) :
        - "NB TX" — nombre
        - "PENDING" (amber si >0) — nombre
        - "XP" (indigo) — nombre

    D. XP BAR (.chatter-a-xp, L21130-L21138) :
        .chatter-a-xp-top : flex justify-between, fontSize:9px
            Label : fontFamily:'Space Mono', color:var(--dim-ds), uppercase, letterSpacing:.06em
            Value : color:var(--muted-ds), "N / NEXT"
        Track : height:5px, borderRadius:3px, bg:rgba(255,255,255,0.06)
        Fill : bg:linear-gradient(90deg,#6366f1,#a78bfa), width:progress%, transition:width 0.3s

    E. TX LINE (.chatter-a-tx, L21140-L21150) :
        flex, gap:10px, fontSize:11px, fontWeight:600
        "✅ N" color:var(--green-c), "⏸ N" color:var(--amber), "❌ N" color:var(--red-c)
        Model chips : marginLeft:auto, flex wrap
            .chatter-a-model-chip : padding:2px 6px, borderRadius:6px, fontSize:9px, fontWeight:600,
                bg:var(--accent-s), color:#a5b4fc, border:1px solid rgba(99,102,241,0.15)

    F. SOLDE (L21152-L21172) :
        flex, gap:6px, flexWrap:wrap, paddingTop:6px, borderTop:1px solid var(--border-ds)
        Trop payé : bg:rgba(239,68,68,0.12), border:1px solid rgba(239,68,68,0.25), color:#ef4444,
            padding:3px 10px, borderRadius:6, fontSize:10px, fontWeight:700, fontFamily:'Syne'
        Dû : bg:rgba(245,158,11,0.12), border rgba(245,158,11,0.25), color:#f59e0b
        À jour : bg:rgba(16,185,129,0.1), border rgba(16,185,129,0.2), color:#10b981
        Pending paiements badge : bg:var(--rs), color:var(--red-c), border:1px solid var(--rb)

    G. ACTIONS (.chatter-a-actions, L21174-L21180) :
        flex, gap:4px, paddingTop:6px, borderTop:1px solid var(--border-ds)
        .chatter-a-act : padding:4px 7px, borderRadius:6px, border:1px solid var(--border-ds),
            bg:transparent, fontSize:10px, fontWeight:600, color:var(--muted-ds), fontFamily:'DM Sans'
            hover → bg:rgba(255,255,255,0.05), color:rgba(255,255,255,0.75)
            .primary → bg:var(--accent-s), border-color:var(--accent-b), color:#a5b4fc
        Boutons : "📊 STATS", "👸 MODÈLES", "💰 PAYER", "🚫 BLOQUÉS", "⚙️"

EMPTY STATE (L21186-L21192) :
- bg:var(--surface), border:1px solid var(--border), borderRadius:14px, padding:48px, textAlign:center
- Icon : fontSize:32px, "💬"
- Text : fontSize:14px, color:var(--text-secondary)

MODALE FICHE CHATTER (L21197-L21222+) :
- Overlay : position:fixed, inset:0, bg:rgba(0,0,0,0.65), zIndex:5000
    Mobile → alignItems:flex-end
- Panel : maxWidth:820px, width:95vw, maxHeight:90vh, overflowY:auto
    bg:var(--surface), border:1px solid var(--border), borderRadius:14px (mobile: 20px 20px 0 0)
    boxShadow:0 24px 64px rgba(0,0,0,0.6)
- Header sticky :
    padding:20px 24px, borderBottom:1px solid var(--border), bg:var(--surface), zIndex:2
    Avatar : 48x48 circle, fontSize:20px fontWeight:800 color:#fff
    Nom : fontSize:18px fontWeight:800
    Badges : LevelBadge + StreakBadge + commission% + shift status
        Shift : fontSize:9px fontWeight:700, padding:2px 8px, borderRadius:10
            ON → bg:rgba(16,185,129,0.12), color:#10B981, "● EN SHIFT"
            OFF → bg:rgba(255,255,255,0.05), color:var(--text-quaternary), "○ OFF"
- Tabs : 5 onglets — Performance 📊 / Modèles assignés 👤 / Paiements 💰 / Messages bloqués ⛔ / Paramètres ⚙️
    badge count sur Paiements

MODALES ACCESSIBLES :
- Modale chatter (modalChatter) : fiche multi-tabs
- Création chatter (createModal) : form name + handle + commission + modèles

RESPONSIVE :
- 1024px : .chatter-grid-a → repeat(2,1fr)
- 768px : kpi-row → 2 cols, grid 1fr, modale bottom sheet (borderRadius:20px 20px 0 0)
- Mobile : alignItems:flex-end dans overlay modale

COULEURS : (même palette que Dashboard + variables DS A)

TYPO : (même palette + 'Syne' pour soldes paiements)


---

Ce rapport couvre les 6 pages demandees avec les styles extraits directement du code source dans `/home/user/dadash-crm/index.html`. Les numeros de ligne sont indiques pour chaque section cle. Les styles proviennent a la fois des classes CSS (definies dans le `<style>` en tete de fichier, lignes ~200-4000) et des styles inline dans le JSX de chaque composant.


═══════════════════════════════════════════════════════════════════════════════
              PARTIE B — GÉRANT : MODÈLES & PRESTATAIRES
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════
PAGE : MODELES (Composant: ModelesTab — Ligne: 12981)
ROLE : gerant
═══════════════════════════════════════════════════════════════

LAYOUT : Colonne unique (div plein largeur). padding: 0 12px sur mobile, 0 sur desktop.

HEADER : Aucun header titre visible. La toolbar sert de header.

SECTION 1 — TOOLBAR (L13331-13339)
  - Classe "toolbar", marginBottom: 14
  - 3 filter-pills en ligne : "Toutes" (active), "Actives" (green-active), "Inactives"
  - Bouton "Nouvelle modele" (btn btn-primary) poussé à droite via marginLeft:auto
  - Icone: "👑" devant le label

SECTION 2 — KPI ROW (L13341-13373)
  - Classe "kpi-row cols-5" (desktop) / "kpi-row cols-2" (mobile, gridTemplateColumns: 1fr 1fr)
  - marginBottom: 14
  - 5 KPI Cards :
    1. "CA TOTAL" — classe "kpi-card green", valeur verte, delta "↑ {N} TX", hint "Cliquer → graphe"
    2. "TX VALIDEES" — classe "kpi-card indigo", valeur indigo, delta "↑ vs prec."
    3. "MODELES ACTIFS" — classe "kpi-card white", valeur blanche, delta dim "/ {N} total"
    4. "CONV. RATE" — classe "kpi-card green", valeur green, delta up/warn conditionnel
    5. "SPENDERS UNIQUES" — classe "kpi-card amber", valeur amber, delta dim "toutes modeles"
  - Chaque KPI a: kpi-card-label, kpi-card-value, kpi-card-delta, kpi-card-hint

SECTION 3 — GRILLE DE CARDS MODELES (L13375-13435)
  - Classe "model-grid-a" (desktop) / grid 1 col (mobile: gridTemplateColumns:1fr, gap:10)
  - marginBottom: 18
  - Chaque card = div.ma, onClick ouvre modale
    - div.ma-cover avec couleur : indigo/pink/amber/purple/teal selon nom
    - div.ma-body contenant:
      - HEAD (div.ma-head): avatar emoji + nom + handle + badge ONLINE/OFFLINE (classes ma-badge online/offline)
      - KPI 2x2 (div.ma-kpis): 4 cellules ma-kpi : "CA TOTAL" (green), "TX" (indigo), "SPENDERS", "CONV."
      - CHATTERS (div.ma-chatters): chips avatars colorés (6 couleurs en rotation: #6366f1, #ec4899, #f59e0b, #10b981), label "{N} chatters actifs"
      - ACTIONS (div.ma-actions, 4 boutons):
        - "📊 Stats" (ma-act primary)
        - "✏️ Editer" (ma-act)
        - "👥 Chatters" (ma-act)
        - "💰 Payer" (ma-act, borderColor: rgba(16,185,129,0.4), color: #10b981)
  - Derniere card = "+" Nouveau modele (ma-new, cover teal)
  - Etat vide (L13436): background var(--bg2), border 1px solid var(--border-ds), borderRadius:14, padding:48, emoji "👑", texte "Aucun modele"

MODALES :

  1. MODALE NOUVELLE MODELE (L13296-13329)
     - Fond: position:fixed inset:0, background rgba(0,0,0,0.65), z-index:9000
     - Contenu: maxWidth:420, width:92vw, background var(--surface), borderRadius:16, padding:28, boxShadow 0 24px 64px rgba(0,0,0,0.6)
     - Header: titre "👑 Nouvelle modele" (fontSize:17, fontWeight:800) + bouton fermeture "✕"
     - Input: padding 10px 14px, borderRadius:12, border 1px solid rgba(139,92,246,0.4), background var(--bg-card,#0D0D1A), fontSize:14
     - Label: fontSize:10, fontWeight:700, color var(--text-secondary), textTransform:uppercase, letterSpacing:0.8px
     - Hint: fontSize:11, color var(--text-tertiary)
     - Boutons: Annuler (transparent, border var(--border)) + Creer (background #7c3aed si actif, sinon rgba(255,255,255,0.06))
     - padding boutons: 9px 20px, borderRadius:10, fontSize:13

  2. MODALE MODELE DETAIL (L13441-13729) — 4 onglets
     - Fond: fixed inset:0, rgba(0,0,0,0.65), z-index:5000
     - Contenu: maxWidth:820, width:95vw, maxHeight:90vh, overflowY:auto, borderRadius:14 (desktop) / 20px 20px 0 0 (mobile), boxShadow 0 24px 64px rgba(0,0,0,0.6)
     - alignItems: flex-end (mobile) / center (desktop)
     - Header sticky: padding 20px 24px, avatar 48x48 rond avec couleur HSL, nom fontSize:18 fontWeight:800, badges chatters + CA, solde du (fontSize:20, fontWeight:900, warning/success)
     - Tab bar: gap:8, padding 12px 24px, borderBottom. Onglets: Performance/Checklist/Paiements/Parametres. Style actif: border #8b5cf6, background rgba(139,92,246,0.15), color #c4b5fd. Badge rouge pour pending.

     TAB PERFORMANCE (L13492-13549):
       - KPIs 3x2 grid (gap:10, mb:20): CA Genere, TX Validees, Spenders uniques, Panier Moyen, Taux Conv, Conv actives
       - Style KPI: padding 10px 12px, borderRadius:10, bg var(--surface2), border var(--border). Label: fontSize:10, fontWeight:600, uppercase. Valeur: fontSize:18, fontWeight:800
       - Mini graphe CA/semaine: surface2, borderRadius:12, padding 14px 16px. Barres flex height:80, gap:5. Barre derniere = var(--accent), autres = var(--success). fontSize labels: 8
       - Top spenders: liste flex column gap:6, items avec rang, @handle, montant vert

     TAB CHECKLIST (L13552-13606):
       - Barre progression: height:7, borderRadius:4, couleur var(--success)/warning/accent selon %
       - Items: padding 12px 16px, borderRadius:12, bg checked=var(--success-muted), border checked=var(--success). Checkbox 22x22 borderRadius:6. Texte line-through si checked. Transition all 0.2s

     TAB PAIEMENTS (L13609-13709):
       - 3 KPIs grid 3 cols (CA Genere, Commission brute, Solde du)
       - Sous-onglets: En attente / Creer / Historique (pills borderRadius:8)
       - Formulaire creation: grid 2 cols gap:10, select/input borderRadius:9, border var(--border), bg var(--surface2)
       - Bouton envoi: padding:10px, borderRadius:10, bg var(--accent)

     TAB PARAMETRES (L13712-13724):
       - Input nom + bouton sauvegarder (bg var(--accent))

  3. MODALE EXPENSE FORM (L13731-13778) — ModalShell
     - maxWidth:440, borderRadius:14, padding:24
     - Grid 2 cols gap:12, inputs borderRadius:9, border var(--border), bg var(--surface2), fontSize:13

  4. EditTxModal (L13780) — composant externe
  5. ConfirmModal (L13781) — refus transaction

HOVER/INTERACTIONS :
  - Card modele: cardStyle avec border accent on hover, boxShadow 0 4px 20px rgba(139,92,246,0.15), transition all 0.2s

RESPONSIVE :
  - _isMobile: padding 0 12px, KPI cols-2, cards grid 1fr, modale alignItems flex-end + borderRadius 20px 20px 0 0

COULEURS :
  - Accent: #8b5cf6 / var(--accent) / #7c3aed
  - Success: var(--success) / #10b981
  - Warning: var(--warning) / #f59e0b
  - Danger: var(--danger) / #ef4444
  - Surface: var(--surface), var(--surface2)
  - Border: var(--border)
  - Muted: var(--muted)

TYPO :
  - Font-family: 'DM Sans', sans-serif (boutons)
  - Titres: fontWeight:800
  - Labels: fontSize:10, fontWeight:600, uppercase, letterSpacing:0.5
  - Valeurs: fontSize:18, fontWeight:800


═══════════════════════════════════════════════════════════════
PAGE : PRESTATAIRES (Composant: PrestatairesTab — Ligne: 25435)
ROLE : gerant
═══════════════════════════════════════════════════════════════

LAYOUT : Colonne unique (div plein largeur). padding: 0 12px sur mobile.

HEADER (L25697-25701) :
  - Titre: "🏦 Prestataires" fontSize:15, fontWeight:800, color var(--text)
  - Sous-titre: fontSize:10, color var(--muted2), marginTop:2

SECTION 1 — ALERTS (L25703-25706)
  - NotificationBarAccordion pour chaque alerte
  - Severity "danger" (rouge) ou "warning" (orange)
  - Clicable (scroll vers provider)

SECTION 2 — TOOLBAR (L25708-25719)
  - Classe "toolbar", marginBottom:14
  - 2 onglets via "period-filters":
    - "📊 Statistiques" (filter-pill, active)
    - "💳 Paiements" (filter-pill, badge rouge pending count)
  - Badge pending: bg var(--red-c), color #fff, borderRadius:8, padding 1px 6px, fontSize:9, fontWeight:800

SUB-TAB STATS :

  SECTION 3 — GLOBAL FILTER BAR (L25722-25723)
    - GlobalFilterBar avec date range picker + filtre modele

  SECTION 4 — KPI ROW (L25726-25759)
    - Classe "kpi-row cols-4" (desktop) / "kpi-row cols-2" (mobile)
    - marginBottom:14
    - 4 KPI Cards:
      1. "CA TOTAL COLLECTE" — green
      2. "TX TOTALES" — indigo
      3. "AVG TICKET" — amber
      4. "VALID. RATE" — green

  SECTION 5 — PROVIDER CARDS (L25761-25800)
    - Classe "provider-grid-a" (desktop) / grid 1fr (mobile)
    - marginBottom:18
    - Chaque card = div.pa:
      - HEAD (div.pa-head): icone couleur (green/teal/amber/indigo), nom, type, badge ACTIF/INACTIF
      - KPI 2x2 (div.pa-kpis): CA TOTAL (green), TX (indigo), AVG TICKET (amber), VALID. RATE
      - ACTIONS (div.pa-actions): Stats, Editer, TX
    - Etat vide (L25801): emoji "🏦", texte "Aucun prestataire"

  SECTION 6 — TABLEAU COMPARATIF (L25803-25856)
    - Surface container: bg var(--surface), border var(--border), borderRadius:14, overflow:hidden
    - Header: padding 14px 20px, fontSize:13, fontWeight:700
    - Table classe "table" fontSize:12, avec SortTh triable
    - Colonnes: Prestataire (avatar 28x28 + nom), CA Traite, Reverse, Solde Du, Taux Valid. (badge couleur), Delai Moy., Modeles (pills)
    - Badge validation: padding 2px 8px, borderRadius:12, bg success/warning/danger-muted selon seuil (80/50)
    - Pills modele: padding 1px 6px, borderRadius:6, bg var(--accent-subtle), color var(--accent), fontSize:10
    - PaginationControls en bas

SUB-TAB PAIEMENTS (L26285-26437) :

  - KPI ROW "kpi-row cols-4": EN ATTENTE (amber), RECU CE MOIS (green), PROVIDERS EN RETARD (red/green), TOTAL VALIDE (indigo)
  - Tableau "Solde par prestataire" (L26332-26360): 5 cols (Prestataire, CA Valide, Paye, En attente, Solde du)
    - Solde du: fontWeight:800, color danger si >100, warning si >0, success sinon. Emoji ⚠️ si >100
  - Pending payouts (L26362-26396): card padding:16, borderBottom, nom+montant fontSize:14 fontWeight:700, boutons Valider (btn-success) et Refuser (btn-danger)
  - Historique complet (L26398-26435): table 9 cols, fond #0e1420, borderRadius:16, status pills (padding 3px 10px, borderRadius:12)

MODALES :

  1. DETAIL PROVIDER (L25859-26211) — 4 onglets
     - Fond: var(--modal-backdrop), z-index:5000
     - Contenu: width:900, maxWidth:95vw, borderRadius:14, boxShadow var(--shadow-lg)
     - Header: avatar 48x48 + nom h2 fontSize:18 fontWeight:800 + close button 32x32 borderRadius:9
     - Tabs: Transactions/Reversements/Performance/Comptes (pills padding 7px 13px, borderRadius:9, actif: border #8b5cf6, bg rgba(139,92,246,0.15))
     
     TAB Transactions: 3 KPIs 3-cols, filtres select, table fontSize:11, StatusPill, PaginationControls
     TAB Reversements: 3 KPIs, pending payouts (boutons valider/refuser), historique table
     TAB Performance: 4 KPIs 4-cols, BarChart Recharts (6 mois CA), LineChart (delai moyen), breakdown par modele
     TAB Comptes: cards methodes paiement (36x36 icon + label + detail), bouton Ajouter, items inactifs en dashed opacity:0.5

  2. PPM Edit/Add Modal (L26213-26279) — z-index:6000
     - maxWidth:440, borderRadius:14, padding:24
     - Grid gap:14, preview card en bas

  3. PPM Delete Confirm (L26281-26282) — ConfirmModal

HOVER/INTERACTIONS :
  - Cards: cardStyle identique au ModelesTab (border accent on hover, shadow)
  - Table rows: cursor:pointer

RESPONSIVE :
  - KPIs: cols-2 sur mobile
  - Cards: 1fr grid mobile

COULEURS :
  - Identiques au systeme global (accent, success, warning, danger)
  - Avatar: HSL genere par hash ID
  - Recharts: fill #8B5CF6, stroke var(--warning)

TYPO :
  - Titres: fontSize:15 fontWeight:800
  - Labels KPI: fontSize:10, fontWeight:600, uppercase, letterSpacing:0.5
  - Valeurs KPI: fontSize:18, fontWeight:800


═══════════════════════════════════════════════════════════════
PAGE : MESSAGERIE CONVERSATIONS GERANT (Composant: GerantMessagerieTab — Ligne: 30464)
ROLE : gerant
═══════════════════════════════════════════════════════════════

LAYOUT : Grid 3 colonnes (30% | 45% | 25%). minHeight: calc(100vh - 200px).
  - gridTemplateColumns: "30% 45% 25%" (desktop) / "1fr" (mobile)
  - Container: border 1px solid var(--border-subtle), borderRadius:16, overflow:hidden, boxShadow var(--shadow-md)

HEADER (L30680-30684) :
  - h2: fontSize:24, fontWeight:800, fontFamily:'Inter', color var(--text-primary), emoji "💬"
  - p: fontSize:13, color var(--text-secondary), margin 6px 0 0

COLONNE GAUCHE — LISTE CONVERSATIONS (L30700-30753)
  - Background: var(--card-bg), borderRight: 1px solid var(--border-subtle)
  - FILTRES STATUS (L30703-30707): padding 14px 16px, gap:8, flex wrap
    - 4 boutons: Toutes / 🔴 Escalades / 🟢 Bot / 🔵 Humain
    - Style actif: border var(--accent), bg var(--accent-muted), color var(--accent)
    - Style inactif: border var(--border-subtle), bg var(--bg-overlay), color var(--text-tertiary)
    - padding 8px 14px, borderRadius:10, fontSize:12, fontWeight:600, transition all 0.2s
  - FILTRES MODELE + SPENDER (L30709-30725): padding 12px 16px, gap:8px
    - Label: fontSize:11px, color:#8b92a7, fontWeight:600, uppercase
    - Select: padding 8px 12px, bg:#0f1117, border:1px solid #2d3250, borderRadius:6px, color:white, fontSize:13px
    - Modele: "Toutes les modeles" + liste dynamique
    - Spender: Tous / Payants (>= 1 CHF) / Gratuits (0 CHF)
  - COMPTEUR (L30727-30729): padding 8px 16px, fontSize:11px, color:#6b7280
  - LISTE CONVERSATIONS (L30731-30752): flex:1, overflowY:auto
    - Chaque item: padding 16px 18px, borderBottom var(--border-subtle), cursor:pointer
    - Survol selectionne: bg var(--accent-subtle)
    - Avatar SpenderAvatar 32px rond + @handle (fontSize:13, fontWeight:700) + drapeau langue
    - Badge status: padding 2px 8px, borderRadius:8, fontSize:9, fontWeight:700
      - Escalade: bg rgba(248,113,113,0.15), color var(--danger)
      - Bot: bg rgba(52,211,153,0.15), color var(--success)
      - Humain: bg rgba(96,165,250,0.15), color var(--blue-accent,#60A5FA)
    - Preview: fontSize:11, color var(--text-tertiary), ellipsis, paddingLeft:38
    - Timestamp: fontSize:10, color var(--text-quaternary), paddingLeft:38
    - Etat vide: padding:30, fontSize:13, color var(--text-quaternary)

COLONNE CENTRE — ZONE CHAT (L30755-30831)
  - Background: var(--bg-base), borderRight: 1px solid var(--border-subtle)
  - ETAT VIDE: emoji "💬", "Selectionne une conversation" fontSize:14
  - CHAT HEADER (L30764-30795): padding 14px 18px, borderBottom, bg var(--bg-overlay)
    - @handle fontSize:14 fontWeight:700 + ScammerFlagBtn + badge status + escalation_reason (italique danger) + MultiModelBadge
    - Boutons: "🤖 Rendre au bot" (btn btn-small) + "👤 Assigner" (btn btn-small btn-primary)
    - Dropdown assignation: bg var(--bg-raised), border var(--border-default), borderRadius:12, padding:6, z-index:100, minWidth:180, shadow-lg
  - MESSAGES (L30797-30824): flex:1, overflowY:auto, padding:16, gap:10
    - Date separators
    - Bulles:
      - Spender (entrant): alignSelf flex-start, maxWidth 75%, borderRadius 4px 14px 14px 14px, bg rgba(255,255,255,0.06)
      - Outgoing: alignSelf flex-end, borderRadius 14px 4px 14px 14px
        - Bot: bg #1E3A5F
        - Chatter/Human/Gerant: bg #7C3AED ou #3B82F6
      - Texte: fontSize:13, color:#fff, lineHeight:1.5, padding 10px 14px
    - Badge sender: fontSize:8, padding 1px 5px, borderRadius:4, bg rgba(255,255,255,0.1), fontWeight:700
    - Horodatage: fontSize:9, color var(--text-quaternary)
  - INPUT (L30826-30829): padding:16, borderTop, bg var(--bg-overlay)
    - Textarea: classe "filter-select", flex:1, resize:none, minHeight:40, padding 10px 12px
    - Bouton "Envoyer" (btn btn-primary)

COLONNE DROITE — FICHE SPENDER (L30833-30917)
  - Background: var(--card-bg), padding:24, overflowY:auto
  - ETAT VIDE: padding:20, fontSize:12
  - SPENDER INCONNU: emoji 👤, @handle fontSize:13 fontWeight:700
  - FICHE ENRICHIE:
    - Avatar SpenderAvatar 56px + nom fontSize:15 fontWeight:800 + drapeau langue
    - Badges: padding 3px 10px, borderRadius:12, fontSize:9, fontWeight:700
    - VIP Score bar: height:6, borderRadius:3, couleur success/warning/danger selon score
    - KPI grid 2x2 (gap:8): Total (success fontSize:16), AOV, Frequence, Derniere TX
      - Style: padding 8px 10px, borderRadius:10, bg rgba(255,255,255,0.04)
      - Label: fontSize:9, fontWeight:600, uppercase, letterSpacing:0.3
    - Produits favoris: pills bg rgba(139,92,246,0.15), color var(--accent), fontSize:10
    - Bouton "Voir fiche complete": btn btn-primary, width:100%, borderRadius:10

ETATS :
  - Loading (L30686-30691): spinner 32x32 + texte "Chargement des conversations..."
  - Error (L30693-30695): EmptyState avec icon "🚨" et bouton retry
  - Vide: EmptyState adapte

RESPONSIVE :
  - Mobile: gridTemplateColumns 1fr (1 seule colonne), minHeight auto
  - Panel droit disparait implicitement (pas de media query visible mais 1fr layout)


═══════════════════════════════════════════════════════════════
PAGE : GRID PREMIUM (Composant: GridPremiumSubpage — Ligne: 33065)
ROLE : gerant
═══════════════════════════════════════════════════════════════

LAYOUT : Fullscreen flex column, height calc(100vh - 50px), background #0a0b0f.
  - Header fixe + Body flex (70% grid | 30% input panel)

HEADER (L33646-33684) :
  - padding 10px 20px, bg #1a1b26, borderBottom 2px solid rgba(255,255,255,0.06)
  - flex space-between, wrap
  - GAUCHE:
    - Etoile "⭐" (color #f59e0b, fontSize:13, fontWeight:800)
    - Label "MODELE" (color #6b7280, fontSize:11, fontWeight:700)
    - Boutons filtre modele: "🎯 Tous", "💜 Carla", "🩷 Sophie", "💛 Bella", "✨ Nadia", "🤍 Lea"
      - Actif: bg #6366f1, color #fff, border #6366f1
      - Inactif: bg rgba(255,255,255,0.04), color #9ca3af, border rgba(255,255,255,0.08)
      - padding 6px 12px, borderRadius:8, fontSize:11, fontWeight:700
    - Badge unread: bg rgba(239,68,68,0.15) ou rgba(255,255,255,0.04), color #ef4444 ou #6b7280, borderRadius:8, fontSize:10, fontWeight:700
  - DROITE:
    - Label "LAYOUT" + boutons 2x2/2x3/3x3/3x4 (actif: bg #6366f1)
    - Separateur vertical (1px, height:20, rgba(255,255,255,0.08))
    - "🔄 Load Unread" : bg linear-gradient(135deg,#10b981,#059669), borderRadius:8, fontSize:11, fontWeight:700
    - "✨ Load Smart" : bg linear-gradient(135deg,#8b5cf6,#6366f1), hover shadow 0 4px 12px rgba(139,92,246,0.4) + translateY(-1px)

BODY (L33686-33877) :
  - flex row, gap:10, padding:10

  GRID SLOTS (L33689-33792) — flex 0 0 68%
    - CSS grid: repeat(cols, 1fr), gridAutoRows min-content, gap:8
    - Hauteur messages adaptative selon layout: 2x2=400, 2x3=350, 3x3=300, 3x4=250
    - CELLULE OCCUPEE (L33691-33779):
      - bg: linear-gradient(135deg,#1e1f2e 0%,#1a1b26 100%) / scammer: rgba(239,68,68,0.05)
      - borderRadius:10, minHeight:140
      - Border selon contexte:
        - Active: 2px solid #ef4444, boxShadow 0 0 16px rgba(239,68,68,0.4)
        - Shark (>=500): 2px solid rgba(16,185,129,0.4)
        - Medium (>=50): 2px solid rgba(245,158,11,0.3)
        - Default: 2px solid rgba(255,255,255,0.05)
      - Barre active: height:3, bg linear-gradient(90deg,#6366f1,#818cf8)
      - SLOT HEADER: padding 8px 10px, bg linear-gradient(90deg,rgba(99,102,241,0.08),transparent)
        - Emoji modele 16px + nom (fontWeight:700, fontSize:12, #fff) + tier label (fontSize:9, #6b7280, uppercase)
        - Boutons droite: Galerie (border rgba(99,102,241,0.4)), Library (bg gradient amber), TX (bg gradient green), LTV badge (gradient couleur), unread badge (#ef4444, animation gridPulse 2s infinite)
      - MESSAGES ZONE: height variable, padding 6px 8px, overflowY auto, fontSize:11
        - Sentinel IntersectionObserver (height:1) pour infinite scroll
        - Loading more: "⏳ Ancien..." (#6366f1, fontSize:9)
        - Debut: "— debut —" (#374151, fontSize:8)
        - Messages via GpSlotMsgList component
      - Close button: position absolute top:5 right:5, bg rgba(239,68,68,0.85), 22x22, opacity:0 (apparait au hover)
      - Scrollbar custom: width:4px, thumb rgba(99,102,241,0.5)
    - CELLULE VIDE (L33781-33791):
      - border 2px dashed rgba(99,102,241,0.2), minHeight:140
      - "+" fontSize:28, opacity:0.4, "Ajouter conv" fontSize:10
      - Hover: borderColor rgba(99,102,241,0.5), bg avec touche rgba(99,102,241,0.05)

  INPUT PANEL (L33794-33876) — flex 0 0 30%
    - bg linear-gradient(135deg,#1e1f2e,#1a1b26), borderRadius:12, border 2px solid rgba(255,255,255,0.06)
    - ETAT VIDE: emoji 💬 fontSize:40 opacity:0.25, "Selectionne une conversation" fontSize:13
    - ETAT ACTIF:
      - Conv header: padding 14px 16px, bg gradient indigo subtil
        - Emoji 22px + nom fontWeight:800 fontSize:14 + MultiModelBadge
        - Tier + LTV
        - Bouton "🔍 Fullscreen" (bg rgba(99,102,241,0.15))
      - Scripts toolbar: padding 8px 12px, bouton "📝 Scripts" + 4 emojis ronds (30x30)
      - Scripts panel: maxHeight:220, overflowY auto. Categories > items cliquables. Label #818cf8, preview #6b7280
      - Textarea: bg rgba(0,0,0,0.3), border rgba(255,255,255,0.06), borderRadius:8, fontSize:13, minHeight:80, fontFamily 'Inter'
      - Bouton send: width:100%, padding:12, borderRadius:10, bg gradient #6366f1→#818cf8, fontWeight:800, fontSize:13

MODALES :
  - Lightbox (L33880-33889): fixed, bg rgba(0,0,0,0.92), z-index:99999, image maxWidth 90vw, borderRadius:8
  - Galerie medias (L33891-33953): bg #1a1b23, maxWidth:900, borderRadius:12, filtres (all/photos/videos/recent), grid auto-fill minmax(140px,1fr), MediaCard component
  - Library Modal (L33974-34018): LibraryModal component
  - TX Modal (L34020-34107): bg var(--bg-modal,#1a1b23), borderRadius:16, width:520, form 2-cols, currency toggle EUR/CHF, bouton creation gradient vert
  - Add Conv Modal (L34109-34150): bg #1a1b23, width min(90vw,700px), search input, liste convs avec emoji+nom+tier+LTV+unread badge

ANIMATIONS :
  - @keyframes gridPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  - Scrollbar: .grid-slot-scroller width:5px, thumb:#6366f1

COULEURS :
  - Background principal: #0a0b0f
  - Header: #1a1b26
  - Cell: #1e1f2e → #1a1b26
  - Accent: #6366f1 / #818cf8 / #a5b4fc
  - Success: #10b981 / #059669
  - Danger: #ef4444
  - Warning: #f59e0b / #d97706
  - Violet: #8b5cf6 / #7c3aed
  - Texte: #fff / #d1d5db / #9ca3af / #6b7280 / #4b5563 / #374151


═══════════════════════════════════════════════════════════════
PAGE : TLG PRO (Composant: TlgProSubpage — Ligne: 34174)
ROLE : gerant
═══════════════════════════════════════════════════════════════

LAYOUT : Fullscreen flex column, height calc(100vh - 50px), background #0a0b0f.
  - Header + optional custom filter bar + Grid (100%, chaque slot avec input integre)

HEADER (L35058-35178) :
  - Identique Grid Premium en structure: padding 10px 20px, bg #1a1b26, borderBottom 2px solid rgba(255,255,255,0.06)
  - GAUCHE:
    - "⚡" (#818cf8, fontSize:14, fontWeight:800) + "TLG PRO" (#818cf8, fontSize:13, fontWeight:800)
    - TABS PAR MODELE: pour chaque modele, boutons onglets avec couleur specifique:
      - all: #6366f1, carla: #a78bfa, sophie: #f472b6, bella: #fb923c, nadia: #9ca3af, lea: #e2e8f0
      - Multi-tabs: jusqu'a 3 par modele, bouton "+" pour ajouter (border dashed)
      - Bouton close sur hover (14x14 rond #ef4444)
    - CUSTOM TABS: separator vertical, onglets renommables (double-clic), bouton "+" custom max 5
      - Style actif: bg linear-gradient(135deg,#6366f1,#8b5cf6)
    - Badge unread identique GP
  - DROITE:
    - Layout buttons + Load Unread (vert) + Load Smart (bg gradient #7c3aed→#4f46e5) + "✕ Fermer Tout" (bg rgba(239,68,68,0.15), color #ef4444, border rgba(239,68,68,0.3))

FILTRE CUSTOM (L35180-35207) — affiche seulement sur tab custom:
  - padding 6px 16px, bg rgba(99,102,241,0.06), borderBottom rgba(99,102,241,0.15)
  - Boutons toggle par modele (Carla/Sophie/Bella/Nadia), actif = gradient #6366f1→#8b5cf6

GRID (L35209-35316) — 100% width
  - CSS grid: repeat(cols, 1fr), repeat(rows, 1fr), gap:8, padding:8, overflow:hidden
  - Hauteur messages: 2x2=400, 2x3=350, 3x3=300, 3x4=250
  - CELLULE = identique GP en structure MAIS avec input integre dans chaque slot:
    - Header: emoji + nom + ScammerBadge + model badge (fontSize:8, uppercase) + LTV badge + tier
      - Boutons: ScammerFlagBtn, Galerie, +TX, info (rond 20x20 #6366f1)
      - Double-clic header = fullscreen (onSelectConv)
    - Messages: flex:1 minHeight:0, scroll auto, meme rendu que GP
    - EMOJI BAR (L35319-35331): 10 emojis (❤️😘🔥💋😈💕😍🥰😏👅), boutons 28x28, borderRadius:6, hover scale(1.15)
    - SUGGESTIONS POPUP (L35333-35354): maxHeight:200, bg rgba(15,15,30,0.95)
      - Items cliquables: padding 6px 8px, bg rgba(0,0,0,0.3), borderRadius:6
      - Bouton regenerer
    - INPUT + SEND (inline dans chaque slot — code apres L35354):
      - Textarea + boutons send/suggest/media lib dans chaque cellule

MODALES :
  - Galerie identique GP (MediaCard grid)
  - LibraryModal identique
  - TX Modal identique (si _standalone)
  - Lightbox identique
  - ScammerConfirmModal identique

DIFFERENCES VS GRID PREMIUM :
  1. Input dans CHAQUE slot (pas de panel lateral)
  2. Systeme d'onglets multi-modele avec persistance localStorage
  3. Custom tabs renommables avec filtre multi-modele
  4. Bouton "Fermer Tout" en rouge
  5. Smart Load avec scoring avance (6 criteres, timeout 72h)
  6. Suggestions AI inline par slot
  7. Pas de panel input a droite — tout est self-contained dans la cellule

COULEURS : Identiques a Grid Premium
TYPO : Identique


═══════════════════════════════════════════════════════════════
PAGE : TINDADA (Composant: TindadaInboxZeroPage — Ligne: 35716)
ROLE : gerant
═══════════════════════════════════════════════════════════════

LAYOUT : Fullscreen flex column, height:100vh. 
  - Background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0a0a1a 100%)
  - Font-family: 'Inter', system-ui, sans-serif
  - Structure: Header → Progress bar → Stats bar → Main (grid 1fr 380px)

HEADER (L36266-36282, CSS L4438-4449) :
  - padding 16px 24px, bg rgba(15,15,35,0.9), backdrop-filter blur(20px), borderBottom rgba(99,102,241,0.15)
  - sticky top:0, z-index:100
  - LOGO: icone 40x40 (bg gradient #ef4444→#f97316, borderRadius:12, shadow 0 4px 15px rgba(239,68,68,0.3)) + texte "TINDADA" (fontSize:20, fontWeight:800, gradient text #ef4444→#f97316) + "Inbox Zero" (fontSize:11, #64748b)
  - COUNTER BADGE: bg rgba(99,102,241,0.15), border rgba(99,102,241,0.3), color #818cf8, padding 6px 16px, borderRadius:20, fontSize:13, fontWeight:700
  - REFRESH INDICATOR: point vert anime + "Auto-refresh 10s"

PROGRESS BAR (L36284-36287, CSS L4483-4493) :
  - height:3px, bg rgba(255,255,255,0.05)
  - Fill: bg linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899), borderRadius:3, transition width 0.5s ease

STATS BAR (L36289-36307, CSS L4494-4512) :
  - flex row, gap:20, padding 10px 24px, bg rgba(15,15,35,0.6), borderBottom rgba(255,255,255,0.05), fontSize:12
  - 5 stats: "✅ Traites", "⏭️ Skippes", "🔥 Streak", "⏱️ Moy", "📊 Total"
  - Label: color #94a3b8, valeur: color #e2e8f0 fontWeight:700

MAIN CONTENT (CSS L4513-4528) :
  - Grid: 1fr 380px (desktop) / 1fr (mobile, side panel hidden)

  ETAT VIDE (L36310-36321): "✅ Inbox Zero atteint ! 🎉" + sous-texte + stats finales

  CARD AREA (L36324-36490, CSS L4529-4536) :
    - flex column, padding:24, overflow:hidden

    CARD (CSS L4537-4558) :
      - bg rgba(15,15,35,0.8), border rgba(99,102,241,0.15), borderRadius:20
      - flex column, flex:1
      - ANIMATION SWIPE:
        - swipe-left: translateX(-120%) rotate(-15deg) opacity:0
        - swipe-right: translateX(120%) rotate(15deg) opacity:0
        - Transition: transform 0.4s ease, opacity 0.4s ease

    CARD HEADER (L36328-36383, CSS L4559-4601) :
      - padding 16px 20px, bg gradient rgba(99,102,241,0.08)→rgba(139,92,246,0.05)
      - Avatar: 44x44 rond, bg gradient LTV-color, fontSize:18, fontWeight:800
      - Nom: fontSize:16, fontWeight:700, color #f1f5f9
      - Meta badges: padding 2px 8px, borderRadius:6, bg rgba(99,102,241,0.1), color #a5b4fc, fontWeight:600, fontSize:11
        - LTV badge: bg rgba(16,185,129,0.1) color #34d399
        - Unread: bg rgba(239,68,68,0.1) color #f87171
      - Boutons: Galerie, Library (gradient amber), +TX (gradient vert)

    MESSAGES AREA (CSS L4603-4613) :
      - flex:1, overflowY:auto, padding 16px 20px, gap:8
      - scrollbar: thin, rgba(99,102,241,0.3)

    BULLES MESSAGES (CSS L4614-4639) :
      - maxWidth:80%, padding 10px 14px, borderRadius:16, fontSize:13, lineHeight:1.5
      - Received: alignSelf flex-start, bg rgba(255,255,255,0.08), color #e2e8f0, borderBottomLeftRadius:4px
      - Sent: alignSelf flex-end, bg gradient #6366f1→#7c3aed, color white, borderBottomRightRadius:4px
      - Timestamp: fontSize:10, opacity:0.5, marginTop:4
      - Medias inline: images 80x60 objectFit:cover borderRadius:6, videos width:80

    EMOJIS QUICK (L36447-36456) :
      - 6 emojis (❤️😘🔥💋😈💕), boutons 36x36 ronds, border rgba(255,255,255,0.1)
      - Hover: bg rgba(255,255,255,0.1), scale(1.15)

    INPUT AREA (CSS L4640-4665) :
      - padding 12px 16px, bg rgba(15,15,35,0.9), borderTop rgba(99,102,241,0.1)
      - Input: bg rgba(255,255,255,0.06), border rgba(99,102,241,0.2), borderRadius:12, padding 10px 14px, fontSize:13
      - Focus: borderColor rgba(99,102,241,0.5)
      - Bouton "📤 Envoyer & Next" (classe tindada-btn-send)

    ACTION BUTTONS (CSS L4666-4673) :
      - flex center, gap:8, padding 12px 16px, bg rgba(15,15,35,0.6)
      - "⏭️ Skip" (tindada-btn-skip) + "✅ Marquer lu & Next" (tindada-btn-mark)
      - padding 10px 20px, borderRadius:12, fontSize:13, fontWeight:700

  SIDE PANEL (L36492-36530, hidden <1024px) :
    - REPONSES RAPIDES: 7 pre-sets (tindada-quick-reply)
    - INFOS CONVERSATION: Chat ID, Username, Modele, LTV, Tier, Langue, Non lus, Dernier msg
      - fontSize:12, color #94a3b8, lineHeight:1.8
    - RACCOURCIS CLAVIER: Enter = Envoyer & Next. kbd bg rgba(255,255,255,0.08), borderRadius:4

MODALES :
  - TOAST (L36252-36264): fixed top:100 right:2rem, bg gradient #6366f1→#8b5cf6, borderRadius:15, shadow 0 8px 20px, animation tindadaSlideInRight 0.3s
  - Galerie medias (L36534-36596): identique GP (bg #1a1b23, maxWidth:900, grid auto-fill 140px)
  - LibraryModal (L36598-36660)
  - TX Modal (similaire aux autres pages)
  - Lightbox (L36 — tindadaLightbox)
  - ScammerConfirmModal

ETATS :
  - Loading (L36233-36247): spinner 32x32 + "Chargement des conversations non lues..."
  - Empty/Inbox Zero (L36310-36321): emoji ✅, titre "Inbox Zero atteint!", sous-titre, stats
  - Auto-refresh: interval 30s (conversations) + 3s (messages conv ouverte)

RESPONSIVE (CSS L4521-4528) :
  - @media max-width 1024px: grid-template-columns 1fr, side-panel display:none
  - Animation entree: @keyframes tindadaSlideInRight

COULEURS :
  - Background: gradient #0a0a1a → #1a1a3e → #0a0a1a
  - Logo: gradient #ef4444 → #f97316
  - Accent: #6366f1, #8b5cf6, #818cf8, #a5b4fc
  - Progress: gradient #6366f1 → #8b5cf6 → #ec4899
  - Received: rgba(255,255,255,0.08)
  - Sent: gradient #6366f1 → #7c3aed
  - Stats text: #94a3b8 / #e2e8f0 / #64748b
  - Success (LTV): #34d399 / #10b981
  - Danger: #f87171 / #ef4444

TYPO :
  - Font-family: 'Inter', system-ui, sans-serif
  - Logo: fontSize:20, fontWeight:800
  - Nom spender: fontSize:16, fontWeight:700
  - Messages: fontSize:13, lineHeight:1.5
  - Stats: fontSize:12
  - Meta badges: fontSize:11, fontWeight:600


---

Voila le rapport complet des 6 pages auditees. Chaque description visuelle est extraite directement du code source avec les styles inline reels, les classes CSS, et les numeros de ligne exacts. Les points cles a retenir :

- **ModelesTab** et **PrestatairesTab** partagent le meme design system (KPI cards via classes CSS, card design A, modales avec onglets pilules, styles metricSt/metricLbl/metricVal identiques).
- **GerantMessagerieTab** est un layout 3 colonnes classique de messagerie (liste | chat | info spender), avec des bulles de couleurs differentes par type de sender.
- **Grid Premium** et **TLG Pro** sont tres similaires visuellement (meme palette dark #0a0b0f/#1a1b26, memes cellules avec border conditionnelle LTV, memes boutons de header). La difference majeure est que TLG Pro integre l'input dans chaque cellule et supporte un systeme d'onglets multi-modele persistant.
- **TINDADA** a un design distinct "Tinder-like" avec un fond gradient sombre, une carte unique swipeable (animations translateX/rotate), une barre de progression et des stats de session gamifiees.


═══════════════════════════════════════════════════════════════════════════════
              PARTIE C — GÉRANT : DADACAST, ZOO & AUTRES
═══════════════════════════════════════════════════════════════════════════════

I now have enough data to produce the full audit. Here is the complete visual description for all 6 pages.

---


=======================================================================================================
PAGE : DADACAST (Composant: DadacastSubpage — Ligne: 37896)
ROLE : gerant
=======================================================================================================

LAYOUT :
  Container: padding "24px 32px", maxWidth 1300, margin "0 auto", overflowY auto.
  Deux onglets en haut : "Broadcaster" et "Analytics".
  Onglet "broadcast" : grille 2 colonnes (2fr / 1fr), gap 20, marginBottom 24.
    - Colonne gauche : flux vertical (flex column, gap 16) avec 5 "cards" empilees (etapes 1-4 + espacement).
    - Colonne droite : sticky top 20, panneau "Apercu" + boutons envoi/programmation.
  Onglet "analytics" : delegu au sous-composant AnalyticsDadacast (L37606).

HEADER (L38345-38388) :
  Flex row, justifyContent space-between, flexWrap wrap, gap 10, marginBottom 16.
  - Gauche : h1 "Dadacast" fontSize 26, fontWeight 800, gradient text "linear-gradient(135deg,#6366f1,#8b5cf6)" avec WebkitBackgroundClip/TextFillColor transparent. Sous-titre p fontSize 13, color "var(--text-tertiary)".
  - Droite : 2 selects (date range, modele) + bouton refresh. Selects: padding "7px 12px", bg "rgba(255,255,255,0.05)", border "1px solid rgba(255,255,255,0.08)", borderRadius 8, fontSize 12.

KPI STRIP (L38376-38388) :
  Grid 5 colonnes "repeat(5, 1fr)", gap 10.
  5 KPI cards : "Broadcasts", "Destinataires", "Envoyes", "Taux succes", "Erreurs".
  Chaque card : padding "14px 16px", bg "rgba(255,255,255,0.03)", borderRadius 12, border "1px solid rgba(255,255,255,0.06)", textAlign center.
    Label: fontSize 10, color "var(--text-tertiary)", fontWeight 700, textTransform uppercase, letterSpacing 0.5px, marginBottom 4.
    Valeur: fontSize 22, fontWeight 800, couleurs dynamiques (#6366f1, #8b5cf6, #10b981, dynamique via rateColor, #ef4444 si erreurs > 0).

ONGLETS (L38392-38410) :
  Flex row, gap 8, borderBottom "1px solid rgba(255,255,255,0.08)", paddingBottom 2.
  Boutons tab : padding "10px 16px", borderRadius "8px 8px 0 0", border none.
    Actif: bg "rgba(99,102,241,0.15)", color "#a5b4fc", borderBottom "2px solid #6366f1".
    Inactif: bg transparent, color "var(--text-tertiary)", borderBottom "2px solid transparent".
  Labels : "Broadcaster" et "Analytics", fontSize 13, fontWeight 700.

SECTION 1 — ETAPE 1 "Choisir le modele" (L38419-38494) :
  Card style : bg "rgba(255,255,255,0.03)", padding "22px 24px", borderRadius 16, border "1px solid rgba(255,255,255,0.07)".
  Numero d'etape : cercle 20x20, bg #6366f1, color #fff, fontSize 10, fontWeight 800, borderRadius 50%.
  Grille de boutons-modeles : gridTemplateColumns repeat(min(models.length,4), 1fr), gap 8.
    Chaque bouton : padding "14px 8px", borderRadius 10. Actif: border "2px solid [couleur modele]", boxShadow "0 0 16px [glow]", bg "[couleur]+22". Inactif: border "2px solid rgba(255,255,255,0.07)", bg "rgba(255,255,255,0.02)".
    Emoji modele (24px) + nom (fontWeight 800, fontSize 13) + compteur fans (fontSize 10) + badge warm-up (fontSize 9).
  MODEL_COLORS : carla=#8b5cf6, sophie=#ec4899, bella=#f59e0b, nadia=#a855f7. Default=#6366f1.

  Panneau warm-up (L38452-38493) :
    WARMUP_CONFIG: hot=#10b981 "COMPTE CHAUD", warm=#f59e0b "COMPTE TIEDE", cold=#ef4444 "COMPTE FROID".
    Card : bg [status.bg], border "2px solid [status.color]", borderRadius 12, padding 16.
    Grille 3 metriques : "Max volume", "Delai", "Msgs 7j" — fontSize 18, fontWeight 800.
    Si broadcast bloque : banniere bg "rgba(239,68,68,0.15)", border "1px solid rgba(239,68,68,0.4)", color "#ef4444".

SECTION 2 — ETAPE 2 "Segmenter l'audience" (L38496-38530) :
  TIERS : Tous/Shark/Baleine/Gorille/Orang/Ouistiti/Poisson/FREE — avec emojis.
  Boutons flex wrap, gap 6 : padding "8px 12px", borderRadius 10, minWidth 58.
    Actif: border "2px solid #6366f1", bg "rgba(99,102,241,0.15)", color "#a5b4fc".
    Inactif: border "2px solid rgba(255,255,255,0.06)", bg "rgba(255,255,255,0.02)", color "var(--text-tertiary)".
    Contenu : emoji (18px) + label (9px, uppercase) + count (14px, fontWeight 800).

SECTION 3 — ETAPE 3 "Media" (L38532-38558) :
  Zone de drop : padding 20, border "2px dashed rgba(255,255,255,0.08)", borderRadius 10, textAlign center.
  Hover : borderColor passe a #6366f1.
  Media selectionne : padding 14, border "2px solid #6366f1", bg "rgba(99,102,241,0.07)", flex row avec icone + nom + taille + bouton supprimer (bg "rgba(239,68,68,0.15)").

SECTION 4 — ETAPE 4 "Message" (L38560-38627) :
  Textarea : width 100%, minHeight 120, padding 12, bg "rgba(255,255,255,0.03)", border "1px solid rgba(255,255,255,0.07)", borderRadius 10, fontSize 13, lineHeight 1.7.
  Bouton "Generer 5 variantes IA anti-spam" : padding "12px 20px", borderRadius 8, fontWeight 700, fontSize 13. Gradient "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" ou vert si genere.
  Variantes IA : card avec border "2px solid rgba(99,102,241,0.4)", liste de variantes avec badges longueur (Original/Court/Moyen/Long).

COLONNE DROITE — APERCU (L38641-38747) :
  Card sticky top 20.
  Grille 2x1 : "Destinataires" (fontSize 26, fontWeight 800, color #6366f1) et "Duree est." (fontSize 20, color #10b981).
  Resume texte : Modele, Segment, Type, Variantes, Statut.
  Progress bar lors de l'envoi : hauteur 5px, bg "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius 3.
  Bouton "Envoyer maintenant" : flex 2, padding "14px 20px", borderRadius 10, gradient "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow "0 4px 16px rgba(99,102,241,0.4)".
  Bouton "Programmer" : flex 1, border "2px solid rgba(255,255,255,0.1)".

SECTION HISTORIQUE BROADCASTS (L38751-38809) :
  Liste de lignes cliquables : padding "14px 16px", borderBottom "1px solid rgba(255,255,255,0.05)".
  Chaque ligne : badge modele (couleur dynamique) + audience name + message tronque 80 car + metriques (Envoyes, Succes %, Erreurs, CA 2h) + date + fleche.
  Hover : bg passe a "rgba(255,255,255,0.03)".

SECTION BROADCASTS PROGRAMMES (L38811-38875) :
  Liste similaire + bouton "Annuler" par broadcast (border #ef4444, bg "rgba(239,68,68,0.1)", color #ef4444).
  Compteur "dans Xj Xh" en couleur #f59e0b.

ONGLET ANALYTICS (composant AnalyticsDadacast, L37606-37894) :
  KPI strip 3 colonnes : CA 7j (#10b981), CA 30j (#6366f1), CA 90j (#8b5cf6). fontSize 28, fontWeight 800.
  Bouton export CSV : bg "rgba(16,185,129,0.12)", color "#10b981".
  Performance par Tier : grille 5 colonnes (120px + 4x 1fr), lignes avec emoji tier + Broadcasts/Envoyes/CA total/CA moyen.
  Performance par Modele : meme grille, emoji modele.
  Heatmap "Best Time to Send" : grille 60px + 24x 32px, cellules 32x32, borderRadius 4. Intensite verte "rgba(16,185,129,[0-0.6])".
  Insights : card bg "rgba(99,102,241,0.08)", border "2px solid rgba(99,102,241,0.25)".

MODALE DETAIL BROADCAST (L38889-38982) :
  Overlay : bg "rgba(0,0,0,0.8)", backdropFilter "blur(8px)".
  Modale : bg "linear-gradient(135deg, #1a1f2e, #0f1419)", borderRadius 20, border "2px solid rgba(99,102,241,0.3)", maxWidth 800.
  KPIs internes 3 colonnes, puis tableau destinataires 3 colonnes (Destinataire/Statut/CA).
  Badge statut : success=#10b981, echec=#ef4444.

ETATS :
  Loading : "..." dans les KPIs, "Chargement..." dans les listes.
  Empty broadcasts : "Aucun broadcast encore — lance ton premier !"
  Empty detail : "Impossible de charger le detail".

RESPONSIVE :
  Non explicitement gere dans ce composant (pas de _isMobile). La grille 2fr/1fr va probablement etre ecrasee sur mobile.



=======================================================================================================
PAGE : ZOO MAP (Composant: DadashZooTab — Ligne: 18572, sous-composants L18115-18570)
ROLE : gerant
=======================================================================================================

LAYOUT :
  Container .zoo-container : width 100%, height calc(100vh - 52px - 80px), overflow hidden, flex column.
  2 zones verticales :
    1. ZooHeader (barre haut, flex-shrink 0)
    2. ZooMap (flex 1, position relative, prend tout l'espace restant)

HEADER — ZooHeader (L18115-18167, CSS L4865-4916) :
  .zoo-header : padding "16px 20px", bg "var(--bg-raised)", borderRadius 12, marginBottom 12, border "1px solid var(--border-default)".
  Flex row, justify space-between, align center, gap 12, flexWrap wrap.
  Gauche (.zoo-header-left) :
    Titre .zoo-header-title : fontSize 1.3rem, fontWeight 700, color "var(--text-primary)". Texte : "Zoo Map".
    Stats chips (.zoo-stat-chip) : bg "var(--accent-muted)", padding "4px 10px", borderRadius 8, fontWeight 600, color "var(--accent)".
      3 chips : "X spenders", "X CHF" (LTV total), "X upgradables".
  Droite (.zoo-filters) : flex row, gap 8, flexWrap wrap.
    Input recherche (.zoo-search-input) : width 160px, bg "var(--bg-base)", border "1px solid var(--border-default)", borderRadius 8, fontSize 0.85rem. Focus: borderColor "var(--accent)".
    Boutons filtres tier (.zoo-filter-btn) : padding "6px 12px", borderRadius 8, fontSize 0.85rem, transition 0.2s. Hover/actif: bg "var(--accent)", color white.
    Select modeles (si > 1 modele unique).
    Bouton "Upgrade" (toggle).

SECTION 1 — ZooMap (L18240-18277, CSS L4964-5155) :
  .zoo-map-wrapper : flex 1, overflow hidden, borderRadius 16.
  .zoo-map : width/height 100%, bg "linear-gradient(180deg, #1a2a4a 0%, #0d1b3e 30%, #0a1628 60%, #060d1a 100%)", borderRadius 16, border "1px solid var(--border-default)", position relative.
  
  Ocean (.zoo-map-ocean) : 3 radial-gradients superposes avec des bleus (rgba(30,80,160,0.15) etc.).
  Vagues (.zoo-map-waves) : repeating-linear-gradient horizontal, opacite 0.06, anime "zooWaveShift 8s linear infinite" (translateX 42px).
  Etoiles (.zoo-map-stars) : 30 points positionnes aleatoirement (top 0-40%, left 0-100%), taille 1-3px, bg "rgba(255,255,255,0.6)", animation "zooTwinkle 3s ease-in-out infinite" (opacite 0.3 -> 1).

  ILES (ZooIsland, L18183-18237, CSS L5031-5137) :
    .zoo-island : position absolute, borderRadius 50%, flex column center, cursor pointer, transition "transform 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s". boxShadow "0 4px 20px rgba(0,0,0,0.4), inset 0 -4px 12px rgba(0,0,0,0.2)".
    Hover : transform scale(1.15), z-index 15, boxShadow ajoute "0 0 40px rgba(99,102,241,0.3)".
    Anneau avant (::before) : inset -6px, border "2px solid rgba(255,255,255,0.08)".

    7 tiers = 7 iles avec tailles et positions differentes :
      tier-0 : 75x75, top 8% left 10%, gradient #888->#444 (gris)
      tier-1 : 90x90, top 10% left 42%, gradient #FFD54F->#F9A825 (or)
      tier-2 : 105x105, top 12% right 10%, gradient #5BA8F5->#2B6CB0 (bleu)
      tier-3 : 125x125, top 45% left 8%, gradient #FFB74D->#E08A1E (orange)
      tier-4 : 145x145, top 42% right 12%, gradient #CE93D8->#7B1FA2 (violet)
      tier-5 : 170x170, bottom 10% left 18%, gradient #4DD0E1->#00838F (cyan)
      tier-6 : 195x195, bottom 6% right 15%, gradient #EF5350->#B71C1C (rouge)

    Contenu ile :
      Emoji (.zoo-island-emoji) : fontSize 2rem, animation "zooFloat 3s ease-in-out infinite" (translateY -8px), filter drop-shadow.
      Compteur (.zoo-island-count) : fontSize 0.75rem, bg "rgba(0,0,0,0.6)", padding "2px 8px", borderRadius 10, fontWeight 700, backdropFilter blur(4px).
      Label (.zoo-island-label) : fontSize 0.65rem, color "rgba(255,255,255,0.7)", textTransform uppercase, letterSpacing 0.05em.
    
    Ile vide (.empty-tier) : opacity 0.3, cursor default, pas de scale au hover.

    Tooltip au hover (.zoo-tooltip) : position absolute bottom calc(100%+10px), bg "rgba(10,10,20,0.95)", padding "10px 14px", borderRadius 10, opacity 0->1, fontSize 0.8rem.
    Contenu tooltip : Tier, Spenders, LTV total, Range.

    Bulles spenders (.zoo-spender-bubble) : jusqu'a 6 par ile, positionnees par coordonnees fixes, animationDelay echelonne 0.3s.

  LEGENDE (ZooLegend, L18170-18181) :
    .zoo-legend : affiche tous les tiers (emoji + nom + count).

MODALE SPENDER (ZooSpenderModal, L18279-18394) :
  ModalShell, split en 2 colonnes (zoo-modal-split) :
    Gauche (.zoo-modal-left) :
      Character card : emoji tier geant (.zoo-tier-emoji-huge), badge tier, nom, ID tronque.
      Barre de progression LTV : pourcentage vers next tier, avec target CHF.
      Si refreshing : banniere "Generation des conseils IA en cours..."
    Droite (.zoo-modal-right) :
      Stats : LTV Total, Messages, Engagement %, Delai reponse.
      Section "Quetes d'upgrade" : cards avec icon + titre + description + "+X CHF potentiel | Difficulte: etoiles".
      Bouton "LANCER LA CONVERSATION".

MODALE CHAT (ZooChatModal, L18396-18570) :
  ModalShell, split .zoo-chat-split :
    Gauche (.zoo-chat-main) : header avec avatar tier + nom + "En ligne", zone messages scrollable, input + bouton envoi.
    Droite (.zoo-ai-panel) : "Assistant IA", suggestions cliquables, insights (meilleur moment, taux reponse, delai moyen).

ETATS :
  Loading : spinner .zoo-loading + "Chargement du Zoo...".
  Empty island : opacity 0.3, pas de bulles.
  Empty messages : "Aucun message. Sois le premier a ecrire !"
  Error conseils IA : "Impossible de charger les conseils IA" + bouton "Reessayer".

RESPONSIVE (CSS ~L5878-5890) :
  Mobile : iles reduites (tier-0: 55x55 ... tier-6: 145x145), emoji 1.5rem.
  .zoo-header : flexDirection column, alignItems flex-start.



=======================================================================================================
PAGE : COMPTA (Composant: ComptaTab — Ligne: 21608)
ROLE : gerant
=======================================================================================================

LAYOUT :
  Container : padding _isMobile ? "0 12px" : 0. Colonne unique empilee.
  GlobalFilterBar en haut (selection periode).
  Puis : KPI row -> P&L Table -> 3 graphiques (Line, Bar, Pie) -> 4 tableaux -> Formulaire depenses.

HEADER :
  GlobalFilterBar (composant reutilisable) pour filtrer par date.
  Alerte optionnelle si TX sans montant : bg "rgba(245,158,11,0.15)", border "1px solid var(--warning)", borderRadius 10, fontSize 12.

SECTION 1 — KPI ROW P&L (L21783-21809) :
  className "kpi-row cols-4" (ou cols-2 mobile). Grid auto.
  4 KPI cards utilisant les classes CSS :
    1. "GROSS REV" — classe indigo — valeur fmtAmount(grossRev), delta "CA brut periode"
    2. "NET" — classe green — valeur fmtAmount(totalNet), delta "apres frais providers"
    3. "CHARGES TOTALES" — classe red/green dynamique
    4. "NET MARGIN" — classe amber/red dynamique, delta avec marginPct%
  Chaque card a : .kpi-card-label (label), .kpi-card-value (valeur), .kpi-card-delta (tendance), .kpi-card-hint.

SECTION 2 — P&L TABLE (L21811-21834) :
  Card : bg "var(--surface)", border "1px solid var(--border)", borderRadius 14, padding "16px 20px".
  Titre "P&L Statement" fontSize 15, fontWeight 800. Boutons export CSV + PDF a droite.
    CSV : bg "var(--success-muted)", color "var(--success)", borderRadius 8, fontSize 12.
    PDF : bg "var(--accent-muted)", color "var(--accent)".
  Table className "table", fontSize 13, 2 colonnes.
    Lignes : CA Brut, Frais providers (color "var(--danger)"), Fee Dada, Net (highlighted bg "var(--bg-overlay)", borderLeft "2px solid var(--accent)"), Commissions chatters (color "var(--warning)"), Marge brute, Depenses (color "var(--pink)"), Profit net (bg conditionnelle verte/rouge, borderLeft "3px solid var(--success)/var(--danger)").

SECTION 3 — GRAPHE MENSUEL MULTI-LIGNE (L21836-21856) :
  Card meme style. Titre : "Evolution mensuelle — CA / Net / Charges / Marge nette".
  Recharts LineChart, hauteur 260px, ResponsiveContainer 100%.
  4 lignes : ca_brut (#8B5CF6), ca_net (#3B82F6), charges (#EF4444), marge_nette (#10B981). strokeWidth 2, type monotone, dot false.
  CartesianGrid strokeDasharray "3 3", vertical false. XAxis/YAxis fontSize 10, fill "var(--text-tertiary)".
  Tooltip : bg "var(--card-bg)", borderRadius 10, fontSize 12.

SECTION 4 — GRAPHE BAR PAR MODELE (L21858-21877) :
  Recharts BarChart, hauteur 260px, barCategoryGap 20%.
  3 barres : CA (#8B5CF6), Net (#3B82F6), Comm (#F59E0B). radius [6,6,0,0].

SECTION 5 — GRAPHE PIE PAR LANGUE (L21879-21907) :
  Flex row, gap 20, flexWrap wrap.
  PieChart : 220x220, donut (outerRadius 90, innerRadius 50), paddingAngle 3, label internes avec nom + %.
  PIE_COLORS : ["#8B5CF6","#EC4899","#F59E0B","#10B981","#3B82F6","#EF4444","#6366F1","#14B8A6"].
  Legende droite : liste de lignes avec carre couleur (10x10, borderRadius 3) + flag + code + montant + nbr TX.

SECTION 6 — TABLEAU DETAIL PAR MODELE (L21909-21929) :
  Table className "table", fontSize 12.
  Colonnes : Modele | CA | Net | Comm (var(--warning)) | Marge (var(--success)/var(--danger)) | TX.

SECTION 7 — TABLEAU DETAIL PAR LANGUE (L21931-21951) :
  Colonnes : Flag | Langue | CA (fontWeight 700) | Net | TX | % CA (var(--accent)).

SECTION 8 — DISTRIBUTION COMMISSIONS (L21953-21973) :
  Colonnes : Chatter (Tag component) | Commission (var(--warning)) | % total.

SECTION 9 — DEPENSES (L21975-22016) :
  Breakdown par type en chips : salaire/marketing/outil/reversement/autre. Chaque chip : borderRadius 20, bg "var(--surface2)", fontSize 12.
  Bouton "+ Ajouter depense" : bg "var(--accent)", color "#fff", borderRadius 9, fontSize 13.
  Formulaire (toggle) : grid 2 colonnes, gap 14. Inputs : padding "7px 13px", borderRadius 9, bg "var(--surface2)", fontSize 13.
  Select categorie (depuis expenseCategories).
  Table depenses : Nom | Type (badge) | Categorie (badge) | Montant | Edit (bouton crayon).

ETATS :
  Pas de loading explicite visible (KPIs calcules en memo).
  Empty tables : aucun message specifique, la table apparait vide.

RESPONSIVE :
  _isMobile : padding "0 12px", KPI grid passe a "cols-2" (2 colonnes), gridTemplateColumns "1fr 1fr".



=======================================================================================================
PAGE : PAIEMENTS HUB (Composant: PaiementsHubTab — Ligne: 22025)
ROLE : gerant
=======================================================================================================

LAYOUT :
  Container : padding _isMobile ? "0 12px" : 0. Colonne unique empilee.
  KPI row -> Toolbar filtres -> Table des paiements.

SECTION 1 — KPI ROW (L22178-22200) :
  className "kpi-row cols-4" (cols-2 mobile). 4 KPI cards :
    1. "EN ATTENTE" — classe amber — valeur pending.length, delta "X CHF"
    2. "VALIDES CE MOIS" — classe green — valeur valMonth.length, delta montant CHF
    3. "CONTESTES" — classe red — valeur contested.length, delta "a traiter"
    4. "TOTAL VERSE" — classe indigo — valeur totalPaid CHF, hint "all validated"

SECTION 2 — TOOLBAR (L22202-22219) :
  Flex row, gap 8, flexWrap wrap, marginBottom 16.
  Bouton "+ Nouveau paiement" (gerant only) : padding "7px 14px", borderRadius 9, bg "var(--accent)", color "#fff", fontSize 13, fontWeight 700.
  4 boutons flux : "Tous", "Gerant->Chatter", "Gerant->Modele", "Provider->Gerant".
    Actif: border "var(--accent)", bg "var(--accent-muted)", color "var(--accent)". Inactif: border "var(--border)", bg "var(--surface2)".
    Padding "5px 10px", borderRadius 8, fontSize 11, fontWeight 600.
  Select statut : 5 options (Tous/En attente/Valides/Contestes/Annules). Meme style inputs.
  Input mois (type month) : meme style.
  Bouton refresh : "recycle" symbol.

SECTION 3 — TABLE (L22221-22260) :
  Loading : textAlign center, padding 32, color "var(--text-quaternary)", "Chargement...".
  Empty : padding 40, bg "var(--surface)", borderRadius 14, emoji 28px, fontSize 14.
  Table : bg "var(--surface)", borderRadius 14, overflow hidden.
    className "table", fontSize 12.
    Colonnes : DATE | DE | VERS (fontWeight 700) | TYPE (badge bg "var(--surface2)", fontSize 10) | MONTANT (fontWeight 800) | PERIODE (fontSize 10) | STATUT (badge) | ACTIONS.
    Badge statut : padding "3px 8px", borderRadius 8, fontSize 10, fontWeight 700.
      Couleurs statut :
        pending: bg "rgba(245,158,11,0.12)", color "var(--warning)", label "EN ATTENTE"
        validated: bg "rgba(34,211,161,0.1)", color "var(--success)", label "VALIDE"
        contested: bg "rgba(244,63,94,0.1)", color "var(--danger)", label "CONTESTE"
        cancelled: bg "rgba(75,85,99,0.1)", color "var(--muted)", label "ANNULE"
    Actions : boutons Valider (bg "var(--success)"), Annuler (border "var(--danger)"), Facture (bg "var(--accent-muted)").
  Lignes cliquables (cursor pointer) -> ouvrent la modale detail.

MODALE DETAIL (L22262-22319) :
  Overlay : bg "rgba(0,0,0,0.65)", zIndex 5000.
  Modale : maxWidth 540, width 95vw, maxHeight 88vh, borderRadius 14 (mobile: "20px 20px 0 0"), boxShadow "0 24px 64px rgba(0,0,0,0.6)".
  Header sticky : fontSize 16, fontWeight 800. Bouton fermer.
  Montant geant : fontSize 36, fontWeight 900, color dynamique.
  Badge statut : padding "4px 12px", borderRadius 9, fontSize 12, fontWeight 700.
  Grille 2 colonnes : 6 champs (De, Vers, Type, Devise, Periode debut, Periode fin). Chaque champ : padding "10px 12px", borderRadius 10, bg "var(--surface2)".
  Note (italique), calcul detaille (bg "var(--accent-muted)"), facture auto (icone parchemin), contestation (bg "var(--danger-muted)").
  Boutons d'action : Valider (bg "var(--success)"), Contester (bg "rgba(245,158,11,0.1)"), Annuler (bg "var(--danger-muted)").
    Style : flex 1, padding 9px, borderRadius 10, fontSize 13, fontWeight 700.

MODALE CREATION (L22321-22392) :
  Overlay + modale similaire. Titre "Nouveau paiement".
  Formulaire : inputs style {padding "8px 12px", borderRadius 9, bg "var(--surface2)", fontSize 13}.
  Labels : fontSize 10, fontWeight 600, textTransform uppercase, letterSpacing 0.5.
  Select destinataire (optgroups Chatters/Modeles avec solde du affiche).
  Chip solde du : bg "var(--accent-muted)", fontSize 12.
  Grille 2 colonnes : Type (select) + Montant (number).
  DateRangePicker pour la periode.
  Input note avec placeholder "Ex: Commission semaine 12".
  Boutons : Annuler (border "var(--border)") + Creer (bg "var(--accent)", flex 2).

ETATS :
  Loading : "Chargement..." centre.
  Empty : emoji pile d'argent + "Aucun paiement" / "avec ces filtres".

RESPONSIVE :
  _isMobile : KPI "cols-2", padding "0 12px", modale borderRadius "20px 20px 0 0", alignItems "flex-end".



=======================================================================================================
PAGE : ADMIN (Composant: AdminShell — Ligne: 28606)
ROLE : gerant
=======================================================================================================

LAYOUT :
  Container : padding _isMobile ? "0 12px" : 0.
  Structure : Topbar -> Tabs horizontaux scrollables -> Contenu dynamique (fade-in).

HEADER / TOPBAR (L28626-28629) :
  Div : padding "20px 0 16px", borderBottom "1px solid var(--border)", marginBottom 20.
  Titre : fontSize 20, fontWeight 800, color "var(--text)". Texte : "Admin".
  Sous-titre : fontSize 13, color "var(--text-secondary)", marginTop 4. Texte : "Gestion et configuration".

TABS (L28630-28635) :
  Container : overflowX auto, WebkitOverflowScrolling touch, marginBottom 20, borderBottom "1px solid var(--border-subtle)".
  Flex row nowrap, gap 8, paddingBottom 8, minWidth min-content.
  Jusqu'a 10 onglets (gerant) :
    users ("Utilisateurs"), roles ("Roles & Permissions"), suggestions ("Suggestions IA"), logs ("Logs"), export ("Export"), platforms ("Plateformes"), pipeline ("Pipeline Debug"), settings ("Parametres Agence"), scripts ("Scripts TG" — gerant only), duplicates ("Doublons" — gerant only).
  Style bouton onglet :
    padding "8px 14px", borderRadius 9, fontSize 13, fontWeight 600, flexShrink 0, whiteSpace nowrap, transition "all 0.15s".
    Actif : border "1px solid #8b5cf6", bg "rgba(139,92,246,0.15)", color "#c4b5fd".
    Inactif : border "1px solid var(--border)", bg "var(--surface)", color "var(--text)".

SOUS-TAB 1 — UTILISATEURS (AdminUsersTab, L27251-27399) :
  Header : flex row justify space-between, marginBottom 20.
    Titre "Utilisateurs" (fontSize 15, fontWeight 800) + compteur membres (fontSize 11, color "var(--muted2)").
    Bouton "+ Nouvel utilisateur" : padding "8px 16px", borderRadius 10, bg "#7c3aed", color "#fff", fontSize 13, fontWeight 700.
  Table : bg "var(--surface)", borderRadius 14, border "1px solid var(--border)".
    className "table", fontSize 12, overflowX auto.
    Colonnes : Nom (fontWeight 600) | Email (fontSize 11, color "var(--text-secondary)") | Role (badge) | Modeles (fontSize 11, maxWidth 150, ellipsis) | Comm % | Statut (badge ACTIF/INACTIF) | Actions.
    Badge role : padding "3px 8px", borderRadius 8, fontSize 10, fontWeight 700.
      gerant: bg "rgba(139,92,246,0.15)", color "var(--accent)"
      chatter: bg "rgba(16,185,129,0.15)", color "var(--success)"
      modele: bg "rgba(244,114,182,0.15)", color "var(--pink)"
      provider: bg "rgba(245,158,11,0.15)", color "var(--warning)"
    Badge statut : ACTIF = bg "rgba(16,185,129,0.15)" color "var(--success)" / INACTIF = bg "rgba(239,68,68,0.15)" color "var(--danger)".
    Boutons actions : Modifier (border "var(--accent)", bg "rgba(139,92,246,0.1)"), Toggle actif (rouge/vert), Reset password (border "var(--warning)").
      Padding "4px 9px", borderRadius 7, fontSize 11.

  Modale User (L27363-27397) :
    ModalShell. Card : bg "var(--modal-bg)", borderRadius 16, padding 24, maxWidth 480, width 90vw, maxHeight 90vh.
    Formulaire vertical gap 14.
    Inputs : padding "9px 12px", borderRadius 9, border "1px solid rgba(255,255,255,0.08)", bg "#131926", fontSize 13.
    Labels : fontSize 10, fontWeight 600, textTransform uppercase, letterSpacing 0.8px.
    Champs : Nom complet, Email (creation), Role (select), Modeles assignes (checkboxes toggle, borderRadius 8), Commission %.
    Boutons bas : Annuler (bg transparent) + Sauvegarder (bg "#7c3aed" / disabled: bg "var(--surface2)").

SOUS-TAB 2 — ROLES & PERMISSIONS (AdminRolesTab, L27424-27550) :
  Titre "Permissions par employe" (fontSize 15, fontWeight 800).
  Legende : "peut voir" / "peut modifier" / "pas d'acces".
  Table matrice : lignes = 13 features (dashboard, business, equipe...), colonnes = employes.
    Header th : padding "10px 14px", fontSize 10, bg "#131926", textAlign center.
    Nom employe : fontWeight 700, fontSize 11. Role en-dessous : fontSize 9.
    Cellules : fontSize 14, textAlign center. Cliquable (gerant) pour cycler : edit -> view -> none.
    Feature td : position sticky left 0, fontWeight 600.
    Alternance : bg impair "var(--surface)", pair "var(--surface2)".

ETATS :
  Loading permissions : "Chargement..." padding 48.
  Empty employees : "Aucun employe trouve".
  Empty users : colspan 7 centre, padding 32.

RESPONSIVE :
  _isMobile : padding "0 12px". Tabs scrollables horizontalement.



=======================================================================================================
PAGE : RECHERCHE GLOBALE Cmd+K (Composant: SearchModal — Ligne: 58418)
ROLE : gerant (tous roles)
=======================================================================================================

LAYOUT :
  Portail ReactDOM (document.body). Overlay plein ecran.
  Modale centree horizontalement, paddingTop 80 (mobile: 20).
  Colonne unique : Input -> Resultats groupes -> Footer.

OVERLAY (L58524) :
  position fixed, inset 0, zIndex 99999.
  background "rgba(0,0,0,0.6)", backdropFilter "blur(4px)" (desktop) / "none" (mobile).

MODALE (L58525) :
  width 100%, maxWidth 620, maxHeight 70vh.
  background "var(--bg-card)", borderRadius 16, border "1px solid var(--border-default)", boxShadow "0 25px 60px rgba(0,0,0,0.5)".
  Flex column, overflow hidden.

SECTION 1 — BARRE DE RECHERCHE (L58527-58531) :
  padding "16px 20px", borderBottom "1px solid var(--border-default)".
  Flex row, gap 10.
  Icone loupe (fontSize 18, opacity 0.5).
  Input : flex 1, bg transparent, border none, outline none, color "var(--text-primary)", fontSize 15, fontFamily "'DM Sans',sans-serif".
    Placeholder : texte i18n "search_input".
  Badge ESC (kbd) : padding "2px 8px", borderRadius 6, bg "var(--bg-overlay)", border "1px solid var(--border-default)", color "var(--text-tertiary)", fontSize 11, fontWeight 600.

SECTION 2 — RESULTATS (L58533-58563) :
  Flex 1, overflowY auto, padding "8px 0".
  
  Etat vide (< 2 car.) : padding "40px 20px", textAlign center.
    Icone loupe (fontSize 32), texte "Rechercher..." (fontSize 13), sous-texte "Spenders, transactions, models, pages..." (fontSize 11).
  
  Etat aucun resultat : icone interdit (fontSize 32) + "Aucune donnee".

  Resultats groupes par categorie :
    Header groupe : padding "8px 20px 4px", fontSize 10, fontWeight 700, textTransform uppercase, letterSpacing 1, color "var(--text-quaternary)".
    Categories possibles : Pages, Spenders, Users, Models, Transactions, Products.

    Ligne resultat : padding "8px 20px", flex row, gap 10, cursor pointer, transition "all 0.1s".
      Active (hover ou fleche) : bg "var(--accent-muted)", borderLeft "3px solid var(--accent)".
      Inactive : bg transparent, borderLeft "3px solid transparent".
      Icone : 32x32, borderRadius 10, fontSize 15, bg "var(--bg-overlay)" (ou "var(--accent-muted)" si active).
      Label : fontSize 13, fontWeight 600, color "var(--text-primary)", ellipsis.
      Sous-info : fontSize 11, color "var(--text-tertiary)".
        Badge statut (si TX) : padding "1px 6px", borderRadius 4, fontSize 10, fontWeight 600. Couleurs : pending=#F59E0B, validated=#10B981, refused=#EF4444.
      Fleche entree : fontSize 11, color "var(--text-quaternary)".

  Recherche : parcourt pages (GERANT_NAV + PAGE_TABS), spenders (handle/username), profiles (name/email), models (name), transactions (handle/notes/amount, max 500 scannees), products (name/tag). Max 40 resultats.

SECTION 3 — FOOTER (L58566-58570) :
  padding "10px 20px", borderTop "1px solid var(--border-default)".
  Flex row, gap 16, fontSize 11, color "var(--text-quaternary)".
  3 indications : fleches (navigation), entree (valider), ESC (fermer).

NAVIGATION AU CLIC :
  - page -> onNavigate(pageId, subTabId)
  - spender -> onDrill("spender", handle)
  - profile -> onDrill selon role (model/chatter/provider)
  - tx -> navigate vers "business/transactions"
  - product -> navigate vers "equipe/catalogue"

INTERACTIONS CLAVIER :
  ArrowDown/ArrowUp : navigation dans les resultats (selectedIdx).
  Enter : selection de l'item actif.
  Escape : fermeture.

ETATS :
  Ouverture : auto-focus input apres 50ms.
  Fermeture : reset query.
  Loading : aucun (recherche synchrone en useMemo).

RESPONSIVE :
  _isMobile : paddingTop 20 au lieu de 80, backdropFilter "none".


---

Ce rapport couvre les 6 pages demandees avec tous les details visuels extraits directement du code source : layouts, composants dans l'ordre vertical, styles inline exacts (couleurs hex, fontSize, fontWeight, padding, borderRadius, etc.), etats (loading/empty/error), responsive, et modales accessibles. Les numeros de ligne sont references tout au long du rapport.


═══════════════════════════════════════════════════════════════════════════════
              PARTIE D — CHATTER / MC / PROVIDER / MODÈLE
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
                    AUDIT VISUEL & DESIGN — DADASH CRM
                    Fichier unique : /home/user/dadash-crm/index.html
                    (~63 000 lignes, React/Babel in-browser)
═══════════════════════════════════════════════════════════════════════════════


═══════════════════════════════════════════════════════════════════════════════
PAGE 1 : DASHBOARD CHATTER (Composant: ChatterDashboardRedesign — L29226-29946)
RÔLE : chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Colonne verticale (flex column implicite via empilement de blocs)
  - padding: `_isMobile ? "0 12px" : 0`
  - Ordre des blocs top→bottom : scopeBadge → searchBarEl → noAssignBanner → filterEl → kpiCardsEl → chartPanelEl → bottomGridEl → popupsEl

HEADER :
  - Scope badge : `display:inline-flex, padding:5px 14px, borderRadius:20, background:rgba(139,92,246,0.15), border:1px solid rgba(139,92,246,0.3), color:#c4b5fd, fontSize:11, fontWeight:700, letterSpacing:0.5, textTransform:uppercase`
  - Search bar input : `fontSize:13, padding:10px 16px, borderRadius:12, background:var(--surface), border:1px solid var(--border)`
  - Search dropdown : `background:var(--bg2), border:1px solid var(--border-ds), borderRadius:14, boxShadow:0 12px 40px rgba(0,0,0,0.45), maxHeight:420, overflowY:auto`

SECTION 1 — FILTRES PÉRIODE :
  - Pilules "24h", "7j", "30j", "90j", "All time"
  - className `filter-pill` + `active` quand sélectionné
  - Styles CSS class (non inline) — la class active utilise l'accent

SECTION 2 — KPI CARDS :
  - Container : `className: _isMobile ? "kpi-row cols-2" : "kpi-row cols-6"`
  - Métriques définies dans `CHATTER_DASHBOARD_METRICS` avec propriétés : color, label, calc, fmt, inGraph
  - Style carte (fonction inline) :
    - `background: active ? m.color+"12" : "var(--surface)"`
    - `border: 1px solid var(--border)`
    - `borderBottom: active ? "2px solid "+m.color : "2px solid transparent"`
    - `borderRadius:12`
    - `padding:14px 16px`
    - `cursor:pointer`
  - Dernière carte = SoldeWidget intégré
  - Color classes sur kpi-card : green, amber, indigo, white

SECTION 3 — CHART PANEL :
  - Container : `background:var(--surface), border:1px solid var(--border), borderRadius:14, padding:16px 20px`
  - Boutons vue (courbe/bar/table) : `borderRadius:8, border:1px solid ${selected?"#8b5cf6":"var(--border)"}, background:${selected?"rgba(139,92,246,0.15)":"var(--surface2)"}`
  - Recharts : LineChart ou BarChart dans ResponsiveContainer
  - Tooltip custom : `background:#1a2035, border:1px solid rgba(139,92,246,0.3), borderRadius:10, padding:10px 14px, boxShadow:0 8px 24px rgba(0,0,0,0.5)`

SECTION 4 — BOTTOM GRID :
  - `display:grid, gridTemplateColumns: _isMobile ? "1fr" : "1fr 1fr 340px", gap:14`
  - Model cards : `background:var(--surface), border:1px solid var(--border), borderRadius:14, padding:20`
  - Model avatar couleurs cycliques : `["#8b5cf6","#10b981","#f59e0b","#06b6d4"]`
  - TX récentes cards : même base de style

MODALES :
  - DashModal pour liste pending et alertes
  - Style ModalShell standard (overlay + panel centré)

HOVER/INTERACTIONS :
  - Model cards hover → `borderColor:#8b5cf6`
  - TX récentes cards hover → `borderColor:#f59e0b`
  - KPI cards : clic → toggle active (filtre graphique), feedback visuel via borderBottom coloré
  - Search dropdown : items cliquables avec highlight

RESPONSIVE :
  - `_isMobile` : padding latéral 12px, KPI grille 2 colonnes au lieu de 6, bottom grid 1 colonne au lieu de 3

COULEURS :
  - Accent principal : `#8b5cf6` (violet)
  - Badge scope : `rgba(139,92,246,0.15)` bg, `rgba(139,92,246,0.3)` border, `#c4b5fd` texte
  - Surfaces : `var(--surface)`, `var(--surface2)`, `var(--bg2)`
  - Bordures : `var(--border)`, `var(--border-ds)`
  - Tooltip chart : `#1a2035`
  - Avatars : `#8b5cf6`, `#10b981`, `#f59e0b`, `#06b6d4`
  - KPI color classes : green, amber, indigo, white

TYPO :
  - Scope badge : fontSize 11, fontWeight 700, letterSpacing 0.5, textTransform uppercase
  - Search input : fontSize 13
  - KPI labels/values : via CSS class kpi-card (non inline)
  - Font family héritée : `'DM Sans', sans-serif` (body level)


═══════════════════════════════════════════════════════════════════════════════
PAGE 2 : SPENDERS (Composant: MesSpendersTab — L18712-19211+)
RÔLE : chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Colonne unique, pleine largeur
  - GlobalFilterBar en haut
  - Empilement : header → KPI grid → filtres/recherche → card grid ou table

HEADER :
  - Titre : `fontSize:20, fontWeight:800`
  - Toggle vue (Cards / Table / WA Analyzer) : `borderRadius:14, border:1px solid var(--border-default), overflow:hidden`
  - Boutons toggle : `padding:7px 14px, fontSize:11, fontWeight:700`

SECTION 1 — KPI GRID :
  - `display:grid, gridTemplateColumns:repeat(4,1fr), gap:14`
  - Cards : `background:var(--card-bg), border:1px solid var(--border-subtle), borderRadius:14, padding:16px 20px`
  - Labels : `fontSize:10, color:var(--text-tertiary), textTransform:uppercase, letterSpacing:0.5`
  - Valeurs : `fontSize:24, fontWeight:800`

SECTION 2 — FILTRES + RECHERCHE :
  - Filter pills : `padding:6px 14px, borderRadius:12, fontSize:11, fontWeight:600`
  - Search input : `padding:10px 16px, borderRadius:14, border:1px solid var(--border-default), background:var(--card-bg), fontSize:13`

SECTION 3 — CARD GRID (vue Cards) :
  - `display:grid, gridTemplateColumns:repeat(auto-fill,minmax(320px,1fr)), gap:16`
  - Spender cards : `background:var(--card-bg), border:1px solid var(--border-subtle), borderRadius:14, padding:20`
  - SpenderAvatar : `width:56px, height:56px, borderRadius:12, border:2px solid ${tierColor}`
  - Metric boxes : `padding:6px 8px, borderRadius:10, background:var(--bg-overlay)`
  - Tags : `padding:2px 8px, borderRadius:6, background:var(--bg-overlay), border:1px solid var(--border-subtle), fontSize:10, fontWeight:500`

SECTION 4 — CLASSIFICATION :
  - Système `SINGE_TIERS` : shark, whale, gorille, orang_outan, ouistiti, poussin, timewaster
  - Badges colorés par tier (couleurs spécifiques par animal)

MODALES :
  - UnifiedSpenderModal au clic sur carte (détail spender)
  - WhatsApp Analyzer comme vue alternative

HOVER/INTERACTIONS :
  - Cards cliquables → ouverture modal détail
  - Filter pills toggle

RESPONSIVE :
  - auto-fill avec minmax(320px,1fr) → adaptatif naturel
  - KPI grid reste 4 colonnes (pas de branchement _isMobile visible ici)

COULEURS :
  - Surfaces : `var(--card-bg)`, `var(--bg-overlay)`
  - Bordures : `var(--border-subtle)`, `var(--border-default)`
  - Texte : `var(--text-tertiary)` pour labels
  - Tier colors : variables par SINGE_TIERS

TYPO :
  - Titre : fontSize 20, fontWeight 800
  - KPI labels : fontSize 10, textTransform uppercase, letterSpacing 0.5
  - KPI values : fontSize 24, fontWeight 800
  - Tags : fontSize 10, fontWeight 500
  - Toggle buttons : fontSize 11, fontWeight 700
  - Search : fontSize 13


═══════════════════════════════════════════════════════════════════════════════
PAGE 3 : MESSAGERIE (Composant: ChatterMessagerieTab — L30939-31274)
RÔLE : chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Grille deux colonnes : `display:grid, gridTemplateColumns: _isMobile?"1fr":"300px 1fr", minHeight:500, borderRadius:16, border:1px solid var(--border-subtle), boxShadow:var(--shadow-md), overflow:hidden`

HEADER :
  - `fontSize:24, fontWeight:800, fontFamily:'Inter',sans-serif`

SECTION 1 — PANNEAU GAUCHE (Liste conversations) :
  - `background:var(--card-bg)`
  - Items conversation : `padding:16px 18px`
  - Item sélectionné : `background:var(--accent-subtle)`
  - Séparation entre items par border ou gap implicite

SECTION 2 — ZONE CHAT (droite) :
  - `background:var(--bg-base)`
  - Chat header : `padding:14px 18px, borderBottom:1px solid var(--border-subtle), background:var(--bg-overlay)`
  - Messages container : `padding:20px, gap:12px, scrollBehavior:smooth`
  - Bulles sortantes : `background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%), borderRadius:16px 16px 4px 16px, boxShadow:0 2px 8px rgba(99,102,241,0.3), color:white, padding:10px 16px`
  - Bulles entrantes : `background:#2d3250, borderRadius:16px 16px 16px 4px, boxShadow:0 2px 4px rgba(0,0,0,0.1), color:white, padding:10px 16px`
  - Label expéditeur : `color:#a5b4fc`
  - Zone input : `padding:16, borderTop:1px solid var(--border-subtle), background:var(--bg-overlay)`

MODALES :
  - Aucune modale dédiée

HOVER/INTERACTIONS :
  - Items conversation : clic → sélection avec background accent
  - Animation fadeIn (CSS @keyframes) sur les messages

RESPONSIVE :
  - `_isMobile` : grille passe à `1fr` (une seule colonne, conversation liste ou chat visible)

COULEURS :
  - Gradient sortant : `#6366f1 → #8b5cf6`
  - Ombre sortant : `rgba(99,102,241,0.3)`
  - Bulle entrante : `#2d3250`
  - Label sender : `#a5b4fc`
  - Surfaces : `var(--card-bg)`, `var(--bg-base)`, `var(--bg-overlay)`
  - Bordures : `var(--border-subtle)`

TYPO :
  - Header titre : fontSize 24, fontWeight 800, fontFamily 'Inter', sans-serif
  - Messages : taille par défaut héritée
  - Labels : couleur #a5b4fc pour expéditeur

ÉTATS :
  - Loading : spinner dans card `padding:48, boxShadow:var(--shadow-md)`
  - Empty/Error : composant EmptyState


═══════════════════════════════════════════════════════════════════════════════
PAGE 4 : TRANSACTIONS (Composant: ChatterTransactionsTab — L29958-30443)
RÔLE : chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `padding:0 12px`
  - Empilement vertical : scope badge → header → KPI grid → chart → table → pagination

HEADER :
  - Scope badge : même style violet que dashboard (inline-flex, borderRadius 20, etc.)
  - Bouton "+ Nouvelle TX" : `className="ui-btn-primary"`
  - Titre implicite dans le header

SECTION 1 — KPI GRID :
  - `className="kpi-grid ui-mb-md"` — 5 cartes : CA Validé, CA Pending, TX Validées, TX Pending, Spenders
  - KPI cliquables avec filtre toggle
  - Carte active : `boxShadow:0 0 0 2px #8b5cf6, background:rgba(139,92,246,0.1)`

SECTION 2 — CHART :
  - Container : `background:var(--surface), border:1px solid var(--border), borderRadius:12, padding:14px 16px 8px`
  - Toggle CA / NB TX : `borderRadius:7, fontSize:12, fontWeight:700`
  - Recharts LineChart :
    - Ligne validated : `stroke:#10b981`
    - Ligne pending : `stroke:#f59e0b`

SECTION 3 — TABLE :
  - `className="table"`, colonnes triables via composant SortTh
  - `fontSize:12` sur les cellules
  - PaginationControls en bas

MODALES :
  - ModalShell pour formulaire nouvelle TX : `maxWidth:560, width:95vw, maxHeight:92vh`
  - Formulaire grid : `gridTemplateColumns: _isMobile?"1fr":"1fr 1fr", gap:14`
  - Toggle devise EUR/CHF :
    - EUR sélectionné : couleur `#F97316` (orange)
    - CHF sélectionné : `var(--accent)` (#8b5cf6)
  - Spender dropdown : `zIndex:999, background:var(--surface), borderRadius:8, maxHeight:220, boxShadow:0 8px 24px rgba(0,0,0,0.35)`
  - UnifiedSpenderModal pour détail spender

HOVER/INTERACTIONS :
  - KPI cards : clic toggle filtre, feedback boxShadow violet
  - Colonnes table triables
  - Lignes table cliquables

RESPONSIVE :
  - `_isMobile` : formulaire modal passe en 1 colonne
  - padding latéral 12px

COULEURS :
  - Accent/filtre actif : `#8b5cf6`, `rgba(139,92,246,0.1)`
  - Chart validated : `#10b981` (vert)
  - Chart pending : `#f59e0b` (ambre)
  - EUR toggle : `#F97316` (orange)
  - Surfaces : `var(--surface)`
  - Bordures : `var(--border)`

TYPO :
  - Table cells : fontSize 12
  - Chart toggle : fontSize 12, fontWeight 700
  - Bouton primaire : via classe ui-btn-primary


═══════════════════════════════════════════════════════════════════════════════
PAGE 5 : COMPTA (Composant: ChatterComptaTab — L49391-49788)
RÔLE : chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `padding:0 12px`
  - Sub-tabs via filter-pill : Résumé, Factures, Demande paiement, Mes paies

HEADER :
  - Titre de section implicite
  - Barre de sous-onglets avec filter-pill + active

SECTION 1 — RÉSUMÉ :
  - KPI grid : `gridTemplateColumns: _isMobile?"1fr 1fr":"repeat(3,1fr) repeat(2,1fr)", gap:14`
  - KPI boxes : `padding:12px 16px, borderRadius:10, background:rgba(255,255,255,0.04)`
  - Labels : `fontSize:10, textTransform:uppercase`
  - Valeurs : `fontSize:18, fontWeight:800`
  - Table historique payouts
  - Cartes payslip avec icônes statut
  - Section paiements reçus du gérant

SECTION 2 — FACTURES :
  - Prévisualisation facture
  - Header FACTURE : `fontSize:20, fontWeight:900, color:var(--accent)`
  - Format numéro : `#{year}-{month}-{userId_6chars}`
  - Bouton print/PDF → ouvre fenêtre popup (window.open)

SECTION 3 — DEMANDE PAIEMENT :
  - Formulaire avec DateRangePicker
  - Layout grid pour les champs

SECTION 4 — MES PAIES :
  - 4 KPI cards : `gridTemplateColumns: _isMobile?"1fr 1fr":"repeat(4,1fr)"`
  - Table avec badges statut

MODALES :
  - Fenêtre popup pour impression facture (pas une modale React, mais window.open)

HOVER/INTERACTIONS :
  - Sub-tabs cliquables
  - Bouton print

RESPONSIVE :
  - Résumé KPI : 2 colonnes mobile vs 5 desktop
  - Mes paies KPI : 2 colonnes mobile vs 4 desktop

COULEURS :
  - KPI boxes bg : `rgba(255,255,255,0.04)`
  - Facture header : `var(--accent)` (#8b5cf6)
  - Badges statut : couleurs contextuelles

TYPO :
  - KPI labels : fontSize 10, textTransform uppercase
  - KPI values : fontSize 18, fontWeight 800
  - Facture titre : fontSize 20, fontWeight 900


═══════════════════════════════════════════════════════════════════════════════
PAGE 6 : COMPETITION (Composant: ChatterCompetitionTab — L51523-51870)
RÔLE : chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `padding:0 12px`
  - Deux sections via filter-pill toggle : Classement / Mes Stats
  - Filtres période : week, month, last_month, 3months

HEADER :
  - Filter pills pour section + période

SECTION 1 — CLASSEMENT :
  - Podium top 3 : `display:grid, gridTemplateColumns:"1fr 1fr 1fr", gap:16`
  - Cartes podium : `border:2px solid ${medalColor}, borderRadius:14, padding:20, textAlign:center`
  - Couleurs médailles : `["#FFD700","#C0C0C0","#CD7F32"]` (or, argent, bronze)
  - Avatar circles : `width:56px, height:56px, borderRadius:50%, background:hsl(hash,60%,50%)`
  - Barres de score : `height:6, borderRadius:3, background:rgba(255,255,255,0.08)`
  - Reste des chatters : table avec badges taux de conversion
  - Noms anonymisés : "Chatter 1", "Chatter 2"…, utilisateur courant voit "Vous"/"You"

SECTION 2 — MES STATS :
  - 4 KPI cards avec comparaison vs team avg
  - Carte rank : `background:#0e1420, border:1px solid rgba(255,255,255,0.06), borderRadius:16`
  - Carte level avec barre progression : `background:linear-gradient(90deg,${myLevel.color},${nextLevel.color})`
  - Grille badges : `gridTemplateColumns:repeat(auto-fill,minmax(200px,1fr))`
  - Badges verrouillés : `opacity:0.5, filter:grayscale(100%)`
  - Historique score : Recharts LineChart `stroke:#8B5CF6, strokeWidth:3, dot:{fill:#8B5CF6,r:5}`

MODALES :
  - Aucune modale dédiée

HOVER/INTERACTIONS :
  - Filter pills toggle
  - Badges avec état verrouillé/déverrouillé visuel

RESPONSIVE :
  - Podium grid reste 3 colonnes (pas de branchement _isMobile visible)
  - Badges grid auto-fill adaptatif

COULEURS :
  - Médailles : `#FFD700` (or), `#C0C0C0` (argent), `#CD7F32` (bronze)
  - Barres score bg : `rgba(255,255,255,0.08)`
  - Rank card : `#0e1420`, border `rgba(255,255,255,0.06)`
  - Chart : `#8B5CF6`
  - Badges locked : grayscale

TYPO :
  - Score/rank values : large, fontWeight 800
  - Labels : fontSize petit, color muted


═══════════════════════════════════════════════════════════════════════════════
PAGE 7 : SCAN CHECKER (Composant: ScanChecker — L53398-53777)
RÔLE : chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Deux colonnes quand image chargée : `display:grid, gridTemplateColumns: _isMobile?"1fr":"1fr 1fr", gap:24`
  - Une colonne sans image

HEADER :
  - Titre + bouton API key
  - Bouton API : vert si configuré `background:rgba(16,185,129,0.1), color:#10B981` ; rouge si manquant `background:rgba(239,68,68,0.1), color:#EF4444`

SECTION 1 — API KEY INPUT :
  - Panel : `borderRadius:12, padding:16`
  - Input + bouton save

SECTION 2 — DROP ZONE :
  - `minHeight: hasImage ? 400 : 300`
  - `border:2px dashed, borderRadius:16`
  - Drag hover : border color `#8B5CF6`
  - Overlay analyse : `background:rgba(0,0,0,0.6), borderRadius:12` avec spinner

SECTION 3 — RÉSULTATS :
  - 3 metric cards : `flex:1, minWidth:80, borderRadius:12, padding:12px 14px`
  - Barre risk score : `height:10, borderRadius:5` avec couleur dynamique
  - Score display : `fontSize:20, fontWeight:800, fontFamily:'Space Mono',monospace`
  - Niveaux risque :
    - safe : `#10B981`
    - attention : `#F59E0B`
    - suspect : `#F97316`
    - danger : `#EF4444`

SECTION 4 — BOUTONS ACTION :
  - Grid 2 colonnes : `gap:12`
  - Bouton Safe : `background:linear-gradient(135deg,#10B981,#059669), borderRadius:14, padding:16px 20px, fontSize:16, fontWeight:800`
  - Bouton Danger : gradient rouge similaire

SECTION 5 — HISTORIQUE SCANS :
  - Cards : `borderRadius:12, padding:12px 16px, background:var(--bg-raised)`

MODALES :
  - Aucune modale, tout inline

HOVER/INTERACTIONS :
  - Drag & drop sur zone de dépôt
  - Boutons action cliquables
  - API key toggle

RESPONSIVE :
  - `_isMobile` : grille passe en 1 colonne

COULEURS :
  - API vert : `#10B981`, `rgba(16,185,129,0.1)`
  - API rouge : `#EF4444`, `rgba(239,68,68,0.1)`
  - Drag accent : `#8B5CF6`
  - Overlay : `rgba(0,0,0,0.6)`
  - Risk safe : `#10B981`
  - Risk attention : `#F59E0B`
  - Risk suspect : `#F97316`
  - Risk danger : `#EF4444`
  - Safe button gradient : `#10B981 → #059669`

TYPO :
  - Score : fontSize 20, fontWeight 800, fontFamily 'Space Mono', monospace
  - Action buttons : fontSize 16, fontWeight 800


═══════════════════════════════════════════════════════════════════════════════
PAGE 8 : DASHBOARD MC (Composant: inline — L63359-63413)
RÔLE : manager_chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Code inline (pas un composant séparé)
  - Empilement : KPI cards → bottom grid

HEADER :
  - Titre implicite dans le rendu parent

SECTION 1 — KPI CARDS :
  - `display:grid, gridTemplateColumns:repeat(auto-fit,minmax(200px,1fr)), gap:16`
  - 4 cartes
  - Style carte : `background:var(--surface), border:1px solid var(--border), borderRadius:14, padding:20px 24px`
  - Labels : `fontSize:12, color:var(--text-tertiary), fontWeight:600`
  - Values : `fontSize:28, fontWeight:800`

SECTION 2 — BOTTOM GRID :
  - `display:grid, gridTemplateColumns:repeat(auto-fit,minmax(250px,1fr)), gap:16`
  - Carte liste équipe
  - Carte TX pending

MODALES :
  - Aucune modale dédiée

HOVER/INTERACTIONS :
  - Cartes informatives (pas de clic spécial documenté)

RESPONSIVE :
  - auto-fit avec minmax → adaptatif naturel, pas de branchement _isMobile

COULEURS :
  - Surfaces : `var(--surface)`
  - Bordures : `var(--border)`
  - Labels : `var(--text-tertiary)`

TYPO :
  - KPI labels : fontSize 12, fontWeight 600
  - KPI values : fontSize 28, fontWeight 800


═══════════════════════════════════════════════════════════════════════════════
PAGE 9 : SIDEBAR MC + 6 STUBS (Sidebar: L63102 / Stubs: L63414-63473)
RÔLE : manager_chatter
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Sidebar définie à L63102
  - Items : `[{id:"mc_dashboard",icon:"📊",label:"Dash"},{id:"mc_chatters",icon:"👥",label:"Chatters"},{id:"mc_transactions",icon:"💰",label:"TX"},{id:"mc_conversations",icon:"💬",label:"Convs"},{id:"mc_planning",icon:"📅",label:"Planning"}]`

SECTION 1 — 6 PAGES STUB :
  - Pattern identique pour chaque stub :
    - `h2` : `fontSize:22, fontWeight:800`
    - Card container : `padding:32px 24px, textAlign:center`
    - Icône : `fontSize:48`
    - Titre : `fontSize:16, fontWeight:700`
    - Sous-titre : "Contenu à venir — PR 2/3" `fontSize:13, color:var(--text-tertiary)`

MODALES :
  - Aucune

HOVER/INTERACTIONS :
  - Navigation sidebar uniquement

RESPONSIVE :
  - Hérite du layout parent

COULEURS :
  - Texte stub : `var(--text-tertiary)`
  - Reste : hérité du thème global

TYPO :
  - Titre h2 : fontSize 22, fontWeight 800
  - Sous-titre stub : fontSize 16, fontWeight 700
  - Message : fontSize 13


═══════════════════════════════════════════════════════════════════════════════
PAGE 10 : DASHBOARD PROVIDER (Composant: ProviderDashboardTab — L24869-25142)
RÔLE : provider
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `padding: _isMobile ? "0 12px" : 0`
  - Empilement : filtres période → KPI strip → chart → bottom grid → declarations

HEADER :
  - Filtres période + DateRangePicker + bouton Billing info

SECTION 1 — KPI STRIP :
  - `className: _isMobile ? "kpi-row cols-2" : "kpi-row cols-6"`
  - 5 KPI cards + SoldeWidget en dernière position

SECTION 2 — CHART :
  - Recharts AreaChart dans ResponsiveContainer
  - Gradient : `linearGradient id, stop color=#6366f1, stopOpacity 0.25 → 0`
  - Area fill : `url(#gradient)`, stroke `#6366f1`

SECTION 3 — BOTTOM GRID :
  - `display:grid, gridTemplateColumns: _isMobile?"1fr":"1fr 1fr", gap:16`
  - Top modèles card : barres de progression `height:3, background:var(--border)`
  - TX récentes : liste cards

SECTION 4 — DECLARATIONS PAIEMENT :
  - Badges statut avec couleurs contextuelles

MODALES :
  - Billing info modal (implicite via bouton)

HOVER/INTERACTIONS :
  - KPI cards interactives
  - Bouton billing info

RESPONSIVE :
  - `_isMobile` : KPI 2 cols au lieu de 6, bottom grid 1 col au lieu de 2, padding 12px

COULEURS :
  - Chart gradient : `#6366f1` (indigo)
  - Surfaces : `var(--surface)`
  - Progress bars bg : `var(--border)`

TYPO :
  - Hérite des classes kpi-card / kpi-row


═══════════════════════════════════════════════════════════════════════════════
PAGE 11 : COMPTA PROVIDER (Composant: ProviderComptaTab — L25144-25430)
RÔLE : provider
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Empilement vertical
  - Sub-tabs : Mes Paiements / Mes Comptes

HEADER :
  - KPI row : `className: _isMobile ? "kpi-row cols-2" : "kpi-row cols-5"`
  - Sub-tabs toggle

SECTION 1 — MES COMPTES :
  - Payment method cards : `padding:14px 16px, borderRadius:14`
  - Icônes type de paiement

SECTION 2 — MES PAIEMENTS :
  - 5 KPI cards : `display:grid, gridTemplateColumns:repeat(5,1fr), gap:12`
  - Formulaire déclaration paiement : `gridTemplateColumns:repeat(2,1fr), gap:12`
  - Table historique avec badge LIVE
  - Table liste TX

MODALES :
  - Formulaire déclaration inline (pas modal séparé)

HOVER/INTERACTIONS :
  - Sub-tabs toggle
  - Formulaire submit

RESPONSIVE :
  - `_isMobile` : KPI row 2 cols au lieu de 5

COULEURS :
  - Badge LIVE : couleur accent/success
  - Reste via variables CSS thème

TYPO :
  - Via classes kpi-card héritées


═══════════════════════════════════════════════════════════════════════════════
PAGE 12 : CONFIRMATIONS (Composant: ProviderConfirmations — L55116-55252)
RÔLE : provider
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - Rendu conditionnel : uniquement quand des confirmations pending existent
  - Liste de cartes de confirmation

HEADER :
  - Pas de header dédié, titre implicite

SECTION 1 — CARTES CONFIRMATION :
  - `padding:18, borderRadius:14, background:rgba(59,130,246,0.06), border:1px solid rgba(59,130,246,0.2)`
  - Bouton OUI : `background:#10B981, borderRadius:10, fontWeight:700, fontSize:13, color:white`
  - Bouton NON : `background:#EF4444, borderRadius:10, fontWeight:700, fontSize:13, color:white`

MODALES :
  - InvoiceGeneratorModal déclenché sur confirmation (OUI)

HOVER/INTERACTIONS :
  - Boutons OUI/NON cliquables
  - Confirmation déclenche génération facture

RESPONSIVE :
  - Pas de branchement _isMobile explicite visible

COULEURS :
  - Card bg : `rgba(59,130,246,0.06)` (bleu très léger)
  - Card border : `rgba(59,130,246,0.2)` (bleu)
  - OUI : `#10B981` (vert)
  - NON : `#EF4444` (rouge)

TYPO :
  - Boutons : fontSize 13, fontWeight 700


═══════════════════════════════════════════════════════════════════════════════
PAGE 13 : CHECKLIST MODÈLE (Composant: ModelChecklistTab — L52799-52936)
RÔLE : modele
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `maxWidth:900, margin:0 auto` (centré, largeur max)
  - Empilement : topbar → KPI strip → checklist items

HEADER / TOPBAR :
  - `background:var(--surface), borderBottom:1px solid var(--border), padding:20px 24px, borderRadius:12`
  - Badge completion (pourcentage)

SECTION 1 — KPI STRIP :
  - `display:grid, gridTemplateColumns: _isMobile?"1fr 1fr":"repeat(3,1fr)", gap:16`
  - Cards avec accent bottom border : `borderBottom:3px solid ${borderColor}, borderRadius:12, padding:14px 16px`
  - Barre progression : `height:8, borderRadius:4, background:rgba(255,255,255,0.06)`
  - Fill : `#10b981` (vert)

SECTION 2 — CHECKLIST ITEMS :
  - Items : `padding:16px 20px, borderLeft:4px solid ${checked?"#10b981":"rgba(255,255,255,0.06)"}, borderRadius:12`
  - Checkbox : `width:28, height:28, borderRadius:8, border:2px solid ${checked?"#10b981":"rgba(255,255,255,0.15)"}`
  - Checked : background vert, icône check

MODALES :
  - Aucune

HOVER/INTERACTIONS :
  - Items hover : `borderColor:rgba(139,92,246,0.3), transform:translateY(-1px)`
  - Checkbox toggle au clic

RESPONSIVE :
  - `_isMobile` : KPI strip 2 cols au lieu de 3

COULEURS :
  - Check/done : `#10b981`
  - Unchecked border : `rgba(255,255,255,0.15)`
  - Unchecked left border : `rgba(255,255,255,0.06)`
  - Progress bar bg : `rgba(255,255,255,0.06)`
  - Hover accent : `rgba(139,92,246,0.3)`
  - Surfaces : `var(--surface)`

TYPO :
  - Topbar : hérite thème
  - KPI cards : via inline (padding 14px 16px)


═══════════════════════════════════════════════════════════════════════════════
PAGE 14 : CONTENT MODÈLE (Composant: ModelContentTab — L51875-51995)
RÔLE : modele
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `maxWidth:900, margin:0 auto`
  - Même pattern que Checklist : topbar → week nav → content items

HEADER / TOPBAR :
  - Même style que ModelChecklistTab
  - Navigation semaine : boutons prev/next

SECTION 1 — NAVIGATION SEMAINE :
  - Boutons prev/next avec hover effect
  - Affichage semaine courante

SECTION 2 — CONTENT ITEMS :
  - `borderLeft:4px solid ${statusColor}, borderRadius:12`
  - Couleurs statut :
    - published : `var(--success)`
    - ready : `#10B981`
    - editing : `var(--pink)`
    - shooting : `var(--accent)`
    - pending : `var(--warning)`
  - Bouton upload : disabled, label "coming soon"

MODALES :
  - Aucune

HOVER/INTERACTIONS :
  - Items hover : `transform:translateY(-1px)`
  - Week navigation

RESPONSIVE :
  - Hérite du maxWidth 900 centré

COULEURS :
  - published : `var(--success)` / `#10B981`
  - editing : `var(--pink)` / `#EC4899`
  - shooting : `var(--accent)` / `#8b5cf6`
  - pending : `var(--warning)` / `#f59e0b`

TYPO :
  - Hérite du thème global


═══════════════════════════════════════════════════════════════════════════════
PAGE 15 : TASKS MODÈLE (Composant: ModelTasksTab — L52941-53062)
RÔLE : modele
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `maxWidth:900, margin:0 auto`
  - Même topbar → KPI strip → sections par statut

HEADER / TOPBAR :
  - Même pattern que Checklist/Content

SECTION 1 — KPI STRIP :
  - `gridTemplateColumns: _isMobile?"repeat(2,1fr)":"repeat(4,1fr)"`
  - 4 métriques

SECTION 2 — SECTIONS PAR STATUT :
  - Trois groupes :
    - À faire : couleur `#f59e0b` (ambre)
    - En cours : couleur `#8b5cf6` (violet)
    - Terminées : couleur `#10b981` (vert)
  - Task cards : `padding:14px 20px, borderRadius:12`
  - Bordures priorité :
    - urgent : `rgba(239,68,68,0.25)`
    - high : `rgba(245,158,11,0.2)`
  - Select statut : `background:#131926`

MODALES :
  - Aucune

HOVER/INTERACTIONS :
  - Cards hover : `transform:translateY(-1px)`
  - Select dropdown pour changer statut

RESPONSIVE :
  - `_isMobile` : KPI 2 cols au lieu de 4

COULEURS :
  - À faire : `#f59e0b`
  - En cours : `#8b5cf6`
  - Terminées : `#10b981`
  - Priority urgent : `rgba(239,68,68,0.25)`
  - Priority high : `rgba(245,158,11,0.2)`
  - Select bg : `#131926`

TYPO :
  - Task cards : padding inline, pas de fontSize explicite


═══════════════════════════════════════════════════════════════════════════════
PAGE 16 : PAYMENTS MODÈLE (Composant: ModelPaymentsTab — L52122-52194)
RÔLE : modele
═══════════════════════════════════════════════════════════════════════════════

LAYOUT :
  - `padding: _isMobile ? "0 12px" : 0`
  - KPI row → payment history list

HEADER :
  - Titre implicite

SECTION 1 — KPI ROW :
  - `className: _isMobile ? "kpi-row cols-2" : "kpi-row cols-3"`
  - 3 cartes : Reçu ce mois, Total reçu, En attente

SECTION 2 — HISTORIQUE PAIEMENTS :
  - Payment cards : `borderRadius:12`
  - Icône 💰 dans carré arrondi : `width:40, height:40, borderRadius:10`
  - Status pills : `borderRadius:20, fontSize:10, fontWeight:700`
  - Montants : `fontSize:16, fontWeight:800, color:#10b981`

MODALES :
  - Aucune

HOVER/INTERACTIONS :
  - Cards hover : `transform:translateY(-1px)`

RESPONSIVE :
  - `_isMobile` : KPI 2 cols au lieu de 3, padding 12px

COULEURS :
  - Montants : `#10b981` (vert)
  - Status pills : couleurs contextuelles
  - Surfaces via thème

TYPO :
  - Montants : fontSize 16, fontWeight 800
  - Status pills : fontSize 10, fontWeight 700


═══════════════════════════════════════════════════════════════════════════════
                    PALETTE GLOBALE — RÉCAPITULATIF
═══════════════════════════════════════════════════════════════════════════════

  Accent/Violet :      #8b5cf6 / var(--accent)
  Indigo :             #6366f1
  Light purple :       #c4b5fd
  Accent muted :       #a5b4fc
  Success/Vert :       #10b981 / #10B981 / var(--success)
  Safe gradient :      #10B981 → #059669
  Warning/Ambre :      #f59e0b / #F59E0B / var(--warning)
  Danger/Rouge :       #ef4444 / #EF4444 / var(--danger)
  Orange :             #F97316
  Pink :               #EC4899 / var(--pink)
  Cyan :               #06b6d4
  Slate :              #64748b
  Or médaille :        #FFD700
  Argent médaille :    #C0C0C0
  Bronze médaille :    #CD7F32
  Dark backgrounds :   #1a2035, #0e1420, #131926, #2d3250
  Overlay :            rgba(0,0,0,0.6), rgba(0,0,0,0.5), rgba(0,0,0,0.35)
  Surfaces CSS :       var(--surface), var(--surface2), var(--card-bg), var(--bg-base), var(--bg-overlay), var(--bg-raised), var(--bg2)
  Borders CSS :        var(--border), var(--border-subtle), var(--border-default), var(--border-ds)
  Text CSS :           var(--text), var(--muted), var(--text-tertiary)

═══════════════════════════════════════════════════════════════════════════════
                    TYPOGRAPHIE GLOBALE — RÉCAPITULATIF
═══════════════════════════════════════════════════════════════════════════════

  Font families :      'DM Sans', sans-serif (body)
                       'Inter', sans-serif (messagerie header)
                       'Space Mono', monospace (scan checker score)

  Poids récurrents :   400 (body), 500 (tags), 600 (labels, pills), 700 (badges, boutons), 800 (titres, valeurs KPI), 900 (facture)

  Tailles récurrentes :
    10px : tags, KPI labels, status pills
    11px : scope badges, filter pills, toggle buttons
    12px : table cells, chart toggles, KPI labels MC
    13px : search inputs, boutons action, messages stub
    16px : sous-titres, montants, action buttons scan
    18px : KPI values compta
    20px : titres pages, facture header, score scan
    22px : titres h2 stubs MC
    24px : KPI values spenders, messagerie header
    28px : KPI values MC dashboard

═══════════════════════════════════════════════════════════════════════════════
                    PATTERN HOVER GLOBAL
═══════════════════════════════════════════════════════════════════════════════

  Pattern dominant : `transform:translateY(-1px)` sur hover (Checklist, Content, Tasks, Payments)
  Accent border hover : `borderColor:#8b5cf6` (dashboard model cards)
  Warning border hover : `borderColor:#f59e0b` (dashboard TX cards)
  Checklist hover : `borderColor:rgba(139,92,246,0.3)`

═══════════════════════════════════════════════════════════════════════════════
                    RESPONSIVE GLOBAL
═══════════════════════════════════════════════════════════════════════════════

  Variable : `_isMobile` (globale)
  Pattern grilles : cols réduites (6→2, 5→2, 4→2, 3→2, 2-col→1-col)
  Pattern padding : ajout `0 12px` latéral en mobile
  Pattern auto-fit : certaines grilles utilisent minmax + auto-fit sans branchement _isMobile
  Messagerie : 2 colonnes (300px 1fr) → 1 colonne
  Scan Checker : 2 colonnes → 1 colonne

═══════════════════════════════════════════════════════════════════════════════
                    FIN DE L'AUDIT
═══════════════════════════════════════════════════════════════════════════════


═══════════════════════════════════════════════════════════════════════════════
              PARTIE E — COMPOSANTS TRANSVERSAUX
═══════════════════════════════════════════════════════════════════════════════

# AUDIT VISUEL & DESIGN -- COMPOSANTS TRANSVERSAUX DADASH CRM

Fichier unique : `/home/user/dadash-crm/index.html`

---


═══════════════════════════════════════════════════════════════
ÉLÉMENT 1 : SIDEBAR GÉRANT (Lignes 62884-62931)
═══════════════════════════════════════════════════════════════

STRUCTURE :
  <div class="sidebar sidebar-desktop"> avec style inline transform/transition
  - Flex column, gap: 2px, padding: 16px 10px
  - 3 sections thématiques séparées par <div class="s-sec">
  - Footer séparé via <div class="s-footer"> après un <div class="s-spacer"/>
  - Transition sidebar: transform translateX(0) / translateX(-100%), 0.25s ease

CONTENU (items dans l'ordre) :
  SECTION "PRINCIPAL" :
    📊 Dashboard          (tab="dashboard")
    👤 Spenders           (tab="business", subTab="spenders")  + badge pendingTxCount
    💳 Transactions       (tab="business", subTab="transactions")

  SECTION "ÉQUIPE" :
    👥 Chatters           (tab="equipe", subTab="chatters")
    ✈️ Modèles            (tab="equipe", subTab="modeles")
    🏛️ Providers          (tab="equipe", subTab="providers")
    📦 Catalogue          (tab="equipe", subTab="catalogue")

  SECTION "FINANCE & IA" :
    💰 Comptabilité       (tab="compta")
    🧠 IA Insights        (tab="bots", subTab="ia_insights")

  FOOTER (après spacer) :
    ✈️ Messagerie         (tab="messagerie")  + badge escalationCount
    ⚙️ Paramètres         (tab="admin")

BADGES :
  - Spenders : pendingTxCount > 0 → affiche pendingTxCount (cap 99+)
  - Messagerie : escalationCount > 0 → affiche escalationCount (cap 9+)

STYLES (CSS classes, lignes 904-979) :
  .sidebar :
    width: 220px
    background: var(--sidebar)
    border-right: 1px solid var(--border-ds)
    display: flex; flex-direction: column
    padding: 16px 10px
    gap: 2px
    overflow-y: auto; flex-shrink: 0
    scrollbar-width: none (scrollbar caché)

  .s-sec (section label, L917-926) :
    font-family: 'Space Mono', monospace
    font-size: 9px; font-weight: 700
    color: var(--dim-ds)
    letter-spacing: 0.18em
    text-transform: uppercase
    padding: 12px 10px 5px
    margin-top: 4px (0 si :first-child)

  .s-item (nav item, L928-942) :
    display: flex; align-items: center; gap: 10px
    padding: 9px 10px
    border-radius: 10px
    font-size: 13px
    font-family: 'DM Sans', sans-serif
    font-weight: 500
    color: var(--muted-ds)
    cursor: pointer
    transition: all 0.15s
    border: 1px solid transparent
    position: relative; user-select: none; flex-shrink: 0

  .s-ico (L961-966) :
    font-size: 16px; width: 20px; text-align: center; flex-shrink: 0

  .s-badge (L967-977) :
    margin-left: auto
    min-width: 18px; height: 18px; padding: 0 4px
    border-radius: 9px
    background: var(--red-c)
    color: #fff
    font-size: 10px; font-weight: 800
    display: flex; align-items: center; justify-content: center; line-height: 1

  .s-spacer (L978) : flex: 1
  .s-footer (L979) : padding: 10px 0 4px; border-top: 1px solid var(--border-ds)

HOVER/ACTIVE :
  .s-item:hover (L944-947) :
    background: rgba(255,255,255,0.05)
    color: rgba(255,255,255,0.75)

  .s-item.active (L948-952) :
    background: var(--accent-s)
    color: #a5b4fc
    border-color: rgba(99,102,241,0.18)

  .s-item.active::before (L953-960) :
    Barre verticale gauche :
    position: absolute; left: 0; top: 50%; transform: translateY(-50%)
    width: 3px; height: 20px
    background: var(--accent-c)
    border-radius: 0 3px 3px 0

  Overrides indigo-clair (L725-736) :
    .s-item → color: rgba(255,255,255,0.65)
    .s-item:hover → color: rgba(255,255,255,0.90), background: rgba(129,140,248,0.12)
    .s-item.active → background: rgba(129,140,248,0.20), color: #c7d2fe, border-color: rgba(129,140,248,0.35)

RESPONSIVE :
  Tablet (769-1024px, L2876) : width: 200px; padding: 12px 8px
  Mobile (<768px, L2946) : .sidebar-desktop { display: none !important; }



═══════════════════════════════════════════════════════════════
ÉLÉMENT 1bis : SIDEBAR ADMIN (Lignes 62932-62939)
═══════════════════════════════════════════════════════════════

STRUCTURE : Même <div class="sidebar sidebar-desktop">
CONTENU :
  SECTION "ADMIN" :
    🔑 Admin (tab="admin")
  + <div class="s-spacer"/>

NOTE : Visible uniquement pour isAdminUser(user) && !isGerant



═══════════════════════════════════════════════════════════════
ÉLÉMENT 2 : SIDEBAR CHATTER (Lignes 62940-62975)
═══════════════════════════════════════════════════════════════

STRUCTURE : Identique (sidebar sidebar-desktop), items ont classe "s-item chatter"

CONTENU :
  SECTION "MON ESPACE" :
    📊 Dashboard           (tab="chatter_dashboard")
    👤 Mes Spenders        (tab="chatter_spenders")
    💬 Messagerie          (tab="messagerie")  + badge unreadCount (cap 9+)

  SECTION "TRANSACTIONS" :
    💳 Mes Transactions    (tab="chatter_transactions")

  SECTION "FINANCES" :
    💰 Ma Commission       (tab="chatter_compta")
    🏆 Compétition         (tab="chatter_competition")

  FOOTER :
    🔍 Vérifier Screen     (tab="chatter_scan")
    🔔 Notifications       (tab="chatter_notif")  + badge unreadCount (cap 9+)

STYLES SPÉCIFIQUES :
  .s-item.active.chatter::before (L1180) :
    background: #f59e0b !important   (barre active AMBER au lieu d'indigo)



═══════════════════════════════════════════════════════════════
ÉLÉMENT 3 : SIDEBAR MANAGER CHATTER (Lignes 62976-63008)
═══════════════════════════════════════════════════════════════

STRUCTURE : Identique, items "s-item chatter"

CONTENU :
  SECTION "SUPERVISION" :
    📊 Dashboard        (tab="mc_dashboard")        — Unicode \u{1F4CA}
    👥 Mes Chatters     (tab="mc_chatters")          — Unicode \u{1F465}
    💬 Conversations    (tab="mc_conversations")     — Unicode \u{1F4AC}
       + badge mcUnreadConvCount (cap 9+)

  SECTION "GESTION" :
    💰 Transactions     (tab="mc_transactions")      — Unicode \u{1F4B0}
       + badge mcPendingTxCount (cap 9+)
    📅 Planning         (tab="mc_planning")          — Unicode \u{1F4C5}

  SECTION "FINANCES" :
    💎 Mon Solde        (tab="mc_solde")             — Unicode \u{1F48E}

  FOOTER :
    ⚙️ Paramètres       (tab="mc_parametres")        — Unicode \u2699\uFE0F

STYLES : Barre active identique chatter → #f59e0b (amber)



═══════════════════════════════════════════════════════════════
ÉLÉMENT 4 : SIDEBAR MODÈLE (Lignes 63009-63036)
═══════════════════════════════════════════════════════════════

STRUCTURE : Identique, items "s-item modele"

CONTENU :
  SECTION "MON ESPACE" :
    ✅ Ma Checklist      (tab="model_checklist")
    📦 Mon Contenu       (tab="model_content")
    📋 Mes Tâches        (tab="model_tasks")

  SECTION "FINANCES" :
    💰 Mes Paiements     (tab="model_payments")
    📄 Ma Compta         (tab="model_compta")

  FOOTER :
    🔔 Notifications     (tab="model_notif")  + badge unreadCount (cap 9+)

STYLES SPÉCIFIQUES :
  .s-item.active.modele::before (L1181) :
    background: #ec4899 !important   (barre active PINK)



═══════════════════════════════════════════════════════════════
ÉLÉMENT 5 : SIDEBAR PROVIDER (Lignes 63037-63058)
═══════════════════════════════════════════════════════════════

STRUCTURE : Identique, items "s-item provider"

CONTENU :
  SECTION "MON ESPACE" :
    📊 Dashboard         (tab="provider_dashboard")
    💳 Mes Transactions  (tab="transactions")

  SECTION "FINANCES" :
    💸 Mes Paiements     (tab="provider_compta")

  FOOTER :
    🔔 Notifications     (tab="provider_notif")  + badge unreadCount (cap 9+)

STYLES SPÉCIFIQUES :
  .s-item.active.provider::before (L1182) :
    background: #10b981 !important   (barre active GREEN)



═══════════════════════════════════════════════════════════════
ÉLÉMENT 6 : MOBILE BOTTOM BAR (Lignes 63080-63120)
═══════════════════════════════════════════════════════════════

STRUCTURE :
  <nav class="mobile-bottom-bar">
  - Gérant : MOBILE_BOTTOM_NAV.map() + bouton "Plus" (hamburger)
  - Non-gérant : Nav spécifique au rôle + bouton "Plus"
  - Hidden par défaut (display:none, L2866), visible < 768px

CONTENU GÉRANT (MOBILE_BOTTOM_NAV, L8482-8488) :
  [D] Dash        — icône = <span> custom (bg #6C63FF, color white, bold, borderRadius 6px, padding 2px 6px, fontSize 14px)
  💵 Business     — avec badge pendingTxCount (bg: var(--warning), color: #000)
  👥 Équipe
  ✈️ Messagerie
  🏦 Compta
  + Bouton "Plus" : icône ☰ (ouvert: ✕)
    → badge escalationCount (bg: var(--danger), color: #fff)

CONTENU CHATTER (L8101) :
  📊 Dash | 👤 Spenders | 💳 TX | 💬 Msgs | 💰 Compta | + Plus

CONTENU MANAGER CHATTER :
  📊 Dash | 👥 Chatters | 💰 TX | 💬 Convs | 📅 Planning | + Plus

CONTENU MODÈLE :
  ✅ Checklist | 📦 Contenu | 📋 Tâches | 💰 Paiements | + Plus

CONTENU PROVIDER :
  📊 Dash | 💳 TX | 💸 Paiements | + Plus

Non-gérant : style inline supplémentaire :
  overflowX: auto, WebkitOverflowScrolling: touch, flexWrap: nowrap,
  justifyContent: flex-start, gap: 0, padding: 0 4px
  Boutons: flexShrink: 0, minWidth: 56

STYLES CSS (L2954-3009) :
  .mobile-bottom-bar :
    display: flex !important (en @media max-width:768px)
    position: fixed; bottom: 0; left: 0; right: 0
    height: 64px; z-index: 100
    background: #10101C
    border-top: 1px solid var(--border-default)
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px)
    justify-content: space-around; align-items: stretch; padding: 0
    padding-bottom: env(safe-area-inset-bottom, 0px)

  .mobile-bottom-btn (L2967-2980) :
    display: flex; flex-direction: column; align-items: center; justify-content: center
    flex: 1; background: none; border: none
    color: var(--text-tertiary)
    font-size: 11px; font-weight: 500; cursor: pointer
    font-family: 'DM Sans', sans-serif
    transition: all 0.15s ease; position: relative; gap: 2px; padding: 6px 0

  .mobile-bottom-btn:active : transform: scale(0.92)
  .mobile-bottom-btn.active : color: var(--accent)
  .mobile-bottom-btn.active .mobile-bottom-icon : transform: scale(1.1)

  .mobile-bottom-icon (L2988-2992) :
    font-size: 22px; line-height: 1; transition: transform 0.15s ease

  .mobile-bottom-label (L2993-2999) :
    font-size: 10px; font-weight: 600; letter-spacing: 0.2px; line-height: 1; margin-top: 2px

  .mobile-bottom-badge (L3000-3009) :
    position: absolute; top: 4px; right: 50%; transform: translateX(14px)
    font-size: 9px; font-weight: 700; padding: 1px 5px
    border-radius: 8px; min-width: 16px; text-align: center; line-height: 14px

RESPONSIVE :
  @media max-width:390px (L3362-3364) :
    height: 56px; icon font-size: 18px; label font-size: 9px
  @media max-width:340px (L3445-3447) :
    height: 52px; icon font-size: 16px; label font-size: 8px
  @media max-width:768px (L3492-3495) :
    backdrop-filter: blur(8px) !important (réduit pour performance)



═══════════════════════════════════════════════════════════════
ÉLÉMENT 7 : FAB (Floating Action Button) (Lignes 63495-63514, CSS L1066-1074)
═══════════════════════════════════════════════════════════════

STRUCTURE :
  Visible pour : isGerant || user.role === "chatter"
  - Backdrop quand ouvert : position: fixed; inset: 0; background: rgba(0,0,0,0.5); zIndex: 9998; backdropFilter: blur(2px)
  - <div class="fab-wrap">
      [si ouvert] <div class="fab-menu"> avec fab-actions
      <button class="fab-btn"> "+" (rotate(45deg) quand ouvert → devient "×")
    </div>

CONTENU FAB_ACTIONS_GERANT (L8529-8537) :
  💰 "Créer Transaction"   color: #10B981
  👤 "Nouveau Spender"     color: #3B82F6
  📸 "Vérifier Screen"     color: #F59E0B
  💬 "Nouveau Push"        color: #8B5CF6
  ✅ "Créer une Todo"      color: #10B981
  💸 "Créer une Dépense"   color: #EF4444
  💸 "Paiement Interne"    color: #6366F1

CONTENU FAB_ACTIONS_CHATTER (L8538-8541) :
  💰 "Créer Transaction"   color: #10B981
  📸 "Vérifier Screen"     color: #F59E0B

  Chaque action : icône dans un cercle 36x36, borderRadius 50%, background: ${color}20

STYLES CSS :
  .fab-wrap (L1066) :
    position: fixed; bottom: 32px; right: 32px; z-index: 9999
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px

  .fab-btn (L1067) :
    width: 56px; height: 56px; border-radius: 50%
    background: var(--accent); border: none; color: #fff; font-size: 28px
    cursor: pointer
    box-shadow: 0 4px 20px rgba(139,92,246,0.4)
    display: flex; align-items: center; justify-content: center
    transition: all 0.3s ease

  .fab-btn:hover (L1068) :
    background: var(--accent-hover); transform: scale(1.05)

  .fab-menu (L1069) :
    display: flex; flex-direction: column; gap: 6px

  .fab-action (L1070) :
    width: 220px; padding: 12px 16px
    background: var(--surface); border: 1px solid var(--border)
    border-radius: 12px; color: var(--text)
    font-size: 14px; font-weight: 500; cursor: pointer
    display: flex; align-items: center; gap: 12px
    transition: all 0.2s ease
    font-family: 'DM Sans', sans-serif
    opacity: 0; transform: translateY(10px)
    animation: fabSlideUp 0.3s ease forwards
    → animationDelay calculé : (count - 1 - index) * 50ms

  .fab-action:hover (L1071) :
    background: var(--bg-hover)
    + JS hover : borderColor = action.color

  Animation fabSlideUp (L1072) :
    from { opacity: 0; translateY(10px) } → to { opacity: 1; translateY(0) }

RESPONSIVE :
  @media max-width:768px (L1074) :
    .fab-wrap { bottom: 80px }
    .fab-action { width: auto; left: 16px; right: 16px }
  Mobile override (L3284-3301) :
    .fab-btn : position: fixed; bottom: 80px; right: 16px
    width: 54px; height: 54px; font-size: 22px
    background: var(--grad)
    box-shadow: 0 4px 20px rgba(139,92,246,0.5); z-index: 90
    :active → transform: scale(0.9); box-shadow: 0 2px 10px rgba(139,92,246,0.6)
  @media max-width:340px (L3427-3428) :
    .fab-btn : bottom: 72px; right: 12px; width: 48px; height: 48px; font-size: 20px



═══════════════════════════════════════════════════════════════
ÉLÉMENT 8 : NOTIFICATIONS BELL + DROPDOWN (Lignes 63227-63291, composant L51239-51318)
═══════════════════════════════════════════════════════════════

STRUCTURE DESKTOP (L63228-63248) :
  <div style="position:relative">
    <div class="tb-notif" onClick> 🔔
      [si unreadCount > 0] <span class="tb-badge">{unreadCount (cap 99+)}</span>
    </div>
    [si showNotifs]
      <div> backdrop (position:fixed inset:0 zIndex:2999)
      <div class="notif-dropdown-panel"> panel principal
  </div>

STRUCTURE MOBILE (L63280-63291) :
  Position: fixed; top: 56px; right: 8px; left: 8px; maxHeight: 70vh
  Mêmes styles que desktop sauf full-width

STYLES tb-notif (L1200-1210) :
  position: relative; width: 32px; height: 32px
  display: flex; align-items: center; justify-content: center
  cursor: pointer; border-radius: 8px
  border: 1px solid transparent; transition: all 0.15s; font-size: 16px
  :hover → background: rgba(255,255,255,0.05); border-color: var(--border-ds)
  Quand ouvert (inline) : background: var(--accent-s)

STYLES tb-badge (L1211-1220) :
  position: absolute; top: -4px; right: -4px
  min-width: 16px; height: 16px; border-radius: 8px
  background: #ef4444; color: #fff
  font-size: 9px; font-weight: 800
  display: flex; align-items: center; justify-content: center; padding: 0 3px

DROPDOWN PANEL (inline styles, L63236) :
  position: absolute; top: 48px; right: 0
  width: 420px; maxHeight: 560px
  background: var(--bg-raised)
  border: 1px solid var(--border-default)
  borderRadius: 16px
  boxShadow: 0 20px 60px rgba(0,0,0,0.35)
  overflow: hidden; zIndex: 3000
  display: flex; flexDirection: column

DROPDOWN HEADER (L63237-63243) :
  padding: 14px 18px; borderBottom: 1px solid var(--border-subtle)
  background: var(--bg-overlay); flexShrink: 0
  Titre : "🔔 Notifications" — fontSize: 15px; fontWeight: 800
  Badge unread : padding: 2px 8px; borderRadius: 8; bg: #EF444420; color: #EF4444; fontSize: 10; fontWeight: 700
  Bouton "Mark all read" : fontSize: 11; color: var(--accent); fontWeight: 700; bg: var(--accent-muted); borderRadius: 8; padding: 4px 12px

NotifDropdownBody (L51303-51318) :
  - Onglets catégories (payment/tx/spender) : pills avec
    padding: 4px 12px; borderRadius: 16; fontSize: 11
    Actif : border var(--accent); bg var(--accent-muted); color var(--accent); fontWeight: 700
    Inactif : border var(--border-default); bg transparent; color var(--text-secondary); fontWeight: 500
  - Badge par catégorie : minWidth: 16; height: 16; borderRadius: 8; fontSize: 9; fontWeight: 800
    Actif : bg var(--accent); Inactif : bg #EF4444

RESPONSIVE MOBILE (L3465-3473) :
  .notif-dropdown-panel :
    position: fixed !important; top: 48px !important
    left: 8px !important; right: 8px !important; width: auto !important
    borderRadius: 12px !important



═══════════════════════════════════════════════════════════════
ÉLÉMENT 9 : LOGIN PAGE (Lignes 28943-29037, CSS L805-894)
═══════════════════════════════════════════════════════════════

STRUCTURE :
  <div class="login-wrap">
    <div class="login-orb login-orb-1"/>    — décoration haut-gauche
    <div class="login-orb login-orb-2"/>    — décoration bas-droite
    <select class="lang-toggle">            — sélecteur de langue (position: absolute top:20 right:20)
    <div class="login-card">
      <div class="login-logo">D</div>
      <div class="login-title">DADASH</div>
      <div class="login-subtitle">Pushy Team</div>
      <div class="form-group">
        <label class="form-label">{email}</label>
        <input class="form-input" type="email" placeholder="nom@pushyteam.com"/>
      </div>
      <div class="form-group">
        <label class="form-label">{password}</label>
        <input class="form-input" type="password" placeholder="********"/>
      </div>
      <button class="btn btn-primary">{login_btn}</button>
      [si error] <div class="error-msg">{error}</div>
      <div> version + date (fontSize:10, color:#6B7280)
    </div>
  </div>

STYLES :
  .login-wrap (L805-809) :
    display: flex; align-items: center; justify-content: center
    height: 100vh; background: var(--bg-base)
    position: relative; overflow: hidden

  .login-orb (L810-813) :
    position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.1
  .login-orb-1 (L814) : 300x300px; background: var(--accent); top: -100px; left: -100px
  .login-orb-2 (L815) : 300x300px; background: var(--pink); bottom: -100px; right: -100px

  .login-card (L816-823) :
    background: var(--card-bg)
    border: 1px solid var(--card-border)
    border-radius: var(--radius-lg); padding: 40px
    width: 100%; max-width: 400px
    box-shadow: var(--shadow-lg)
    position: relative; z-index: 1

  .login-logo (L824-832) :
    width: 60px; height: 60px
    background: var(--grad)
    border-radius: var(--radius-md)
    display: flex; align-items: center; justify-content: center
    font-size: 28px; font-weight: bold
    margin: 0 auto 20px
    box-shadow: 0 4px 15px rgba(139,92,246,0.25)

  .login-title (L833-836) :
    text-align: center; font-size: 24px; font-weight: 700
    margin-bottom: 10px; color: var(--text-primary)

  .login-subtitle (L837-840) :
    text-align: center; color: var(--text-secondary); font-size: 13px
    margin-bottom: 30px

  .form-group (L841) : margin-bottom: 16px
  .form-label (L842-845) :
    display: block; font-size: 12px; font-weight: 600
    color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase

  .form-input (L846-860) :
    width: 100%; padding: 10px 12px
    background: var(--input-bg); border: 1px solid var(--input-border)
    border-radius: var(--radius-sm); color: var(--input-color); font-size: 13px
    transition: all 0.2s
    :focus → outline: none; border-color: var(--input-focus-border); box-shadow: 0 0 0 3px var(--input-focus-ring)
    ::placeholder → color: var(--text-tertiary)

  .btn (L861-871) :
    padding: 10px 16px; border: none; border-radius: var(--radius-sm)
    font-size: 13px; font-weight: 600; cursor: pointer
    transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.5px

  .btn-primary (L872-881) :
    background: var(--accent); color: white; width: 100%; margin-top: 10px
    :hover → background: var(--accent-hover); box-shadow: 0 4px 12px rgba(139,92,246,0.25)

  .lang-toggle (L883-894) :
    position: absolute; top: 20px; right: 20px
    background: var(--accent-subtle); border: 1px solid var(--border-default)
    padding: 6px 12px; border-radius: var(--radius-sm)
    color: var(--text-primary); font-size: 12px; cursor: pointer
    :hover → background: var(--accent-muted)
    (inline override) : bg rgba(255,255,255,0.08); border rgba(255,255,255,0.12); borderRadius 10; color #fff

RESPONSIVE :
  @media max-width:768px (L3196-3205) :
    .login-wrap : padding: 16px
    .login-card : padding: 24px 20px; max-width: 100%; border-radius: 20px
    .login-logo : 50x50; fontSize: 22px; margin-bottom: 16px
    .login-title : fontSize: 20px; margin-bottom: 6px
    .login-subtitle : fontSize: 12px; margin-bottom: 20px
  @media max-width:390px (L3349) : .login-card padding: 20px 16px
  @media max-width:360px (L3412-3415) :
    .login-card : padding 16px 12px; borderRadius 10px
    .login-logo : 44x44; fontSize 18px; borderRadius 10px
    .login-title : fontSize 18px
    .login-subtitle : fontSize 11px; margin-bottom 16px
  @media max-width:340px (L3450) : .login-card padding 14px 10px; form-input fontSize 16px



═══════════════════════════════════════════════════════════════
ÉLÉMENT 10 : THEME "light" (Lignes 382-526)
═══════════════════════════════════════════════════════════════

[data-theme="light"] — TOUTES LES CSS VARIABLES :

┌──────────────────────────────────┬──────────────────────────────────────────────┐
│ Variable                         │ Valeur                                       │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ --bg-base                        │ #f8fafc                                      │
│ --bg-raised                      │ #ffffff                                      │
│ --bg-overlay                     │ #f1f5f9                                      │
│ --bg-surface                     │ #e2e8f0                                      │
│ --bg-hover                       │ #f1f5f9                                      │
│ --bg-active                      │ #e2e8f0                                      │
│ --bg-primary                     │ #f8fafc                                      │
│ --bg-secondary                   │ #ffffff                                      │
│ --bg-tertiary                    │ #f1f5f9                                      │
│ --bg-card                        │ #ffffff                                      │
│ --bg-input                       │ #e2e8f0                                      │
│ --bg-modal                       │ #ffffff                                      │
│ --bg-sidebar                     │ #f1f5f9                                      │
│ --bg-topbar                      │ rgba(241,245,249,0.95)                       │
│ --bg-table-header                │ #f1f5f9                                      │
│ --bg-table-row-hover             │ #f8fafc                                      │
│ --bg-table-row-alt               │ #fafafa                                      │
│ --border-subtle                  │ rgba(0,0,0,0.06)                             │
│ --border-default                 │ rgba(0,0,0,0.08)                             │
│ --border-strong                  │ rgba(0,0,0,0.14)                             │
│ --border-accent                  │ rgba(79,70,229,0.3)                          │
│ --border-color                   │ rgba(0,0,0,0.08)                             │
│ --border-light                   │ rgba(0,0,0,0.06)                             │
│ --border-medium                  │ rgba(0,0,0,0.14)                             │
│ --border-input                   │ rgba(0,0,0,0.12)                             │
│ --border-input-focus             │ rgba(79,70,229,0.4)                          │
│ --text-primary                   │ #0f172a                                      │
│ --text-secondary                 │ #475569                                      │
│ --text-tertiary                  │ #64748b                                      │
│ --text-quaternary                │ #94a3b8                                      │
│ --text-muted                     │ #64748b                                      │
│ --text-accent                    │ #4f46e5                                      │
│ --color-text                     │ #0f172a                                      │
│ --color-text-muted               │ #475569                                      │
│ --accent                         │ #4f46e5                                      │
│ --accent-hover                   │ #4338ca                                      │
│ --accent-muted                   │ rgba(79,70,229,0.08)                         │
│ --accent-subtle                  │ rgba(79,70,229,0.04)                         │
│ --accent-light                   │ rgba(79,70,229,0.08)                         │
│ --accent-lighter                 │ rgba(79,70,229,0.04)                         │
│ --accent-glow                    │ rgba(79,70,229,0.15)                         │
│ --primary                        │ #4f46e5                                      │
│ --primary-hover                  │ #4338ca                                      │
│ --success                        │ #059669                                      │
│ --success-muted                  │ rgba(5,150,105,0.08)                         │
│ --success-bg                     │ rgba(5,150,105,0.08)                         │
│ --success-border                 │ rgba(5,150,105,0.2)                          │
│ --warning                        │ #d97706                                      │
│ --warning-muted                  │ rgba(217,119,6,0.08)                         │
│ --warning-bg                     │ rgba(217,119,6,0.08)                         │
│ --warning-border                 │ rgba(217,119,6,0.2)                          │
│ --danger                         │ #dc2626                                      │
│ --danger-muted                   │ rgba(220,38,38,0.08)                         │
│ --danger-bg                      │ rgba(220,38,38,0.08)                         │
│ --danger-border                  │ rgba(220,38,38,0.2)                          │
│ --info                           │ #3b82f6                                      │
│ --info-bg                        │ rgba(59,130,246,0.08)                        │
│ --pink                           │ #db2777                                      │
│ --pink-muted                     │ rgba(219,39,119,0.08)                        │
│ --brand-whatsapp                 │ #25D366                                      │
│ --brand-whatsapp-muted           │ rgba(37,211,102,0.12)                        │
│ --brand-telegram                 │ #0088cc                                      │
│ --brand-telegram-muted           │ rgba(0,136,204,0.12)                         │
│ --blue-accent                    │ #3b82f6                                      │
│ --blue-accent-muted              │ rgba(59,130,246,0.08)                        │
│ --medal-silver                   │ #9ca3af                                      │
│ --medal-bronze                   │ #b45309                                      │
│ --purple                         │ #4f46e5                                      │
│ --purple-light                   │ #6366f1                                      │
│ --purple-glow                    │ rgba(79,70,229,0.12)                         │
│ --purple-bg                      │ rgba(79,70,229,0.08)                         │
│ --purple-border                  │ rgba(79,70,229,0.2)                          │
│ --bg                             │ #f8fafc                                      │
│ --bg2                            │ #ffffff                                      │
│ --bg3                            │ #f1f5f9                                      │
│ --card                           │ #ffffff                                      │
│ --text                           │ #0f172a                                      │
│ --text2                          │ #475569                                      │
│ --grad                           │ linear-gradient(135deg, #4f46e5, #4338ca)    │
│ --shadow-sm                      │ 0 1px 2px rgba(0,0,0,0.05)                  │
│ --shadow-md                      │ 0 4px 12px rgba(0,0,0,0.08)                 │
│ --shadow-lg                      │ 0 8px 24px rgba(0,0,0,0.12)                 │
│ --sidebar-bg                     │ var(--bg-sidebar)                            │
│ --sidebar                        │ #f1f5f9                                      │
│ --sidebar-border                 │ var(--border-subtle)                         │
│ --sidebar-btn-color              │ var(--text-secondary)                        │
│ --sidebar-btn-hover-bg           │ var(--bg-hover)                              │
│ --sidebar-btn-hover-color        │ var(--text-primary)                          │
│ --sidebar-btn-active-bg          │ var(--accent-muted)                          │
│ --sidebar-btn-active-color       │ var(--accent)                                │
│ --topbar-bg                      │ var(--bg-topbar)                             │
│ --topbar-border                  │ var(--border-subtle)                         │
│ --card-bg                        │ var(--bg-card)                               │
│ --card-border                    │ var(--border-default)                        │
│ --card-hover-border              │ var(--border-strong)                         │
│ --table-header-bg                │ var(--bg-table-header)                       │
│ --table-header-color             │ var(--text-secondary)                        │
│ --table-row-hover                │ var(--bg-table-row-hover)                    │
│ --table-border                   │ var(--border-subtle)                         │
│ --modal-backdrop                 │ rgba(0,0,0,0.35)                             │
│ --modal-bg                       │ var(--bg-modal)                              │
│ --input-bg                       │ var(--bg-input)                              │
│ --input-border                   │ var(--border-input)                          │
│ --input-focus-border             │ var(--accent)                                │
│ --input-focus-ring               │ rgba(79,70,229,0.12)                         │
│ --input-color                    │ var(--text-primary)                          │
│ --chip-bg                        │ #e2e8f0                                      │
│ --chip-border                    │ rgba(0,0,0,0.08)                             │
│ --chip-color                     │ #64748b                                      │
│ --chip-active-bg                 │ #4f46e5                                      │
│ --chip-active-border             │ #4f46e5                                      │
│ --chip-active-color              │ #ffffff                                      │
│ --surface                        │ #ffffff                                      │
│ --surface2                       │ #f1f5f9                                      │
│ --border                         │ rgba(0,0,0,0.08)                             │
│ --border2                        │ rgba(0,0,0,0.05)                             │
│ --muted                          │ #64748b                                      │
│ --muted2                         │ #94a3b8                                      │
│ --green                          │ #059669                                      │
│ --red                            │ #dc2626                                      │
│ --gold                           │ #d97706                                      │
│ --blue                           │ #3b82f6                                      │
│ --cyan                           │ #0891b2                                      │
│ --kpi-active-bg                  │ rgba(79,70,229,0.06)                         │
│ --kpi-active-border              │ rgba(79,70,229,0.2)                          │
│ --kpi-active-top                 │ #4f46e5                                      │
│ --scrollbar-thumb                │ rgba(79,70,229,0.2)                          │
│ --scrollbar-track                │ transparent                                  │
│ --border-ds                      │ rgba(0,0,0,0.08)                             │
│ --border2-ds                     │ rgba(0,0,0,0.12)                             │
│ --border3-ds                     │ rgba(0,0,0,0.18)                             │
│ --text-ds                        │ #0f172a                                      │
│ --muted-ds                       │ #64748b                                      │
│ --dim-ds                         │ #94a3b8                                      │
│ --accent-c                       │ #4f46e5                                      │
│ --accent-s                       │ rgba(79,70,229,0.08)                         │
│ --accent-b                       │ rgba(79,70,229,0.2)                          │
│ --green-c                        │ #059669                                      │
│ --gs                             │ rgba(5,150,105,0.08)                         │
│ --gb                             │ rgba(5,150,105,0.18)                         │
│ --amber                          │ #d97706                                      │
│ --ams                            │ rgba(217,119,6,0.08)                         │
│ --amb                            │ rgba(217,119,6,0.18)                         │
│ --red-c                          │ #dc2626                                      │
│ --rs                             │ rgba(220,38,38,0.06)                         │
│ --rb                             │ rgba(220,38,38,0.14)                         │
│ --pink-c                         │ #db2777                                      │
│ --r                              │ 14px                                         │
│ --r-sm                           │ 9px                                          │
└──────────────────────────────────┴──────────────────────────────────────────────┘



═══════════════════════════════════════════════════════════════
ÉLÉMENT 11 : THEME "indigo-clair" (Lignes 528-698)
═══════════════════════════════════════════════════════════════

[data-theme="indigo-clair"] — TOUTES LES CSS VARIABLES :

┌──────────────────────────────────┬──────────────────────────────────────────────┐
│ Variable                         │ Valeur                                       │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ --bg-base                        │ #090b13                                      │
│ --bg-raised                      │ #111827                                      │
│ --bg-overlay                     │ #1a2540                                      │
│ --bg-surface                     │ #1e2a46                                      │
│ --bg-hover                       │ #1e2a46                                      │
│ --bg-active                      │ #243255                                      │
│ --bg-primary                     │ #090b13                                      │
│ --bg-secondary                   │ #111827                                      │
│ --bg-tertiary                    │ #1a2540                                      │
│ --bg-card                        │ #111827                                      │
│ --bg-input                       │ #141e33                                      │
│ --bg-modal                       │ #0d1120                                      │
│ --bg-sidebar                     │ #0b0f1e                                      │
│ --bg-topbar                      │ #0f1523                                      │
│ --bg-table-header                │ #141e33                                      │
│ --bg-table-row-hover             │ #1a2540                                      │
│ --bg-table-row-alt               │ #101724                                      │
│ --border-subtle                  │ rgba(99,102,241,0.18)                        │
│ --border-default                 │ rgba(99,102,241,0.30)                        │
│ --border-strong                  │ rgba(99,102,241,0.50)                        │
│ --border-accent                  │ rgba(129,140,248,0.70)                       │
│ --border-color                   │ rgba(99,102,241,0.25)                        │
│ --border-light                   │ rgba(99,102,241,0.18)                        │
│ --border-medium                  │ rgba(99,102,241,0.35)                        │
│ --border-input                   │ rgba(99,102,241,0.35)                        │
│ --border-input-focus             │ rgba(129,140,248,0.75)                       │
│ --text-primary                   │ #eef2ff                                      │
│ --text-secondary                 │ #a8b8d8                                      │
│ --text-tertiary                  │ #6f82a8                                      │
│ --text-quaternary                │ #4a5a7a                                      │
│ --text-muted                     │ #4a5a7a                                      │
│ --text-accent                    │ #818cf8                                      │
│ --color-text                     │ #eef2ff                                      │
│ --color-text-muted               │ #a8b8d8                                      │
│ --accent                         │ #818cf8                                      │
│ --accent-hover                   │ #6366f1                                      │
│ --accent-muted                   │ rgba(129,140,248,0.20)                       │
│ --accent-subtle                  │ rgba(129,140,248,0.12)                       │
│ --accent-light                   │ rgba(129,140,248,0.20)                       │
│ --accent-lighter                 │ rgba(129,140,248,0.12)                       │
│ --accent-glow                    │ rgba(129,140,248,0.35)                       │
│ --primary                        │ #818cf8                                      │
│ --primary-hover                  │ #6366f1                                      │
│ --success                        │ #34d399                                      │
│ --success-muted                  │ rgba(52,211,153,0.15)                        │
│ --success-bg                     │ rgba(52,211,153,0.15)                        │
│ --success-border                 │ rgba(52,211,153,0.30)                        │
│ --warning                        │ #fbbf24                                      │
│ --warning-muted                  │ rgba(251,191,36,0.15)                        │
│ --warning-bg                     │ rgba(251,191,36,0.15)                        │
│ --warning-border                 │ rgba(251,191,36,0.30)                        │
│ --danger                         │ #fb7185                                      │
│ --danger-muted                   │ rgba(251,113,133,0.15)                       │
│ --danger-bg                      │ rgba(251,113,133,0.15)                       │
│ --danger-border                  │ rgba(251,113,133,0.30)                       │
│ --info                           │ #60a5fa                                      │
│ --info-bg                        │ rgba(96,165,250,0.15)                        │
│ --pink                           │ #f472b6                                      │
│ --pink-muted                     │ rgba(244,114,182,0.18)                       │
│ --brand-whatsapp                 │ #25D366                                      │
│ --brand-whatsapp-muted           │ rgba(37,211,102,0.15)                        │
│ --brand-telegram                 │ #0088cc                                      │
│ --brand-telegram-muted           │ rgba(0,136,204,0.15)                         │
│ --blue-accent                    │ #93c5fd                                      │
│ --blue-accent-muted              │ rgba(147,197,253,0.15)                       │
│ --medal-silver                   │ #d1d5db                                      │
│ --medal-bronze                   │ #d97706                                      │
│ --purple                         │ #818cf8                                      │
│ --purple-light                   │ #a5b4fc                                      │
│ --purple-glow                    │ rgba(129,140,248,0.25)                       │
│ --purple-bg                      │ rgba(129,140,248,0.18)                       │
│ --purple-border                  │ rgba(129,140,248,0.35)                       │
│ --bg                             │ #090b13 (alias redéfini L682)               │
│ --bg2                            │ #111827 (alias redéfini L682)               │
│ --bg3                            │ #1a2540 (redéfini L682)                     │
│ --card                           │ var(--bg-raised)                             │
│ --text                           │ var(--text-primary)                          │
│ --text2                          │ var(--text-secondary)                        │
│ --grad                           │ linear-gradient(135deg, #818cf8, #6366f1)    │
│ --shadow-sm                      │ 0 1px 3px rgba(0,0,0,0.50)                  │
│ --shadow-md                      │ 0 4px 16px rgba(0,0,0,0.60)                 │
│ --shadow-lg                      │ 0 8px 32px rgba(0,0,0,0.70)                 │
│ --radius-sm                      │ 6px                                          │
│ --radius-md                      │ 10px                                         │
│ --radius-lg                      │ 12px                                         │
│ --sidebar-bg                     │ var(--bg-sidebar)                            │
│ --sidebar-border                 │ var(--border-subtle)                         │
│ --sidebar-btn-color              │ var(--text-secondary)                        │
│ --sidebar-btn-hover-bg           │ var(--bg-hover)                              │
│ --sidebar-btn-hover-color        │ var(--text-primary)                          │
│ --sidebar-btn-active-bg          │ var(--accent-muted)                          │
│ --sidebar-btn-active-color       │ var(--accent)                                │
│ --topbar-bg                      │ var(--bg-topbar)                             │
│ --topbar-border                  │ var(--border-default)                        │
│ --card-bg                        │ var(--bg-card)                               │
│ --card-border                    │ var(--border-default)                        │
│ --card-hover-border              │ var(--border-strong)                         │
│ --table-header-bg                │ var(--bg-table-header)                       │
│ --table-header-color             │ var(--text-secondary)                        │
│ --table-row-hover                │ var(--bg-table-row-hover)                    │
│ --table-border                   │ var(--border-default)                        │
│ --modal-backdrop                 │ rgba(0,0,0,0.80)                             │
│ --modal-bg                       │ var(--bg-modal)                              │
│ --input-bg                       │ var(--bg-input)                              │
│ --input-border                   │ var(--border-input)                          │
│ --input-focus-border             │ var(--accent)                                │
│ --input-focus-ring               │ rgba(129,140,248,0.22)                       │
│ --input-color                    │ var(--text-primary)                          │
│ --chip-bg                        │ rgba(129,140,248,0.12)                       │
│ --chip-border                    │ var(--border-default)                        │
│ --chip-color                     │ var(--text-secondary)                        │
│ --chip-active-bg                 │ rgba(129,140,248,0.25)                       │
│ --chip-active-border             │ var(--border-accent)                         │
│ --chip-active-color              │ var(--accent)                                │
│ --surface                        │ #111827                                      │
│ --surface2                       │ #1a2540                                      │
│ --border                         │ rgba(99,102,241,0.22)                        │
│ --border2                        │ rgba(99,102,241,0.12)                        │
│ --muted                          │ #6f82a8                                      │
│ --muted2                         │ #8a9cbf                                      │
│ --green                          │ #34d399                                      │
│ --red                            │ #fb7185                                      │
│ --gold                           │ #fbbf24                                      │
│ --blue                           │ #93c5fd                                      │
│ --cyan                           │ #34d4ee                                      │
│ --kpi-active-bg                  │ rgba(129,140,248,0.14)                       │
│ --kpi-active-border              │ rgba(129,140,248,0.45)                       │
│ --kpi-active-top                 │ #818cf8                                      │
│ --scrollbar-thumb                │ rgba(129,140,248,0.35)                       │
│ --scrollbar-track                │ transparent                                  │
│ --mobile (breakpoint var)        │ 768px                                        │
│ --tablet (breakpoint var)        │ 1024px                                       │
│ --sidebar                        │ #0b0f1e                                      │
│ --border-ds                      │ rgba(129,140,248,0.22)                       │
│ --border2-ds                     │ rgba(129,140,248,0.38)                       │
│ --border3-ds                     │ rgba(129,140,248,0.55)                       │
│ --text-ds                        │ #eef2ff                                      │
│ --muted-ds                       │ rgba(255,255,255,0.65)                       │
│ --dim-ds                         │ rgba(255,255,255,0.42)                       │
│ --accent-c                       │ #818cf8                                      │
│ --accent-s                       │ rgba(129,140,248,0.18)                       │
│ --accent-b                       │ rgba(129,140,248,0.40)                       │
│ --green-c                        │ #34d399                                      │
│ --gs                             │ rgba(52,211,153,0.15)                        │
│ --gb                             │ rgba(52,211,153,0.30)                        │
│ --amber                          │ #fbbf24                                      │
│ --ams                            │ rgba(251,191,36,0.15)                        │
│ --amb                            │ rgba(251,191,36,0.30)                        │
│ --red-c                          │ #fb7185                                      │
│ --rs                             │ rgba(251,113,133,0.15)                       │
│ --rb                             │ rgba(251,113,133,0.28)                       │
│ --pink-c                         │ #f472b6                                      │
│ --r                              │ 14px                                         │
│ --r-sm                           │ 9px                                          │
└──────────────────────────────────┴──────────────────────────────────────────────┘

OVERRIDES composants indigo-clair (L725-748) :
  .s-item : color rgba(255,255,255,0.65)
  .s-item:hover : color rgba(255,255,255,0.90); bg rgba(129,140,248,0.12)
  .s-item.active : bg rgba(129,140,248,0.20); color #c7d2fe; border rgba(129,140,248,0.35)
  .tb-pill : border-color rgba(129,140,248,0.28); color rgba(255,255,255,0.72)
  .tb-pill:hover : bg rgba(129,140,248,0.14); color rgba(255,255,255,0.92)
  .card, .kpi : box-shadow var(--shadow-md)

DIFFERENCES CLÉS light vs indigo-clair :
  - light utilise des valeurs solides (#4f46e5 accent), indigo-clair utilise #818cf8
  - light backgrounds blancs (#f8fafc, #ffffff), indigo-clair noirs (#090b13, #111827)
  - light borders en rgba(0,0,0,...), indigo-clair en rgba(99,102,241,...) / rgba(129,140,248,...)
  - light shadows faibles (0.05-0.12), indigo-clair shadows fortes (0.50-0.70)
  - light chip-active full solide (#4f46e5 bg, #fff text), indigo-clair semi-transparent (0.25 bg, accent color)
  - light modal backdrop 0.35, indigo-clair 0.80
  - indigo-clair defines --radius-sm/md/lg, --mobile, --tablet; light does NOT define these



═══════════════════════════════════════════════════════════════
ÉLÉMENT 12 : TOPBAR / HEADER GLOBAL (Lignes 63171-63278, CSS L1081-1220)
═══════════════════════════════════════════════════════════════

STRUCTURE :
  <div class="topbar"> avec inline transform translateY(0)/translateY(-100%)

  [1] Logo : <div class="tb-logo"><div class="tb-logo-i">D</div></div>
  [2] Brand : <div class="tb-brand">
                <div class="tb-brand-name">DADASH</div>
                <div class="tb-brand-build">{BUILD_ID}</div>
              </div>
  [3] Spacer : <div style="marginRight:auto"/>

  --- MOBILE ONLY (_isMobile) ---
  [4] Hamburger : <button class="mobile-hamburger"> ☰
  [5] Notif bell : <div class="tb-notif"> 🔔 + tb-badge

  --- DESKTOP ONLY (!_isMobile) ---
  [6] Live clock pill : <div class="tb-pill live"><span class="tb-dot"/><LiveClock/></div>
  [7] Carlos ping pill : tb-pill avec couleur conditionnelle
      < 100ms : bg rgba(16,185,129,0.15), color var(--success), dot 🟢
      < 200ms : bg rgba(245,158,11,0.15), color #f59e0b, dot 🟡
      >= 200ms : bg rgba(239,68,68,0.15), color var(--danger), dot 🔴
  [8] Timezone selector : <select class="tb-pill"> avec TIMEZONES (flags + labels)
  [9] Currency toggle : tb-pill avec 2 boutons EUR / CHF
      Actif : bg var(--accent-s), color #a5b4fc
      Inactif : bg transparent, color var(--muted-ds)
      Style boutons : padding 3px 7px; fontSize 10; fontWeight 700; borderRadius 6; fontFamily 'Space Mono'
  [10] Language selector : <select class="tb-pill"> (modele → UI_LANGUAGES_ALL, autres → UI_LANGUAGES_BASE)
  [11] Notifications bell + dropdown (voir element 8)
  [12] Theme picker : tb-pill avec 🎨
       Dropdown : bg var(--surface); border 1px solid var(--border); borderRadius 10; padding 6px 0; minWidth 140; boxShadow 0 8px 24px rgba(0,0,0,0.3)
       Options : "Indigo (clair)" dot #818cf8, "Light" dot #4f46e5
       Items : padding 8px 14px; fontSize 12; fontWeight 600; dot 8x8 borderRadius 50%
  [13] Search button (gérant) : tb-pill "🔍 {search_cmd}"
  [14] Avatar : <div class="tb-av">{initial}</div>
  [15] Role badge : <div class="tb-role {cls}">{label}</div>
       Variantes : (rien)=indigo, amber=chatter/manager, pink=modele, green=provider
  [16] Logout button : inline styles
       padding: 6px 12px (mobile: 6px 10px); bg var(--rs); color var(--red-c)
       border: 1px solid var(--rb); borderRadius: 8; fontSize: 11; fontWeight: 700
       Texte : 🚪 + "Déconnexion" (desktop), 🚪 seul (mobile)

STYLES CSS :
  .topbar (L1081-1092) :
    height: 52px; background: var(--bg2)
    border-bottom: 1px solid var(--border-ds)
    display: flex; align-items: center; gap: 8px; padding: 0
    flex-shrink: 0; position: relative; z-index: 200

  .tb-logo (L1094-1098) :
    width: 52px; height: 52px; border-right: 1px solid var(--border-ds)
    display: flex; align-items: center; justify-content: center; flex-shrink: 0

  .tb-logo-i (L1100-1108) :
    width: 30px; height: 30px
    background: linear-gradient(135deg, #6366f1, #8b5cf6)
    border-radius: 9px; font-family: 'Syne', sans-serif
    font-weight: 800; font-size: 12px; color: #fff

  .tb-brand (L1110-1113) :
    display: flex; flex-direction: column; padding: 0 4px

  .tb-brand-name (L1114-1119) :
    font-family: 'Syne', sans-serif; font-weight: 800; font-size: 14px
    color: var(--text-ds); letter-spacing: -0.3px

  .tb-brand-build (L1120-1124) :
    font-family: 'Space Mono', monospace; font-size: 8px; color: var(--dim-ds)

  .tb-pill (L1126-1136) :
    display: flex; align-items: center; gap: 5px
    padding: 5px 10px; border-radius: 8px
    border: 1px solid var(--border-ds); background: transparent
    font-size: 11px; color: var(--muted-ds)
    font-family: 'DM Sans', sans-serif; white-space: nowrap

  .tb-pill.live (L1137-1141) :
    background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.25); color: #10b981

  .tb-dot (L1142-1148) :
    width: 6px; height: 6px; border-radius: 50%; background: #10b981
    animation: tbDotPulse 2s infinite; flex-shrink: 0

  .tb-av (L1153-1162) :
    width: 28px; height: 28px
    background: linear-gradient(135deg, #6366f1, #8b5cf6)
    border-radius: 8px; font-family: 'Syne'; font-weight: 800; font-size: 11px; color: #fff

  .tb-role (L1164-1178) :
    padding: 3px 8px; background: var(--accent-s)
    border: 1px solid rgba(99,102,241,0.25); border-radius: 20px
    color: #a5b4fc; font-family: 'Space Mono'; font-size: 9px; font-weight: 700; letter-spacing: 0.08em
    .amber : bg rgba(245,158,11,0.1); border rgba(245,158,11,0.3); color #f59e0b
    .pink : bg rgba(236,72,153,0.1); border rgba(236,72,153,0.3); color #f472b6
    .green : bg rgba(16,185,129,0.1); border rgba(16,185,129,0.3); color #10b981

RESPONSIVE :
  Mobile (<768px, L3045-3056) :
    height: auto; min-height: 48px
    padding: calc(env(safe-area-inset-top, 16px) + 8px) 12px 8px
    position: sticky; top: 0; z-index: 200
    background: var(--topbar-bg); backdrop-filter: blur(24px)
  @media max-width:390px (L3332) : padding: 0 10px
  @media max-width:360px (L3371) : height: auto; min-height: 42px; padding calc(env(...)+8px) 8px 8px
  @media max-width:340px (L3449) : height: 40px



═══════════════════════════════════════════════════════════════
ÉLÉMENT 13 : MOBILE MENU OVERLAY (Lignes 63122-63167, CSS L3012-3032)
═══════════════════════════════════════════════════════════════

STRUCTURE :
  {mobileMenuOpen && (
    <div class="mobile-menu-overlay" onClick={close}>
      <div class="mobile-menu-sheet" onClick={stopPropagation}>
        [A] HEADER : flex, padding 16px 20px, borderBottom 1px solid var(--border)
            "DADASH" (fontSize 16, fontWeight 800, bg var(--grad) text clip → gradient text)
            Bouton fermer "✕" (fontSize 20, color var(--text-secondary))
        [B] NAV ITEMS : padding 12px
            Gérant → GERANT_NAV items
            Autres → otherTabs filtré
            Style boutons : flex, gap 12, width 100%, padding 14px 16px
              Actif : bg var(--accent-muted), color var(--accent), fontWeight 700
              Inactif : bg none, color var(--text-secondary), fontWeight 500
              fontSize: 15, borderRadius: 10, fontFamily 'DM Sans', transition all 0.15s
              Icône : fontSize 20
            Badges inline : marginLeft auto, fontSize 11, fontWeight 700, padding 2px 7px, borderRadius 10
              business → bg var(--warning), color #000
              messagerie → bg var(--danger), color #fff
              notif → bg #EF4444, color #fff
        [C] SEARCH (chatter/provider) : padding 12px 16px, borderTop
            Bouton : bg var(--surface), border 1px solid var(--border), borderRadius 12
              fontSize 14, fontWeight 600, "🔍 Rechercher..."
        [D] INSTALL PWA (si canInstallPwa) : padding 12px 16px, borderTop
            Bouton : bg var(--accent-muted), border 1px solid var(--border-accent), borderRadius 12
              color var(--accent), fontWeight 700, "📲 Installer l'app"
        [E] REFRESH : padding 12px 16px, borderTop
            "🔄 Rafraîchir" — fontSize 13, color var(--text-tertiary)
      </div>
    </div>
  )}

GERANT_NAV items (L8470-8479) :
  [D] DADASH    — icône: <span> custom (bg #6C63FF, white, bold, borderRadius 6px)
  💵 Business
  👥 Équipe
  ✈️ Messagerie
  🏦 Compta
  🤖 Bots
  🎬 Scripts
  🔑 Admin

ADMIN_NAV (L8527) : [🔑 Admin] seul

STYLES CSS :
  .mobile-menu-overlay (L3012-3020, hidden by default L2867) :
    display: flex !important (dans @media <768px)
    position: fixed; inset: 0; z-index: 200
    background: rgba(0,0,0,0.6)
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px)
    align-items: flex-end
    animation: fadeIn 0.15s ease

  .mobile-menu-sheet (L3021-3030) :
    width: 100%; max-height: 80vh
    background: var(--bg-raised)
    border-radius: 20px 20px 0 0
    overflow-y: auto; -webkit-overflow-scrolling: touch
    animation: slideUp 0.25s ease
    padding-bottom: env(safe-area-inset-bottom, 16px)

  Animations :
    slideUp : from translateY(100%) → to translateY(0)
    fadeIn : from opacity 0 → to opacity 1



═══════════════════════════════════════════════════════════════
ÉLÉMENT 14 : CSS GLOBAL — CLASSES UTILITAIRES PRINCIPALES
═══════════════════════════════════════════════════════════════

.filter-chip (L2274-2291) :
  padding: 7px 13px; background: var(--chip-bg); border: 1px solid var(--chip-border)
  border-radius: 9px; color: var(--chip-color); font-size: 12px; font-weight: 500
  cursor: pointer; transition: all 0.15s; white-space: nowrap
  .active : bg var(--chip-active-bg); border var(--chip-active-border); color var(--chip-active-color)
  :hover : border-color var(--border-strong); color var(--text-primary)

.filter-date (L2292-2301) :
  padding: 7px 13px; background: var(--input-bg); border: 1px solid var(--input-border)
  border-radius: 9px; color: var(--input-color); font-size: 12px; cursor: pointer
  :focus : outline none; border-color var(--input-focus-border)

.filter-select (L2302-2312) :
  padding: 7px 13px; background: var(--input-bg); border: 1px solid var(--input-border)
  border-radius: 9px; color: var(--input-color); font-size: 12px; cursor: pointer
  :focus : outline none; border-color var(--input-focus-border)
  option : bg var(--bg-raised); color var(--text-primary); text-transform: uppercase

.tag-click (L761) :
  display: inline-block; padding: 2px 8px; border-radius: var(--radius-sm)
  cursor: pointer; transition: all 0.15s; font-size: 12px; font-weight: 500; text-transform: uppercase
  :hover : opacity 0.8

.tag-spender (L763) : background: var(--pink-muted); color: var(--pink)
.tag-model (L764) : background: var(--accent-muted); color: var(--accent)
.tag-chatter (L765) : background: var(--success-muted); color: var(--success)
.tag-provider (L766) : background: var(--warning-muted); color: var(--warning)

.toast-container (L754) :
  position: fixed; top: 20px; right: 20px; z-index: 9999
  display: flex; flex-direction: column; gap: 8px; pointer-events: none

.toast (L755) :
  padding: 12px 20px; border-radius: 10px; color: white
  font-size: 13px; font-weight: 600
  box-shadow: 0 8px 24px rgba(0,0,0,0.3)
  animation: slideInToast 0.3s ease-out; pointer-events: auto
  .toast-success : bg var(--success)
  .toast-error : bg var(--danger)
  .toast-info : bg var(--accent)

.app-wrap (L898) : display: flex; height: 100vh; flex-direction: row
.main-area (L1075-1079) : flex: 1; display: flex; flex-direction: column; overflow: hidden

TRANSITION GLOBALE (L750-752) :
  body, .sidebar, .topbar, .card, .kpi, .spender-card, .profile-panel, .ai-card,
  .form-input, .table th, .table td, .filter-chip, .filter-select, .filter-date,
  .info-box, .login-wrap, .login-card
  → transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease

.empty-state (L1184-1193) :
  flex column, centered, padding 48px 20px, gap 12px, color var(--dim-ds), fontSize 13px
  .empty-state-icon : fontSize 32px
  .empty-state-title : font 'Syne' 700, fontSize 15, color var(--muted-ds)

.sort-th (L771-774) : cursor pointer, user-select none
  :hover : bg var(--accent-subtle)
.sort-arrow : fontSize 10px, marginLeft 3px, opacity 0.4
  .active : opacity 1

.fade-in (L768-769) : animation fadeInTab 0.25s ease-out
  (from opacity 0, translateY(6px) → to opacity 1, translateY(0))


---

Ce rapport couvre exhaustivement les 14 elements transversaux demandes avec les numeros de ligne exacts, les structures HTML/JSX, tous les styles CSS (valeurs exactes), les etats hover/active, et les breakpoints responsive. Aucune modification n'a ete effectuee.

═══════════════════════════════════════════════════════════════════════════════
              FIN DE L'AUDIT COMPLET
═══════════════════════════════════════════════════════════════════════════════
