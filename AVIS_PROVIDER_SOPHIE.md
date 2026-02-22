# AVIS PROVIDER — Sophie, 26 ans, Modele/Provider DADASH

**Date du test** : 22 fevrier 2026
**Plateforme testee** : dadash.co
**Role teste** : Provider
**Device principal** : Mobile (iPhone) + Desktop
**Langue** : FR

---

## Score UX Provider : 6/10

Le role Provider existe et il est fonctionnel. C'est deja bien compare a ce que j'ai vu ailleurs. Mais il manque des trucs essentiels pour que je me sente vraiment en controle de mon business. J'ai l'impression d'etre une "invitee" dans le CRM, pas une utilisatrice a part entiere.

---

## Ce qui existe vs ce qui manque

### CE QUI EXISTE (les bonnes surprises)

| Fonctionnalite | Etat | Mon avis |
|---|---|---|
| **Login provider** | OK | Login unique, meme page que les autres roles. Ca marche, c'est simple. |
| **Dashboard avec KPIs** | OK | 4 KPIs clairs : Revenus total, Revenus ce mois, TX en attente, Nombre de modeles. C'est lisible. |
| **Graphique revenus par mois** | OK | Bar chart Recharts sur 6 mois. Beau, lisible, le mois en cours est en violet plus fonce. J'aime bien. |
| **Graphique revenus par modele** | OK | Pie chart avec legende. Je vois directement quel modele rapporte le plus. TOP. |
| **Carte "Solde non reverse"** | OK | Gradient violet/rose, gros chiffre. Je vois tout de suite combien DADA me doit. C'est THE info que je cherche en premier le matin. |
| **Liste des 20 dernieres TX** | OK | Avec handle spender, modele, date, montant, badge de statut. C'est bien structure. |
| **Tab Transactions complete** | OK | Meme composant que le gerant, filtre automatiquement sur mes TX. Je peux voir pending/validated/refused. |
| **Tab Provider Compta** | OK | Sous-onglets Paiements / Factures / Comptes. Tres complet. |
| **Declaration de paiement** | OK | Formulaire pour declarer un paiement recu avec montant, devise, periode, methode, reference. Le gerant est notifie automatiquement. |
| **Historique des paiements** | OK | Table avec date, montant, periode, methode, reference, statut, notes. |
| **Mes comptes de paiement** | OK | Je vois mes moyens de paiement configures (virement, crypto, PayPal, etc.) avec le compte principal marque. |
| **Mes factures** | OK | Acces aux factures provider generees. |
| **Confirmation de screenshots** | OK | Quand un chatter envoie un screenshot de paiement, je recois une demande de confirmation "As-tu bien recu ce paiement ?" avec OUI/NON. Genial pour eviter les arnaques. |
| **FAB (Floating Action Button)** | OK | 3 raccourcis : Ajouter TX, Voir Modeles, Ma Compta. Pratique sur mobile. |
| **Multi-devise** | OK | EUR/CHF/USD avec conversion automatique. |
| **Multi-langue** | OK | FR/EN/DE/RU/UA/ES. Cool pour les modeles internationales. |
| **Dark theme** | OK | Design sombre, lisible, moderne. |
| **Responsive mobile** | Partiel | Le layout s'adapte (grid 2 colonnes pour KPIs sur mobile, 1 colonne pour les charts). Mais voir les frustrations ci-dessous. |

### CE QUI MANQUE

| Fonctionnalite manquante | Priorite | Impact |
|---|---|---|
| **Aucun graphique d'evolution dans le temps** | HAUTE | Je veux voir ma courbe de revenus semaine par semaine, pas juste les 6 derniers mois en barres. |
| **Pas de comparaison semaine/mois precedent** | HAUTE | "Tu as gagne 15% de plus que la semaine derniere" — ca me motive ! |
| **Pas de classement des chatters** | HAUTE | Je veux savoir QUEL CHATTER vend le mieux pour moi. C'est la question #1 que je me pose chaque jour. |
| **Pas de notifications push** | HAUTE | Quand une TX est validee ou qu'un paiement est confirme, je veux etre notifiee sur mon tel. Pas ouvrir le CRM pour verifier. |
| **Pas d'export de donnees** | MOYENNE | Je veux pouvoir telecharger un CSV ou PDF de mes revenus pour ma compta perso. |
| **Pas de goal/objectif** | MOYENNE | "Objectif ce mois : 5000 EUR" avec une barre de progression. Ca me donnerait un but. |
| **Pas d'upload de contenu** | MOYENNE | Le gerant a un systeme d'upload video pour les modeles, mais moi en tant que provider je ne peux rien uploader directement. |
| **Pas de messagerie interne** | MOYENNE | Si j'ai une question sur une TX, je dois aller sur WhatsApp. Pas de chat integre. |
| **Pas de profil editable** | BASSE | Je ne peux pas changer ma photo, mon nom, mes infos. Tout passe par le gerant. |
| **Pas de vue "Mes modeles"** | MOYENNE | J'ai le nombre de modeles dans le KPI mais pas de page dediee pour voir les fiches de mes modeles, leur performance individuelle. |
| **Pas de filtre par periode sur le dashboard** | HAUTE | Le dashboard montre "total" et "ce mois" mais je ne peux pas choisir "cette semaine" ou "les 30 derniers jours". |
| **Pas de revenus par chatter** | HAUTE | Revenue par modele c'est bien, mais revenue par chatter c'est ce qui m'interesse VRAIMENT. |

---

## Top 5 Frustrations

### 1. JE NE SAIS PAS QUEL CHATTER PERFORME LE MIEUX POUR MOI
C'est MA frustration numero 1. Le pie chart "Revenus par modele" c'est bien, mais ce que je veux c'est "Revenus par chatter". Les modeles, je les connais, c'est MON contenu. Ce que je veux savoir c'est : est-ce que Kevin vend mieux que Julien ? Est-ce que Sarah a fait plus de ventes cette semaine ? Si un chatter ne vend rien, je veux le savoir. Le CRM a ces donnees (chaque TX a un `chatter_id` ou `created_by`) mais elles ne me sont PAS montrees.

### 2. LA COMPTA PROVIDER EST UN TABLEAU, PAS UN DASHBOARD
L'onglet "Provider Compta" a des KPIs (5 cards en grille de 5 colonnes) mais sur mobile c'est probablement illisible — 5 colonnes sur un ecran de 375px ca donne des cards de 60px de large. Et en dessous c'est des tableaux HTML classiques. Pas de graphique, pas de courbe d'evolution. C'est une vue "comptable" pas une vue "business". Moi je veux des courbes, des tendances, des couleurs qui me disent si ca monte ou ca descend.

### 3. PAS DE NOTIFICATIONS — JE DOIS OUVRIR LE CRM POUR TOUT
Le systeme de notifications existe dans le code (il y a un `createNotification` et un panneau de notifs) mais en pratique, quand une TX est validee, je ne recois rien sur mon telephone. Pas de push, pas d'email, rien. Je dois ouvrir dadash.co et verifier moi-meme. En 2026, c'est pas acceptable. Je veux un ping sur mon tel quand : une vente est faite, un paiement est valide, un screenshot est a confirmer.

### 4. LE DASHBOARD NE REPOND PAS A MA QUESTION DU MATIN
Ma question du matin c'est : "Combien j'ai gagne hier ?" Le dashboard me montre "Revenus Total" (tout temps) et "Revenus ce mois". Mais pas "hier", pas "cette semaine", pas "les 7 derniers jours". Il n'y a AUCUN filtre de periode sur le dashboard provider. Le composant `useDateRange` existe dans le code (utilise par le gerant) mais n'est pas branche sur le dashboard provider.

### 5. L'EXPERIENCE MOBILE EST "CORRECTE" MAIS PAS "MOBILE-FIRST"
Le site s'adapte au mobile avec `_isMobile = window.innerWidth < 768` et les grilles passent en colonnes. OK. Mais :
- Les 5 KPIs de la compta en `gridTemplateColumns: "repeat(5,1fr)"` ne sont PAS responsive (pas de condition `_isMobile` sur cette grille)
- Les tableaux de paiements et TX sont en `<table>` HTML classique avec `table-wrap` overflow — sur mobile ca oblige a scroller horizontalement, c'est penible
- Pas de bottom navigation fixe pour le provider (les chatters ont un bottom bar, le provider non — il doit utiliser le sidebar)
- Pas d'animation de pull-to-refresh, pas de gestes tactiles
- Le `safe-area-inset-bottom` est gere dans le CSS mais l'experience globale ne "sent" pas le mobile natif

---

## 10 Features que je voudrais en priorite

### 1. Classement des chatters par revenus generes
**Quoi** : Un tableau/graphique montrant pour chaque chatter combien il a vendu pour moi, avec tri par periode.
**Pourquoi** : C'est l'info #1 que je cherche. Je veux savoir qui bosse bien.

### 2. Filtre de periode sur le dashboard
**Quoi** : Pouvoir choisir "Aujourd'hui", "Cette semaine", "Ce mois", "Tout" sur le dashboard.
**Pourquoi** : Ma question c'est "combien hier ?" pas "combien depuis le debut des temps".

### 3. Notifications push (ou au moins in-app avec badge)
**Quoi** : Recevoir un push/notification quand : TX validee, paiement confirme, screenshot a verifier.
**Pourquoi** : Je ne veux pas ouvrir le CRM 10 fois par jour pour verifier.

### 4. Comparaison avec la periode precedente
**Quoi** : "+15% vs semaine derniere" sur chaque KPI avec une fleche verte/rouge.
**Pourquoi** : Ca me motive et me donne du contexte sur mes chiffres.

### 5. Vue "Mes Modeles" dediee
**Quoi** : Une page avec les fiches de mes modeles, leur photo, leurs stats individuelles, leur checklist.
**Pourquoi** : Le FAB dit "Voir Modeles" mais ca renvoie juste au dashboard. Je veux une vraie page.

### 6. Graphique d'evolution hebdomadaire
**Quoi** : Une line chart montrant mes revenus semaine par semaine sur les 3 derniers mois.
**Pourquoi** : Le bar chart mensuel est trop grossier. Je veux voir les tendances fines.

### 7. Export CSV/PDF de mes revenus
**Quoi** : Un bouton "Exporter" sur la compta qui genere un fichier avec toutes mes TX.
**Pourquoi** : Pour ma compta perso, mes impots, mes preuves de revenus.

### 8. KPIs compta responsive sur mobile
**Quoi** : Passer la grille de 5 KPIs a 2 colonnes sur mobile, comme c'est fait pour le dashboard.
**Pourquoi** : En l'etat, 5 colonnes sur 375px c'est illisible.

### 9. Objectif mensuel avec barre de progression
**Quoi** : Je definis "mon objectif ce mois = 5000 EUR" et une barre de progression se remplit.
**Pourquoi** : Gamification basique mais tres motivante.

### 10. Messagerie interne legere
**Quoi** : Un chat simple pour echanger avec le gerant sans quitter le CRM.
**Pourquoi** : Pour les questions sur les TX, les retards de paiement, les disputes.

---

## Maquette texte de mon dashboard ideal

```
┌─────────────────────────────────────────────────────────────┐
│  DADASH — Mon Dashboard Provider                    [🔔 3]  │
│  Bonjour Sophie 👋              Filtre: [Cette semaine ▼]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ 💰 2'450€│ │ 📈 +18%  │ │ ⏳ 3 TX  │ │ 👩 4     │      │
│  │ Cette    │ │ vs sem.  │ │ en       │ │ modeles  │      │
│  │ semaine  │ │ derniere │ │ attente  │ │ actifs   │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  OBJECTIF MENSUEL : 8'000€                          │   │
│  │  ████████████████████░░░░░░░░  5'200€ / 8'000€ 65% │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  💰 SOLDE NON REVERSE                               │   │
│  │  1'850€              Total reverse: 12'400€         │   │
│  │  [📩 Demander un paiement]                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──── Revenus / semaine (12 sem.) ────────────────────┐   │
│  │  2500│          ╭─╮                                  │   │
│  │  2000│    ╭─╮   │ │  ╭─╮                            │   │
│  │  1500│╭─╮ │ │╭─╮│ │  │ │  ╭─╮                      │   │
│  │  1000││ │ │ ││ ││ │╭─╮ │  │ │╭─╮╭─╮               │   │
│  │   500││ │ │ ││ ││ ││ │ │  │ ││ ││ │╭─╮            │   │
│  │      └──────────────────────────────────            │   │
│  │       S1  S2 S3 S4 S5 S6 S7 S8 S9 S10 S11 S12     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌── Top Chatters ──────────┐ ┌── Revenus par Modele ──┐  │
│  │ 🥇 Kevin    1'200€  48% │ │      ╭───╮              │  │
│  │ 🥈 Julien     850€  34% │ │   ╭──╯   ╰──╮          │  │
│  │ 🥉 Sarah      400€  16% │ │   │  Lena   │          │  │
│  │    Tom          50€   2% │ │   │  42%    │          │  │
│  │                          │ │   ╰──╮   ╭──╯          │  │
│  │ [Voir details →]         │ │      ╰───╯              │  │
│  └──────────────────────────┘ └─────────────────────────┘  │
│                                                             │
│  ┌── Dernieres Transactions ───────────────────────────┐   │
│  │ 👩 @BigSpender93  →  Lena    250€  ✅ Validee  2h  │   │
│  │ 👩 @DarkKnight    →  Mia     180€  ⏳ Pending  5h  │   │
│  │ 👩 @CashFlow99    →  Lena    120€  ✅ Validee  1j  │   │
│  │ 👩 @MoneyTalk     →  Emma     95€  ✅ Validee  1j  │   │
│  │ 👩 @TopFan42      →  Mia      75€  ❌ Refusee  2j  │   │
│  │                                                      │   │
│  │ [Voir toutes mes transactions →]                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌── 📋 Confirmations en attente (2) ──────────────────┐   │
│  │ 📸 180 CHF · Revolut · @DarkKnight → Mia            │   │
│  │    As-tu bien recu ce paiement ?                     │   │
│  │    [✅ OUI, recu]  [❌ NON, pas recu]                │   │
│  │                                                      │   │
│  │ 📸 95 CHF · Virement · @NewGuy → Lena               │   │
│  │    As-tu bien recu ce paiement ?                     │   │
│  │    [✅ OUI, recu]  [❌ NON, pas recu]                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [📊 Dashboard]  [💸 Mes TX]  [💰 Compta]  [👩 Modeles]  │
│                  BOTTOM NAV BAR (mobile)                    │
└─────────────────────────────────────────────────────────────┘
```

### Version mobile (375px)

```
┌───────────────────────────┐
│ DADASH        [🔔 3] [☰] │
│ Sophie 👋                 │
│ [Cette semaine ▼]         │
├───────────────────────────┤
│ ┌───────────┐┌───────────┐│
│ │💰 2'450€  ││📈 +18%    ││
│ │Cette sem. ││vs sem.der.││
│ └───────────┘└───────────┘│
│ ┌───────────┐┌───────────┐│
│ │⏳ 3 TX    ││👩 4       ││
│ │en attente ││modeles    ││
│ └───────────┘└───────────┘│
│                           │
│ ┌─── Objectif ──────────┐ │
│ │████████░░░░ 65% 8K€   │ │
│ └───────────────────────┘ │
│                           │
│ ┌─── Solde ─────────────┐ │
│ │ 1'850€ non reverse    │ │
│ │ [📩 Demander paiement]│ │
│ └───────────────────────┘ │
│                           │
│ ┌─── Top Chatters ──────┐ │
│ │🥇 Kevin   1'200€  48%│ │
│ │🥈 Julien    850€  34%│ │
│ │🥉 Sarah     400€  16%│ │
│ └───────────────────────┘ │
│                           │
│ [CHART: Revenus/semaine]  │
│ [CHART: Revenus/modele]   │
│                           │
│ ┌── Confirmations (2) ──┐ │
│ │📸 180CHF @DarkKnight  │ │
│ │ [✅ OUI] [❌ NON]     │ │
│ │                       │ │
│ │📸 95CHF @NewGuy       │ │
│ │ [✅ OUI] [❌ NON]     │ │
│ └───────────────────────┘ │
│                           │
│ ┌── Dernieres TX ───────┐ │
│ │@BigSpender 250€ ✅ 2h │ │
│ │@DarkKnight 180€ ⏳ 5h │ │
│ │@CashFlow99 120€ ✅ 1j │ │
│ │[Voir tout →]          │ │
│ └───────────────────────┘ │
│                           │
├───────────────────────────┤
│ [📊] [💸] [💰] [👩]     │
│      BOTTOM NAV           │
└───────────────────────────┘
```

---

## Bugs et problemes techniques notes

### Bug 1 : Grille KPIs Compta non responsive
**Ou** : `ProviderComptaTab`, ligne ~9797
**Quoi** : `gridTemplateColumns: "repeat(5,1fr)"` sans condition `_isMobile`
**Impact** : Sur mobile, 5 colonnes = cartes de ~60px de large, illisible
**Fix** : Ajouter `gridTemplateColumns: _isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)"`

### Bug 2 : FAB "Voir Modeles" ne montre pas les modeles
**Ou** : `handleFabAction`, ligne ~20703
**Quoi** : `provider_models` renvoie a `provider_dashboard` au lieu d'une vraie page modeles
**Impact** : Le bouton est trompeur, il ne fait rien de plus que revenir au dashboard

### Bug 3 : Pas de bottom nav pour le provider sur mobile
**Ou** : Navigation config, ligne ~20594-20596
**Quoi** : Le provider a 3 tabs dans le sidebar mais pas de bottom navigation fixe comme les chatters
**Impact** : Sur mobile, naviguer entre les onglets demande d'ouvrir le menu hamburger a chaque fois

### Bug 4 : Transactions limitees a 30 sans pagination dans la compta
**Ou** : `ProviderComptaTab`, ligne ~9899
**Quoi** : `providerTxs.slice(0,30)` sans pagination
**Impact** : Si j'ai plus de 30 TX, je ne vois pas les anciennes. Pas de bouton "voir plus".

---

## Verdict final — Avis honnete de Sophie

**Le bon** : Le role Provider est bien plus avance que ce que je m'attendais. Le dashboard avec KPIs + charts + solde non reverse couvre 60% de mes besoins. La confirmation de screenshots est une feature geniale qui me protege des arnaques. La compta avec declaration de paiements est bien pensee.

**Le pas bon** : Je ne sais pas quel chatter bosse bien pour moi, et c'est LA question que je me pose tous les jours. Le dashboard ne me laisse pas choisir ma periode. L'experience mobile est "acceptable" mais pas "agreable". Pas de push notifications, pas d'export. Je me sens comme une utilisatrice "de seconde zone" par rapport au gerant qui a un dashboard ultra-complet avec drill-down, analytics, et plein de sous-onglets.

**Le verdict** : C'est utilisable mais pas suffisant pour me sentir en controle de mon business. Avec les features 1-4 de ma liste (classement chatters, filtre periode, push notifs, comparaison), ca deviendrait un outil que j'ouvre avec plaisir chaque matin au lieu d'un truc que je check par obligation.

**Score final : 6/10** — Fonctionnel, pas excitant. Les bases sont la, il faut maintenant penser "provider-first" pour le prochain sprint.

---

*Rapport genere par Sophie — Agent Provider DADASH*
*Test realise le 22 fevrier 2026 sur dadash.co*
