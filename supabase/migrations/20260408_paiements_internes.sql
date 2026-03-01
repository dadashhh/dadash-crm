-- =============================================================================
-- MIGRATION: paiements_internes -- Table unifiee + vues de soldes
-- Date: 2026-04-08  |  Option A: Reset propre
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. RESET -- Suppression des anciennes tables de paiements (IF EXISTS)
--    CASCADE pour nettoyer les FK dependantes (ex: ledger_entries)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.payment_events  CASCADE;
DROP TABLE IF EXISTS public.paies           CASCADE;
DROP TABLE IF EXISTS public.payments        CASCADE;
DROP TABLE IF EXISTS public.payout_requests CASCADE;
DROP TABLE IF EXISTS public.ledger_entries  CASCADE;

-- -----------------------------------------------------------------------------
-- 1. HELPER _get_my_role() -- utilise par les policies RLS
--    SQL function, corps sans point-virgule interne : guillemets simples OK
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 'SELECT role FROM public.profiles WHERE id = auth.uid()';

GRANT EXECUTE ON FUNCTION public._get_my_role() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. TABLE paiements_internes
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.paiements_internes (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Createur
  createur_role         TEXT          NOT NULL
                          CHECK (createur_role IN ('gerant', 'provider')),
  createur_id           TEXT          NOT NULL,
  createur_name         TEXT,

  -- Destinataire
  destinataire_type     TEXT          NOT NULL
                          CHECK (destinataire_type IN ('chatter', 'modele', 'gerant')),
  destinataire_id       UUID          NOT NULL,
  destinataire_name     TEXT,

  -- Montant
  type                  TEXT          NOT NULL
                          CHECK (type IN ('commission', 'bonus', 'remboursement', 'reversement_ca', 'autre')),
  montant               DECIMAL(10,2) NOT NULL CHECK (montant > 0),
  devise                TEXT          NOT NULL DEFAULT 'CHF',
  periode_debut         DATE,
  periode_fin           DATE,
  note                  TEXT,

  -- Detail du calcul : {"ca_genere":2682,"taux":20,"brut":536.4,"deja_verse":107,"solde_du":429.4}
  calcul_detail         JSONB         NOT NULL DEFAULT '{}',

  -- Statut
  statut                TEXT          NOT NULL DEFAULT 'pending'
                          CHECK (statut IN ('draft', 'pending', 'validated', 'contested', 'cancelled')),
  validated_at          TIMESTAMPTZ,
  contested_at          TIMESTAMPTZ,
  contestation_message  TEXT,

  -- Facture
  facture_numero        TEXT,
  facture_generated     BOOLEAN       NOT NULL DEFAULT FALSE,
  facture_pdf_url       TEXT
);

-- -----------------------------------------------------------------------------
-- 3. INDEX
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pi_destinataire ON public.paiements_internes (destinataire_id, destinataire_type);
CREATE INDEX IF NOT EXISTS idx_pi_createur     ON public.paiements_internes (createur_id, createur_role);
CREATE INDEX IF NOT EXISTS idx_pi_statut       ON public.paiements_internes (statut);
CREATE INDEX IF NOT EXISTS idx_pi_periode      ON public.paiements_internes (periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_pi_created_at   ON public.paiements_internes (created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. TRIGGER updated_at  (PL/pgSQL avec $$ -- corps isole, pas de conflit)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pi_updated_at ON public.paiements_internes;
CREATE TRIGGER trg_pi_updated_at
  BEFORE UPDATE ON public.paiements_internes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.paiements_internes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pi_gerant_all           ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_select  ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_select      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_provider_insert      ON public.paiements_internes;
DROP POLICY IF EXISTS pi_destinataire_contest ON public.paiements_internes;

-- Gerant / admin / ceo : acces complet
CREATE POLICY pi_gerant_all ON public.paiements_internes
  FOR ALL TO authenticated
  USING     (public._get_my_role() IN ('gerant', 'admin', 'ceo'))
  WITH CHECK (public._get_my_role() IN ('gerant', 'admin', 'ceo'));

-- Chatter / modele : lecture de ses propres paiements recus
CREATE POLICY pi_destinataire_select ON public.paiements_internes
  FOR SELECT TO authenticated
  USING (destinataire_id = auth.uid());

-- Provider : lecture de ses propres paiements emis
CREATE POLICY pi_provider_select ON public.paiements_internes
  FOR SELECT TO authenticated
  USING (createur_id = auth.uid()::text AND createur_role = 'provider');

-- Provider : peut creer des reversements vers le gerant
CREATE POLICY pi_provider_insert ON public.paiements_internes
  FOR INSERT TO authenticated
  WITH CHECK (
    public._get_my_role() = 'provider'
    AND createur_id       = auth.uid()::text
    AND createur_role     = 'provider'
    AND destinataire_type = 'gerant'
  );

-- Destinataire : peut contester un paiement
CREATE POLICY pi_destinataire_contest ON public.paiements_internes
  FOR UPDATE TO authenticated
  USING     (destinataire_id = auth.uid())
  WITH CHECK (destinataire_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. VUE vue_soldes_chatters
--    CA via transactions.chatter_id  |  taux = profiles.commission_pct
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vue_soldes_chatters AS
SELECT
  p.id                                  AS chatter_id,
  p.name,
  COALESCE(p.commission_pct, 20)        AS taux,
  COALESCE((
    SELECT SUM(t.amount)
    FROM public.transactions t
    WHERE t.chatter_id = p.id
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)                                 AS ca_genere,
  COALESCE((
    SELECT SUM(t.amount) * COALESCE(p.commission_pct, 20) / 100.0
    FROM public.transactions t
    WHERE t.chatter_id = p.id
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)                                 AS commission_brute,
  COALESCE((
    SELECT SUM(pi.montant)
    FROM public.paiements_internes pi
    WHERE pi.destinataire_id   = p.id
      AND pi.destinataire_type = 'chatter'
      AND pi.statut            = 'validated'
  ), 0)                                 AS deja_verse,
  COALESCE((
    SELECT SUM(t.amount) * COALESCE(p.commission_pct, 20) / 100.0
    FROM public.transactions t
    WHERE t.chatter_id = p.id
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)
  - COALESCE((
    SELECT SUM(pi.montant)
    FROM public.paiements_internes pi
    WHERE pi.destinataire_id   = p.id
      AND pi.destinataire_type = 'chatter'
      AND pi.statut            = 'validated'
  ), 0)                                 AS solde_du
FROM public.profiles p
WHERE p.role = 'chatter';

GRANT SELECT ON public.vue_soldes_chatters TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. VUE vue_soldes_modeles
--    CA via transactions.model_id
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vue_soldes_modeles AS
SELECT
  p.id                                  AS modele_id,
  p.name,
  COALESCE(p.commission_pct, 20)        AS taux,
  COALESCE((
    SELECT SUM(t.amount)
    FROM public.transactions t
    WHERE t.model_id = p.id
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)                                 AS ca_genere,
  COALESCE((
    SELECT SUM(t.amount) * COALESCE(p.commission_pct, 20) / 100.0
    FROM public.transactions t
    WHERE t.model_id = p.id
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)                                 AS commission_brute,
  COALESCE((
    SELECT SUM(pi.montant)
    FROM public.paiements_internes pi
    WHERE pi.destinataire_id   = p.id
      AND pi.destinataire_type = 'modele'
      AND pi.statut            = 'validated'
  ), 0)                                 AS deja_verse,
  COALESCE((
    SELECT SUM(t.amount) * COALESCE(p.commission_pct, 20) / 100.0
    FROM public.transactions t
    WHERE t.model_id = p.id
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)
  - COALESCE((
    SELECT SUM(pi.montant)
    FROM public.paiements_internes pi
    WHERE pi.destinataire_id   = p.id
      AND pi.destinataire_type = 'modele'
      AND pi.statut            = 'validated'
  ), 0)                                 AS solde_du
FROM public.profiles p
WHERE p.role = 'modele';

GRANT SELECT ON public.vue_soldes_modeles TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. VUE vue_soldes_providers  (sens inverse : provider doit au gerant)
--    CA via assigned_models (JSONB) -> transactions.model_id
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vue_soldes_providers AS
SELECT
  p.id                                  AS provider_id,
  p.name,
  COALESCE(p.commission_pct, 80)        AS taux,
  COALESCE((
    SELECT SUM(t.amount)
    FROM public.transactions t
    WHERE t.model_id IN (
      SELECT (elem)::uuid
      FROM jsonb_array_elements_text(
        COALESCE(p.assigned_models, '[]'::jsonb)
      ) AS elem
    )
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)                                 AS ca_genere,
  COALESCE((
    SELECT SUM(t.amount) * COALESCE(p.commission_pct, 80) / 100.0
    FROM public.transactions t
    WHERE t.model_id IN (
      SELECT (elem)::uuid
      FROM jsonb_array_elements_text(
        COALESCE(p.assigned_models, '[]'::jsonb)
      ) AS elem
    )
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)                                 AS reversement_brut,
  COALESCE((
    SELECT SUM(pi.montant)
    FROM public.paiements_internes pi
    WHERE pi.createur_id   = p.id::text
      AND pi.createur_role = 'provider'
      AND pi.statut        = 'validated'
  ), 0)                                 AS deja_verse,
  COALESCE((
    SELECT SUM(t.amount) * COALESCE(p.commission_pct, 80) / 100.0
    FROM public.transactions t
    WHERE t.model_id IN (
      SELECT (elem)::uuid
      FROM jsonb_array_elements_text(
        COALESCE(p.assigned_models, '[]'::jsonb)
      ) AS elem
    )
      AND t.status IN ('valid', 'validated', 'confirmee')
  ), 0)
  - COALESCE((
    SELECT SUM(pi.montant)
    FROM public.paiements_internes pi
    WHERE pi.createur_id   = p.id::text
      AND pi.createur_role = 'provider'
      AND pi.statut        = 'validated'
  ), 0)                                 AS solde_du
FROM public.profiles p
WHERE p.role = 'provider';

GRANT SELECT ON public.vue_soldes_providers TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. VERIFICATION (executer apres migration)
-- SELECT chatter_id, name, taux, ca_genere, commission_brute, deja_verse, solde_du
-- FROM vue_soldes_chatters;
-- Attendu : Mala, Zorro, Livio, carla
-- -----------------------------------------------------------------------------
