# Bàn giao: tìm kiếm, lọc, sắp xếp, phân trang (Món ăn / Đầu bếp / Nguyên liệu)

Môi trường kiểm thử: Node 22, PostgreSQL 16 cục bộ (cùng extension `unaccent`, `pg_trgm` như Supabase), 1.000 món / 60 đầu bếp / 120 nguyên liệu.

## 1. Chạy

```bash
cp .env.example .env        # điền DATABASE_URL (Supabase Session pooler, cổng 5432)
npm install
npm run db:migrate          # bảng còn thiếu + unaccent, pg_trgm, f_norm, f_tsv + index (chạy lại an toàn)
npm run db:seed             # 1.000 món / 60 đầu bếp / 120 nguyên liệu (chạy lại: tạo phần còn thiếu, không trùng)
npm run test:search         # 102 kiểm tra API
npm start                   # http://localhost:3000
```

Số bản ghi sau seed (in ra cuối `npm run db:seed`): `dishes 1000 · chefs 60 · ingredients 120 · dish_ingredients ≈ 4.900`. Chạy lại lần 2: "tạo mới: 0 món, 0 đầu bếp".

## 2. Search / filter / sort / phân trang nằm ở đâu

Server + PostgreSQL (`src/utils/list-query.js`). Thứ tự: `WHERE` (search + filter, AND) → `ORDER BY …, id ASC` → `LIMIT/OFFSET`. `total` là `COUNT(*)` cùng `WHERE`. Giá trị người dùng luôn là tham số; tên cột / hướng sort / mode chỉ lấy từ allowlist. Client chỉ gửi tham số; lọc tức thì ở client chỉ là hiển thị tạm trong lúc chờ server (300 ms).

## 3. Endpoint và ví dụ

`GET /api/dishes` (công khai) · `GET /api/chefs`, `GET /api/ingredients` (admin). Tham số: `mode`, `q`, `page`, `pageSize` (1–60), `sortBy`, `sortOrder`, `focus`, `all`; món: `category`, `available`, `minPrice`, `maxPrice`, `chefId`, **`chef`** (tên đầu bếp); đầu bếp: `specialty`; nguyên liệu: `unit`. Đầy đủ ở README mục 10 và API.md.

```text
GET /api/dishes?q=pho&minPrice=20000&maxPrice=80000&sortBy=price&sortOrder=asc&page=2&pageSize=3
{"ok":true,"data":[{"id":795,"name":"Phở cho trẻ em","price":53000},{"id":11,"name":"Pho ga ta","price":55000},{"id":875,"name":"Phở kiểu miền Tây","price":55000}],
 "meta":{"total":15,"sort":"price_asc","sortBy":"price","sortOrder":"asc","mode":"basic","page":2,"pageSize":3,"totalPages":5}}

GET /api/dishes?chef=lan&q=pho&pageSize=2        -> 1 món: "Phở hải sản" (Cô Lan), total=1
GET /api/dishes?mode=fuzzy&q=spagheti            -> "Spaghetti sốt cà" (gõ sai vẫn ra)
GET /api/dishes?minPrice=90000&maxPrice=1000
{"ok":false,"error":{"code":"VALIDATION_FAILED","message":"Dữ liệu gửi lên không hợp lệ.","fields":{"maxPrice":"maxPrice phải lớn hơn hoặc bằng minPrice"}}}
```

URL giao diện (bookmark được):
`/dishes?q=pho&sort=price_asc&page=2` · `/dishes?chef=co+lan` · `/dishes?view=infinite&page=5&sel=856` · chi tiết món: `/dishes/598`.

## 4. Query plan (EXPLAIN, `enable_seqscan=off` vì bảng nhỏ)

```text
basic   : Bitmap Index Scan on idx_dishes_name_trgm   Index Cond: (f_norm(name) ~~ '%bun bo%')
fulltext: Bitmap Index Scan on idx_dishes_fts         Index Cond: (f_tsv(name, description) @@ 'ham' & 'xuong')
fuzzy   : Bitmap Index Scan on idx_dishes_name_trgm   Index Cond: (f_norm(name) % 'spagheti')
```

Lọc theo tên đầu bếp dùng subquery `d."chefId" IN (SELECT id FROM chefs WHERE f_norm(name) LIKE …)` trên `idx_chefs_name_trgm`. Chưa tạo index mới (không cần thêm).

## 5. Network: mỗi lần chỉ tải đúng trang cần

```text
/dishes                                  GET /api/dishes?sort=name_asc&page=1
/dishes?q=pho&sort=price_asc&page=2      GET /api/dishes?q=pho&sort=price_asc&page=2        (1 request)
/dishes?view=more  + bấm "Xem thêm"      page=1, rồi page=2
/dishes?view=infinite + cuộn tới đáy     page=1, rồi page=2, page=3
```

## 6. Ảnh chụp (`docs/screenshots/`)

`1_chef_filter.png` lọc theo đầu bếp (tìm nâng cao) · `2_infinite.png` cuộn vô hạn · `3_pagination.png` phân trang số · `4_day_keo.png` dây kéo chọn chế độ · `5_back_restored.png` quay lại từ trang chi tiết.

## 7. Kết quả kiểm thử

- `npm run test:search`: **102 / 102** (seed ≥ 1.000 / ≥ 60, phân trang, search hoa/thường/dấu/đầu/giữa/cuối, `%` `_` `'` + chuỗi kiểu SQL injection, filter AND, `minPrice=0`, `available=false`, `minPrice>maxPrice`, sort + id phụ, full-text (mô tả NULL), fuzzy, lọc đầu bếp, `focus`, 401/403/404, CRUD ↔ total).
- `scripts/e2e/ui-check.py` (Chromium headless, 1.000 món): 3 chế độ, không lặp item, `?page=N` ở Load more tải lại đủ N trang sau F5, đổi q thì về đầu, dây kéo giữ q + sort và về trang 1, bookmark, `/dishes/:id` sau F5, Back và nút "← Danh sách món" cuộn lại đúng món, F5 khôi phục `scrollTop`, không có lỗi JS.

## 8. Lỗi phát hiện khi làm và cách chứng minh đã sửa

1. **Khôi phục cuộn sai (907 → 98).** Mở khung chi tiết làm lưới đổi bố cục, `scrollTop` nhảy và ghi đè giá trị đã lưu. Sửa: có `?sel` thì cuộn tới ô món đang chọn; chỉ lưu `scrollTop` khi không mở chi tiết. Test Playwright trước sửa FAIL, sau sửa PASS (`Back từ chi tiết: món vừa xem nằm trong màn hình`).
2. **Lưu cuộn nhầm khóa lúc rời màn hình**: khi đó URL đã đổi sang trang mới. Sửa: lưu ngay lúc bấm (URL còn là danh sách), không lưu ở `abort`.
3. **Seed ghi dở khi lỗi cấu hình**: kiểm tra đủ số lượng nằm sau bước tạo đầu bếp. Sửa: kiểm tra trước khi chạm DB. Chứng minh: thiếu 4 nguyên liệu → script báo lỗi, chạy sau khi bổ sung thì đủ 120.
4. **Seed đổi `TARGET` sẽ vượt số lượng** (DB đang có 500 món cũ, danh sách mới trùng ít tên). Sửa: chỉ tạo `TARGET − số món hiện có`. Chứng minh: 500 → 1.000 đúng, chạy lại vẫn 1.000.

## 9. Chưa làm / giới hạn

- Không có sort theo điểm đánh giá (schema không có cột rating, không tự thêm).
- Full-text dùng `plainto_tsquery` nên khớp cả từ, không khớp tiền tố (dùng `basic` cho khớp một phần từ). Fuzzy chỉ trên tên (không mở rộng sang mô tả).
- `mock-server/` đã bị xóa ở Block 9 (không còn khớp hợp đồng API: thiếu `ok`, JWT, `status`).
- Chưa thử trên Safari / Firefox / thiết bị cảm ứng thật; chưa chạy trên Supabase thật (chỉ Postgres 16 cục bộ).
