# RECOVERY-REVERT-PREADMIN — Note de neutralisation

**Branche:** `fix/recovery-revert-preadmin`  
**Objectif:** État stable bootable, Admin neutralisée, prêt pour roadmap prioritaire.

## Ce qui a été revert / neutralisé exactement

### 1. AdminShell (PR-A0)
- **Avant:** Composant complet avec tabs (overview, users, roles, assignments, logs, settings, qa, export), rendu conditionnel de 8 sous-pages.
- **Après:** Stub Babel-safe `function(props){ return React.createElement("div", ...) }` affichant uniquement:
  - Titre "Admin"
  - Message "Admin temporairement désactivé (reprise demain)"
- **Raison:** Blocs React.createElement imbriqués fragiles → parse Babel bloqué.

### 2. Sous-page Permissions (Rôles & Permissions)
- **Retiré:** Onglet `{ id: "roles", label: "Rôles & Permissions" }` de `PAGE_TABS.admin`
- **AdminRolesPermissionsTab:** Remplacé par no-op `function(){ return null; }`
- **AdminQAMaintenanceTab:** Bouton "Rafraîchir Permissions" et check `role_permissions` supprimés
- **Fallback:** `subTab === "roles"` → redirection vers `"overview"`
- **Raison:** Bloc Permissions = source principale du crash Babel.

### 3. Composants Admin non exécutés (grâce au stub AdminShell)
Les composants suivants restent définis dans le fichier mais ne sont plus rendus:
- AdminTab, AdminUsersSection, AdminUserDetailPanel
- AdminAssignmentsTab, AdminLogsCenterTab, AdminSettingsTab
- AdminQAMaintenanceTab, ExportRapportsTab

## Conservé (inchangé)
- Dashboard gérant, chatter, modèles
- Compta, messagerie, automation, bots
- Espace chatter (EC3–EC8)
- UX-FIX Messagerie (Telegram par défaut)
- Tous les helpers globaux (safeArray, displayUserName, etc.)

## Prochaines étapes (hors scope)
- Admin sera refaite en PR isolées
- Priorités: Dashboard chatter, pop-up cards, harmonisation espace modèle
