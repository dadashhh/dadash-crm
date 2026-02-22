-- Atomic invoice counter RPC
-- Prevents race conditions when generating invoice numbers concurrently
-- Usage: SELECT * FROM next_invoice_number();

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM NOW())::INT;
  next_num INT;
BEGIN
  -- Upsert with atomic increment in a single statement
  INSERT INTO invoice_counter (id, year, last_number)
  VALUES (1, current_year, 1)
  ON CONFLICT (id) DO UPDATE
    SET last_number = CASE
      WHEN invoice_counter.year = current_year THEN invoice_counter.last_number + 1
      ELSE 1
    END,
    year = current_year
  RETURNING last_number INTO next_num;

  RETURN 'DADASH-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;
