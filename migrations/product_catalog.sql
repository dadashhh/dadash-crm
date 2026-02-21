-- =============================================
-- PHASE 2: Product Catalog + Tags + Model Prices
-- =============================================

-- Produits (catégories)
CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text,
  description text,
  has_duration boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true
);

-- Tags (variantes de produit)
CREATE TABLE IF NOT EXISTS product_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  default_price numeric(10,2) DEFAULT 0,
  default_currency text DEFAULT 'EUR',
  duration_minutes integer,
  description text,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true,
  UNIQUE(product_id, slug)
);

-- Prix override par modèle
CREATE TABLE IF NOT EXISTS model_prices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid NOT NULL REFERENCES profiles(id),
  product_tag_id uuid NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
  price numeric(10,2) NOT NULL,
  currency text DEFAULT 'EUR',
  active boolean DEFAULT true,
  UNIQUE(model_id, product_tag_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_product_tags_product ON product_tags(product_id);
CREATE INDEX IF NOT EXISTS idx_model_prices_model ON model_prices(model_id);
CREATE INDEX IF NOT EXISTS idx_model_prices_tag ON model_prices(product_tag_id);

-- FK sur transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_tag_id uuid REFERENCES product_tags(id);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_read ON products FOR SELECT USING (true);
CREATE POLICY products_write ON products FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

CREATE POLICY tags_read ON product_tags FOR SELECT USING (true);
CREATE POLICY tags_write ON product_tags FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

CREATE POLICY prices_read ON model_prices FOR SELECT USING (true);
CREATE POLICY prices_write ON model_prices FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- =============================================
-- SEED DATA: 9 produits, ~35 tags
-- =============================================

-- 🔴 Cam Live (has_duration = true)
INSERT INTO products (name, slug, icon, has_duration, sort_order) VALUES
('Cam Live', 'cam-live', '🔴', true, 1);

INSERT INTO product_tags (product_id, name, slug, default_price, duration_minutes, sort_order) VALUES
((SELECT id FROM products WHERE slug='cam-live'), 'Cam douche 5 min', 'cam-douche-5', 50, 5, 1),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam douche 10 min', 'cam-douche-10', 90, 10, 2),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam douche 15 min', 'cam-douche-15', 120, 15, 3),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam chambre 5 min', 'cam-chambre-5', 50, 5, 4),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam chambre 10 min', 'cam-chambre-10', 90, 10, 5),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam chambre 15 min', 'cam-chambre-15', 120, 15, 6),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam lingerie 5 min', 'cam-lingerie-5', 60, 5, 7),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam lingerie 10 min', 'cam-lingerie-10', 100, 10, 8),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam custom 5 min', 'cam-custom-5', 70, 5, 9),
((SELECT id FROM products WHERE slug='cam-live'), 'Cam custom 10 min', 'cam-custom-10', 120, 10, 10);

-- 🎥 Vidéo Solo
INSERT INTO products (name, slug, icon, sort_order) VALUES
('Vidéo Solo', 'video-solo', '🎥', 2);

INSERT INTO product_tags (product_id, name, slug, default_price, duration_minutes, sort_order) VALUES
((SELECT id FROM products WHERE slug='video-solo'), 'Vidéo solo 3 min', 'video-solo-3', 30, 3, 1),
((SELECT id FROM products WHERE slug='video-solo'), 'Vidéo solo 5 min', 'video-solo-5', 50, 5, 2),
((SELECT id FROM products WHERE slug='video-solo'), 'Vidéo solo 10 min', 'video-solo-10', 80, 10, 3);

-- 🎬 Vidéo Sextape
INSERT INTO products (name, slug, icon, sort_order) VALUES
('Vidéo Sextape', 'video-sextape', '🎬', 3);

INSERT INTO product_tags (product_id, name, slug, default_price, duration_minutes, sort_order) VALUES
((SELECT id FROM products WHERE slug='video-sextape'), 'Sextape 5 min', 'sextape-5', 60, 5, 1),
((SELECT id FROM products WHERE slug='video-sextape'), 'Sextape 10 min', 'sextape-10', 100, 10, 2),
((SELECT id FROM products WHERE slug='video-sextape'), 'Sextape 15 min', 'sextape-15', 140, 15, 3);

-- 💬 Sexting (has_duration = true)
INSERT INTO products (name, slug, icon, has_duration, sort_order) VALUES
('Sexting', 'sexting', '💬', true, 4);

INSERT INTO product_tags (product_id, name, slug, default_price, duration_minutes, sort_order) VALUES
((SELECT id FROM products WHERE slug='sexting'), 'Sexting 10 min', 'sexting-10', 20, 10, 1),
((SELECT id FROM products WHERE slug='sexting'), 'Sexting 15 min', 'sexting-15', 30, 15, 2),
((SELECT id FROM products WHERE slug='sexting'), 'Sexting 30 min', 'sexting-30', 50, 30, 3),
((SELECT id FROM products WHERE slug='sexting'), 'Sexting 60 min', 'sexting-60', 80, 60, 4);

-- 📸 Pack Photo
INSERT INTO products (name, slug, icon, sort_order) VALUES
('Pack Photo', 'pack-photo', '📸', 5);

INSERT INTO product_tags (product_id, name, slug, default_price, sort_order) VALUES
((SELECT id FROM products WHERE slug='pack-photo'), 'Pack 5 photos', 'pack-5', 30, 1),
((SELECT id FROM products WHERE slug='pack-photo'), 'Pack 10 photos', 'pack-10', 50, 2),
((SELECT id FROM products WHERE slug='pack-photo'), 'Pack 20 photos', 'pack-20', 80, 3),
((SELECT id FROM products WHERE slug='pack-photo'), 'Pack premium', 'pack-premium', 120, 4);

-- 🎨 Custom
INSERT INTO products (name, slug, icon, sort_order) VALUES
('Custom', 'custom', '🎨', 6);

INSERT INTO product_tags (product_id, name, slug, default_price, duration_minutes, sort_order) VALUES
((SELECT id FROM products WHERE slug='custom'), 'Custom photo', 'custom-photo', 40, NULL, 1),
((SELECT id FROM products WHERE slug='custom'), 'Custom vidéo 3 min', 'custom-video-3', 60, 3, 2),
((SELECT id FROM products WHERE slug='custom'), 'Custom vidéo 5 min', 'custom-video-5', 90, 5, 3),
((SELECT id FROM products WHERE slug='custom'), 'Custom vidéo 10 min', 'custom-video-10', 150, 10, 4);

-- 🍆 Dick Rating
INSERT INTO products (name, slug, icon, sort_order) VALUES
('Dick Rating', 'dick-rating', '🍆', 7);

INSERT INTO product_tags (product_id, name, slug, default_price, sort_order) VALUES
((SELECT id FROM products WHERE slug='dick-rating'), 'Dick rating texte', 'dr-texte', 15, 1),
((SELECT id FROM products WHERE slug='dick-rating'), 'Dick rating vocal', 'dr-vocal', 20, 2),
((SELECT id FROM products WHERE slug='dick-rating'), 'Dick rating vidéo', 'dr-video', 30, 3);

-- 💝 Tribute
INSERT INTO products (name, slug, icon, sort_order) VALUES
('Tribute', 'tribute', '💝', 8);

INSERT INTO product_tags (product_id, name, slug, default_price, sort_order) VALUES
((SELECT id FROM products WHERE slug='tribute'), 'Tip', 'tip', 0, 1),
((SELECT id FROM products WHERE slug='tribute'), 'Tribute', 'tribute', 0, 2),
((SELECT id FROM products WHERE slug='tribute'), 'Cadeau', 'cadeau', 0, 3);

-- 💭 Contenu / Discussion
INSERT INTO products (name, slug, icon, sort_order) VALUES
('Contenu / Discussion', 'contenu-discussion', '💭', 9);

INSERT INTO product_tags (product_id, name, slug, default_price, sort_order) VALUES
((SELECT id FROM products WHERE slug='contenu-discussion'), 'Pack contenu', 'pack-contenu', 50, 1),
((SELECT id FROM products WHERE slug='contenu-discussion'), 'Discussion payante', 'discussion-payante', 30, 2);
