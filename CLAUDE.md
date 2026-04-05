# DADASH CRM — Agent Rules (CLAUDE.md)

## Stack
- React 18 + Babel standalone (NO build system, NO webpack, NO vite)
- Single monolithic index.html (~66K lines)
- Deployed on Vercel at dadash.co
- Supabase PostgreSQL backend (project: lkrzjwfwhiimpnsyeuxi)

## Critical Rules
1. NEVER add `console.log` with PII (usernames, handles, IDs) — use `_DADASH_DEBUG && console.log(...)` guard
2. NEVER use `innerHTML = x` without `DOMPurify.sanitize(x)` — XSS risk
3. NEVER use `SELECT *` on Supabase queries — always specify columns
4. ALWAYS add `.limit(N)` on list queries (reasonable: 500 for TX, 200 for products, 100 for templates)
5. ALL new queries MUST respect role: check `currentUser.role` before fetching
6. Transaction statuses are ONLY: "validated", "refused", "pending", "cancelled" — never use "valid", "confirmee", "payee"
7. DADASH fee = 12% of gross (DADA_FEE_PCT = 12). MC commission default = 25% of net.
8. Currency: CHF reference. EUR→CHF = 0.90 (fixed). USD→CHF = 0.88.
9. Role strings: "gerant", "manager_chatter", "chatter", "provider", "modele" — NEVER "model", "admin", "manager"
10. 7 active models: Carla, Sophie, Bella, Nadia, Lea, Alice, Maria

## PR Rules
- 1 PR = 1 feature/fix. Never bundle unrelated changes.
- Never 2 Carlos (bot) PRs simultaneous — Railway redeploy kills Telegram sessions
- Carlos PRs before Alfred PRs when both are needed
- Branch naming: `fix/description` or `feat/description`
- Always push branch, NEVER merge — DADA reviews and merges

## Code Patterns
- Use `convertAmount(amount, currency)` for any amount display (handles EUR/USD→CHF conversion)
- Use `fmtAmount(n)` for formatted display with CHF suffix
- Socket.IO handlers: ALWAYS add `.off()` cleanup in useEffect return
- New components: wrap in `React.memo()` if they receive array/object props
- Role checks: use `hasPermission(userId, featureId, level)` — never hardcode role strings in UI logic

## Testing Checklist (before any PR)
- [ ] Works as gérant (martin.delamare@mail.novancia.fr)
- [ ] Works as MC (zooagency@dadash.co)
- [ ] Works as chatter (test chatter account)
- [ ] No console errors
- [ ] No `SELECT *` added
- [ ] No `innerHTML` without DOMPurify
- [ ] No hardcoded API keys or secrets
