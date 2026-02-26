# HOW TO TEST — Paiements / Ledger / Compta

## 1. Appliquer la migration

Dans Supabase Dashboard → SQL Editor, exécuter le contenu de :
```
supabase/migrations/20260310_fix_payments_ledger_prod.sql
```

## 2. Exécuter les tests SQL

Copier-coller le contenu de :
```
supabase/migrations/tests_payments_ledger.sql
```

Vérifier les notices : "OK: 2 ledger_entries créées", "OK: notification créée", "OK: balance chatter = X"

## 3. Test manuel UI

1. **Login** en tant que gérant
2. Aller dans **Compta** → **Paies**
3. Sélectionner un chatter avec solde > 0
4. Cliquer **Marquer payé**
5. Vérifier :
   - Toast "Marqué payé ✓"
   - Pas d'erreur en console
   - Rafraîchir : 2 lignes dans ledger, solde chatter mis à jour

6. **Login** en tant que chatter
7. Aller dans **Compta** (espace chatter)
8. Vérifier :
   - KPI Solde actuel affiché
   - Liste Paiements reçus
   - Historique ledger
   - Notification "Paiement reçu"

## 4. Checklist validation

- [ ] Migration appliquée sans erreurs
- [ ] create payment pending OK
- [ ] mark paid OK
- [ ] ledger_entries créées (2)
- [ ] notification créée
- [ ] Compta chatter affiche solde + historique
- [ ] Dashboard n'a plus "aPer is not defined"
