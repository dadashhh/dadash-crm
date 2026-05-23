-- Manager chatter own TX commission must use manager_commission_pct, not chatter commission_pct.
-- This keeps chatter/model rights unchanged and only fixes transaction fee calculation.

CREATE OR REPLACE FUNCTION public.calc_transaction_fees()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  prov_fee_pct NUMERIC;
  dada_fee_pct NUMERIC := 12;
  chatter_comm_pct NUMERIC;
  v_amount NUMERIC;
  v_net NUMERIC;
BEGIN
  v_amount := COALESCE(NEW.amount_chf, NEW.amount, 0);
  NEW.amount := COALESCE(NEW.amount, v_amount);
  NEW.amount_chf := COALESCE(NEW.amount_chf, v_amount);

  SELECT COALESCE(p.commission_pct, p.commission_rate * 100, 10)
    INTO prov_fee_pct
    FROM profiles p
    WHERE p.id = NEW.provider_id;
  IF prov_fee_pct IS NULL THEN prov_fee_pct := 10; END IF;

  SELECT CASE
           WHEN p.role = 'manager_chatter' THEN COALESCE(p.manager_commission_pct, 12)
           ELSE COALESCE(p.commission_pct, p.commission_rate * 100, 0)
         END
    INTO chatter_comm_pct
    FROM profiles p
    WHERE p.id = NEW.chatter_id;
  IF chatter_comm_pct IS NULL THEN chatter_comm_pct := 0; END IF;

  NEW.provider_fee := v_amount * prov_fee_pct / 100;
  NEW.dada_fee := v_amount * dada_fee_pct / 100;
  v_net := v_amount - NEW.provider_fee - NEW.dada_fee;
  NEW.net_amount := v_net;
  NEW.chatter_commission := v_net * chatter_comm_pct / 100;
  NEW.margin := v_net - NEW.chatter_commission;
  NEW.updated_at := now();

  RETURN NEW;
END;
$function$;
