-- =====================================================================
-- 001_search_setup.sql  -  Tìm kiếm trên PostgreSQL (chạy lại nhiều lần vẫn an toàn)
--   * unaccent : bỏ dấu tiếng Việt          * pg_trgm : khớp chuỗi con nhanh + fuzzy (gần đúng)
--   * f_norm()          : chuẩn hóa văn bản = bỏ dấu + chữ thường (đ -> d)   -> dùng cho CẢ dữ liệu LẪN từ khóa
--   * f_tsv()           : tsvector cấu hình 'simple' cho full-text (mô tả NULL được coalesce thành chuỗi rỗng)
--   * index GIN trgm    : tìm chuỗi con (LIKE '%x%') và fuzzy (%)       * index GIN tsvector : full-text
-- Bảng dishes / chefs / ingredients do Sequelize sync() tạo trước (npm run db:migrate tự sync trước).
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- IMMUTABLE để dùng được trong expression index. search_path cố định để chạy được cả khi extension nằm ở schema "extensions" (Supabase).
CREATE OR REPLACE FUNCTION f_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT lower(translate(unaccent('unaccent', coalesce(t, '')), 'đĐ', 'dd'))
$$;

-- Full-text: cùng cấu hình 'simple' cho document và query; NULL -> chuỗi rỗng.
CREATE OR REPLACE FUNCTION f_tsv(a text, b text) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT to_tsvector('simple'::regconfig, f_norm(coalesce(a, '') || ' ' || coalesce(b, '')))
$$;

-- ---- tìm chuỗi con (đầu / giữa / cuối) + fuzzy trên tên ----
CREATE INDEX IF NOT EXISTS idx_dishes_name_trgm       ON dishes      USING gin (f_norm(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_chefs_name_trgm        ON chefs       USING gin (f_norm(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ingredients_name_trgm  ON ingredients USING gin (f_norm(name) gin_trgm_ops);
-- chuyên môn đầu bếp (bộ lọc specialty dạng chứa chuỗi)
CREATE INDEX IF NOT EXISTS idx_chefs_specialty_trgm   ON chefs       USING gin (f_norm(specialty) gin_trgm_ops);

-- ---- full-text ----
CREATE INDEX IF NOT EXISTS idx_dishes_fts      ON dishes      USING gin (f_tsv(name, description));
CREATE INDEX IF NOT EXISTS idx_chefs_fts       ON chefs       USING gin (f_tsv(name, specialty));
CREATE INDEX IF NOT EXISTS idx_ingredients_fts ON ingredients USING gin (f_tsv(name, NULL));

-- ---- lọc / sắp xếp / khóa ngoại ----
CREATE INDEX IF NOT EXISTS idx_dishes_price    ON dishes (price, id);
CREATE INDEX IF NOT EXISTS idx_dishes_category ON dishes (category);
CREATE INDEX IF NOT EXISTS idx_dishes_chef     ON dishes ("chefId");
