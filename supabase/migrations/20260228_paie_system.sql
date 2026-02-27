-- ═══════════════════════════════════════════════════════════════════════════════
-- SYSTÈME DE PAIE INTERNE — Gérant → Chatter / Modèle
-- Date: 2026-02-28
-- Tables: paies
-- Colonnes ajoutées: profiles.commission_rate
--
-- VÉRIFICATIONS PRÉALABLES:
-- 1. SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'paies' ORDER BY ordinal_position;
--    → Table inexistante avant cette migration
--
-- 2. SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'profiles' AND column_name = 'commission_rate';
--    → Colonne inexistante avant cette migration (commission_pct existe en %)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. TABLE PAIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paies (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id    UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_role  TEXT         NOT NULL CHECK (recipient_role IN ('chatter', 'modele')),
  gerant_id       UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
  montant         FLOAT        NOT NULL,
  devise          TEXT         DEFAULT 'CHF',
  periode_debut   DATE,
  periode_fin     DATE,
  ca_genere       FLOAT,
  commission_rate FLOAT,
  methode         TEXT         DEFAULT 'virement',
  note            TEXT,
  status          TEXT         DEFAULT 'paye' CHECK (status IN ('paye', 'en_attente', 'annule')),
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2. INDEX
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_paies_recipient_id  ON public.paies (recipient_id);
CREATE INDEX IF NOT EXISTS idx_paies_gerant_id     ON public.paies (gerant_id);
CREATE INDEX IF NOT EXISTS idx_paies_status        ON public.paies (status);
CREATE INDEX IF NOT EXISTS idx_paies_created_at    ON public.paies (created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.paies ENABLE ROW LEVEL SECURITY;

-- Gérant / Admin / CEO : accès complet
CREATE POLICY "paies_gerant_all" ON public.paies
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('gerant', 'admin', 'ceo')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('gerant', 'admin', 'ceo')
    )
  );

-- Chatter / Modèle : lecture seule de ses propres paies
CREATE POLICY "paies_recipient_select" ON public.paies
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 4. PROFILES — colonne commission_rate (décimal, ex: 0.30 = 30%)
--    Parallèle à commission_pct (entier, ex: 30 = 30%)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_rate FLOAT DEFAULT 0.30;

-- Backfill depuis commission_pct si disponible
UPDATE public.profiles
SET commission_rate = commission_pct / 100.0
WHERE commission_pct IS NOT NULL
  AND commission_pct > 0
  AND (commission_rate IS NULL OR commission_rate = 0.30);

-- ─────────────────────────────────────────────────────────────
-- 5. REALTIME (optionnel)
-- ─────────────────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.paies;
