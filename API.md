# HỢP ĐỒNG API (frontend ⇄ backend) — theo đề "REST API và SPA"

Frontend là **SPA** (thư mục `frontend/`), gọi backend qua **REST API** dưới đường dẫn `/api`.
Backend làm đúng như dưới đây thì ghép vào là chạy.

## 1. Quy ước chung

| Mục                   | Quy ước                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Gốc API               | `/api`                                                                                                                            |
| Định dạng             | JSON (UTF-8). Riêng thêm/sửa **món ăn** dùng `multipart/form-data` vì có ảnh                                                      |
| Thành công            | HTTP **200**, `{ "ok": true, "data": ..., "meta"?: ... }` (`meta` chỉ có ở danh sách)                                             |
| Lỗi nghiệp vụ đã biết | HTTP **200**, `{ "ok": false, "error": { "code", "message", "fields"? } }`                                                        |
| Lỗi kỹ thuật          | đúng mã HTTP (404, 400, 500...), `{ "error": { "code", "message", "requestId" } }`: **không có `ok`**, không theo shape nghiệp vụ |
| Sửa                   | dùng **PATCH** (không dùng PUT); trường nào không gửi thì giữ nguyên                                                              |
| Xóa thành công        | HTTP 200, `{ "ok": true, "data": null }`                                                                                          |
| Số tiền               | `price` trả về **kiểu số**                                                                                                        |

### Lỗi nghiệp vụ (HTTP 200, `ok:false`)

| `code`              | Khi nào                                                         | `fields`                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOT_FOUND`         | không có bản ghi với id đó (kể cả id sai kiểu như `abc`)        | không có                                                                                                                                                              |
| `VALIDATION_FAILED` | dữ liệu gửi lên sai                                             | **có**: khóa là tên ô nhập (`name`, `price`, `category`, `chefId`, `ingredientIds`, `unit`, `specialty`, `description`, `image`), giá trị là thông báo riêng của ô đó |
| `ALREADY_EXISTS`    | vi phạm ràng buộc duy nhất ở DB (dự phòng)                      | không có                                                                                                                                                              |
| `RESOURCE_IN_USE`   | không xóa được vì còn ràng buộc (vd. đầu bếp còn phụ trách món) | không có                                                                                                                                                              |

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Dữ liệu chưa hợp lệ.",
    "fields": { "name": "Tên món đã tồn tại", "price": "Giá là bắt buộc" }
  }
}
```

### Lỗi kỹ thuật (đúng mã HTTP, không có `ok`)

| HTTP      | `code`                                         | Khi nào                                                               |
| --------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| 400       | `INVALID_JSON` / `BAD_REQUEST`                 | body không đọc được                                                   |
| 401       | `UNAUTHENTICATED` / `TOKEN_EXPIRED`            | thiếu/sai token (UNAUTHENTICATED); token hết hạn (TOKEN_EXPIRED). *(Block 9, đổi tên từ UNAUTHORIZED)* |
| 403       | `FORBIDDEN` / `CORS_NOT_ALLOWED`               | đã đăng nhập nhưng role không có quyền (RBAC) hoặc món không thỏa thuộc tính (ABAC) / origin lạ |
| 404       | `ROUTE_NOT_FOUND`                              | gọi sai URL `/api/...` (khác `NOT_FOUND` nghiệp vụ)                   |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | body quá lớn / sai Content-Type                                       |
| 500       | `DB_UNAVAILABLE` / `INTERNAL_ERROR`            | không kết nối được DB / lỗi hệ thống (không lộ chi tiết, chỉ ghi log) |

Frontend kiểm tra **ba tầng** (`frontend/js/api.js`): (1) có nhận được response không; (2) HTTP status có thành công không; (3) `ok` là `true` hay `false`. Rồi xử lý theo `error.code`, không so sánh câu chữ `message`.

## 2. Mô hình dữ liệu trả về

```jsonc
// Dish (món ăn): luôn kèm chef và ingredients
{ "id": 1, "name": "Phở bò", "description": "…" /* hoặc null */, "price": 65000,
  "category": "Món chính", "available": true, "status": "published" /* draft | published */,
  "imageUrl": "https://…/abc.webp" /* hoặc null */,
  "chefId": 1, "chef": { "id": 1, "name": "…", "specialty": "…" | null },
  "ingredients": [ { "id": 1, "name": "Thịt bò", "unit": "kg" } ] }
// Chef:       { "id": 1, "name": "…", "specialty": "…" | null }
// Ingredient: { "id": 1, "name": "…", "unit": "kg" }
// User:       { "id": 1, "name": "…", "email": "…", "role": "viewer" | "editor" | "admin", "chefId": 3 | null,
//               "mfaEnabled": false, "avatarUrl": "https://…/abc.webp" | null }
//             (không bao giờ có passwordHash, mfaSecret, tokenVersion, mã khôi phục, avatarPath)
```

## 3. Endpoint

`:resource` = `dishes` | `chefs` | `ingredients`

| Phương thức | Đường dẫn                                   | Quyền     | Kết quả thành công (HTTP 200)                                               |
| ----------- | ------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| GET         | `/api/auth/me` (Bearer)                     |           | `{ ok:true, data:{ id, name, email, role, chefId, mfaEnabled, avatarUrl } }` |
| POST        | `/api/auth/login` `{ email, password, recaptcha? }` |    | `data:{ accessToken, tokenType, expiresIn, user }` hoặc `data:{ next:"mfa", challenge }`; sai → HTTP 200 `INVALID_CREDENTIALS`/`ACCOUNT_NOT_ACTIVATED`/`CAPTCHA_REQUIRED`; khóa → 429 `RATE_LIMITED` |
| POST        | `/api/auth/logout`                          |           | `data: null` (client tự xóa token)                                          |
| POST        | `/api/auth/avatar` (Bearer, `multipart/form-data`, trường `avatar`) | đã đăng nhập | `data:` user có `avatarUrl` mới. Ảnh JPG/PNG/WEBP ≤ 3MB; **server** kiểm theo nội dung ảnh, cắt vuông 512px, đổi WEBP, bỏ EXIF. Ảnh lỗi/sai định dạng/quá nhỏ (< 32px)/quá lớn → HTTP 200 `VALIDATION_FAILED` `fields.avatar`; gửi JSON → 415; quá 20 lần/giờ/IP → 429 |
| DELETE      | `/api/auth/avatar` (Bearer)                 | đã đăng nhập | `data:` user với `avatarUrl: null` (gọi khi chưa có ảnh vẫn `ok:true`)   |
| POST        | `/api/auth/mfa/verify` `{ challenge, code\|recoveryCode }` |  | bước 2 của đăng nhập khi bật MFA → `data:{ accessToken, ... }` (xem mục MFA ở cuối) |
| GET         | `/api/options`                              | công khai | `data:{ categories, units, limits }`                                        |
| GET         | `/api/dishes`, `/api/dishes/:id`            | công khai | danh sách (mảng, rỗng cũng `ok:true`) / một bản ghi; không có → `NOT_FOUND` |
| GET         | `/api/chefs`, `/api/ingredients` (+ `/:id`) | viewer, editor, admin (Bearer) | như trên                                               |
| POST        | `/api/dishes`                               | editor, admin | bản ghi vừa tạo; sai dữ liệu → `VALIDATION_FAILED`. Editor luôn bị ép `chefId` = đầu bếp của mình và `status` = `draft` |
| POST        | `/api/chefs`, `/api/ingredients`            | **admin** | như trên                                                                    |
| PATCH       | `/api/dishes/:id`                           | editor (ABAC), admin | bản ghi sau khi sửa; sai → `VALIDATION_FAILED`; không có id → `NOT_FOUND`; editor chỉ sửa món có `chefId` = của mình **và** còn `draft`, ngược lại → 403 |
| PATCH       | `/api/chefs/:id`, `/api/ingredients/:id`    | **admin** | như trên                                                                    |
| DELETE      | `/api/:resource/:id`                        | **admin** | `data: null`; không có id → `NOT_FOUND`; bị chặn → `RESOURCE_IN_USE`        |

Thứ tự kiểm tra: không token/sai/hết hạn → **401** → role không có quyền (RBAC) → **403** → bản ghi không có → `NOT_FOUND` → thuộc tính không thỏa (ABAC, chỉ món ăn) → **403**. Quyền luôn tính từ role/`chefId` đọc từ **DB** theo token, không bao giờ từ `role`/`chefId`/`status` do client gửi trong body. GET không bao giờ ghi dữ liệu.

### Danh sách: `GET /api/:resource?q=&sort=&<bộ lọc>&page=&focus=` hoặc `?all=true`

Lọc và sắp xếp chạy trên **toàn bộ dữ liệu**, sau đó mới cắt trang (không sắp xếp riêng từng trang).

| Tham số                                         | Áp dụng cho | Ý nghĩa                                                                                                                                                               |
| ----------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`                                             | cả 3        | tìm theo **tên**, không phân biệt hoa/thường và dấu tiếng Việt, khớp chữ đầu / giữa / cuối, nhiều từ thì phải chứa đủ                                                 |
| `sort`                                          | cả 3        | `name_asc` (mặc định), `name_desc`, `newest`; riêng món ăn thêm `price_asc`, `price_desc`                                                                             |
| `category`, `available`, `minPrice`, `maxPrice` | món ăn      | danh mục (thuộc `categories`), `true`/`false`, khoảng giá (số nguyên ≥ 0, `minPrice` ≤ `maxPrice`)                                                                    |
| `specialty`                                     | đầu bếp     | chuyên môn chứa từ khóa (không phân biệt hoa/thường/dấu)                                                                                                              |
| `unit`                                          | nguyên liệu | đơn vị (thuộc `units`)                                                                                                                                                |
| `page`                                          | cả 3        | từ 1, 9 mục/trang; vượt tổng số trang thì trả `data: []` (vẫn `ok:true`, `meta.total` đúng), không kẹp                                                                |
| `focus`                                         | cả 3        | id một bản ghi: server trả về **đúng trang đang chứa bản ghi đó** (ưu tiên hơn `page`; không có trong kết quả thì dùng `page`). Dùng khi vào bằng bookmark `?sel=...` |
| `all=true`                                      | cả 3        | trả toàn bộ (không phân trang), `meta` chỉ có `total` và `sort`                                                                                                       |

Giá trị sai (`sort` lạ, `category` ngoài danh sách, `minPrice` không phải số...) → `VALIDATION_FAILED` kèm `fields` theo tên tham số. Bộ lọc không liên quan tới tài nguyên (vd. `unit` gửi cho món ăn) bị bỏ qua.

```json
{
  "ok": true,
  "data": [{ "id": 1, "name": "Phở bò" }],
  "meta": {
    "page": 1,
    "perPage": 9,
    "totalPages": 2,
    "total": 10,
    "sort": "name_asc"
  }
}
```

### Thêm / sửa MÓN ĂN: `multipart/form-data`

| Trường          | Giá trị                                                                 | Ghi chú                                                              |
| --------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `name`          | chuỗi                                                                   | bắt buộc, 2–120 ký tự, không trùng (không phân biệt hoa/thường)      |
| `description`   | chuỗi                                                                   | tối đa 1000, có thể rỗng                                             |
| `price`         | chuỗi số nguyên                                                         | bắt buộc, 1.000 – 100.000.000                                        |
| `category`      | chuỗi                                                                   | bắt buộc, thuộc `categories` của `/api/options`                      |
| `available`     | `"true"` \| `"false"`                                                   | còn bán                                                              |
| `status`        | `"draft"` \| `"published"`                                               | không gửi: giữ giá trị cũ (món mới = `draft`). **Editor bị ép `draft`**  |
| `chefId`        | chuỗi số                                                                | bắt buộc, đầu bếp phải tồn tại                                       |
| `ingredientIds` | **lặp lại khóa**; gửi khóa rỗng (`ingredientIds=`) = bỏ hết nguyên liệu | nguyên liệu phải tồn tại                                             |
| `image`         | file JPG/PNG/WEBP ≤ 3MB                                                 | tùy chọn; PATCH không gửi = **giữ ảnh cũ**; lỗi ảnh → `fields.image` |

**PATCH**: trường nào không gửi (khóa vắng mặt) thì giữ giá trị cũ; mọi trường vẫn được validate lại, và chỉ các trường khai báo ở trên mới được ghi (không bê nguyên request body vào DB).

### Thêm / sửa ĐẦU BẾP và NGUYÊN LIỆU: JSON

```jsonc
// POST/PATCH /api/chefs        { "name": "Cô Lan", "specialty": "Phở, nước dùng" }   // name 2–120, specialty ≤ 120
// POST/PATCH /api/ingredients  { "name": "Thịt bò", "unit": "kg" }                    // name 2–60 không trùng, unit thuộc units
```

## 4. CORS

`Access-Control-Allow-Origin` là **đúng origin của SPA** lấy từ biến môi trường `CORS_ORIGIN` (nhiều origin phân tách bằng dấu phẩy), **không dùng `*`**; origin lạ bị chặn `403 CORS_NOT_ALLOWED`. Preflight `OPTIONS` trả `204` kèm `Access-Control-Allow-Methods` (có `PATCH`, `DELETE`) và `Access-Control-Allow-Headers`.

Khi SPA và API chạy ở hai origin khác nhau: đặt `window.API_BASE` hoặc sửa `frontend/js/config.js` thành địa chỉ đầy đủ của API (vd. `http://localhost:3000/api`) và đặt `CORS_ORIGIN=http://localhost:5173` (origin của SPA) trong `.env` của API.

## 5. Routing phía client

Server trả `index.html` cho mọi đường dẫn GET không phải `/api` và không phải file tĩnh, để mở thẳng hoặc Reload `/dishes/2`, `/admin/dishes/3/edit`... vẫn đúng trang. Route giao diện không tồn tại → SPA tự hiện "không tìm thấy". Gọi sai URL **API** (404 kỹ thuật) → SPA hiện lỗi chung, không đánh đồng với `NOT_FOUND`.

## 6. Danh sách kiểm tra

1. `GET /api/dishes` → 200 `ok:true`, `data` là mảng (kể cả rỗng); `price` là số.
2. `GET /api/dishes/9999` và `/api/dishes/abc` → 200 `ok:false` `NOT_FOUND`.
3. `POST /api/dishes` để trống/giá âm/trùng tên → 200 `ok:false` `VALIDATION_FAILED` kèm `fields`.
4. `POST` hợp lệ → 200 `ok:true` kèm bản ghi mới.
5. `PATCH` hợp lệ → 200 `ok:true` bản ghi sau sửa; không gửi trường nào thì trường đó giữ nguyên; sai → `VALIDATION_FAILED`; id không có → `NOT_FOUND`.
6. `DELETE` → 200 `ok:true` `data:null`; id không có → `NOT_FOUND`; đầu bếp còn món → `RESOURCE_IN_USE`.
7. Gọi sai URL `/api/xyz` → HTTP 404 (không có `ok`); body JSON hỏng → 400; tắt DB → 500.
8. Header `Access-Control-Allow-Origin` = origin SPA (không `*`); `OPTIONS` preflight → 204.
9. Không token gọi `GET /api/chefs` → 401 `UNAUTHENTICATED`; token hết hạn → 401 `TOKEN_EXPIRED`; viewer `POST /api/dishes` → 403; editor `PATCH` món của đầu bếp khác hoặc món đã `published` → 403.
10. `POST /api/auth/avatar` không token → 401; file chữ giả làm `image/png` / GIF / SVG / ảnh > 3MB → `VALIDATION_FAILED` `fields.avatar`, không có file nào lên Storage.

---

## Bổ sung: tìm kiếm, sắp xếp, phân trang trên PostgreSQL

`GET /api/dishes | /api/chefs | /api/ingredients` nhận thêm: `mode` (`basic` | `advanced` | `fulltext` | `fuzzy`), `sortBy` (`name` | `newest` | `price` | `relevance`), `sortOrder` (`asc` | `desc`), `pageSize` (1–60, mặc định 9), `chefId` (món ăn), `chef` (món ăn: tên đầu bếp chứa chuỗi, không phân biệt hoa/thường/dấu). `meta` trả thêm `pageSize`, `sortBy`, `sortOrder`, `mode`. `sort=price_asc` kiểu cũ vẫn dùng được. `page` phải là số nguyên ≥ 1 (sai → `VALIDATION_FAILED`, vượt tổng số trang → `data: []`, không kẹp). Chi tiết: mục 10 của README.md.


## Đăng ký / quên mật khẩu (Block 9, Đợt 2) — tất cả POST JSON, không cần token

| Endpoint | Body | Thành công (`data`) | Lỗi |
|---|---|---|---|
| `POST /api/auth/register/otp` | `{ email, recaptcha }` | `{ cooldown:60 }` (email đã có tài khoản vẫn trả y hệt) | `VALIDATION_FAILED` (fields.email/captcha), 429 `RATE_LIMITED`, 502 `EMAIL_SEND_FAILED` |
| `POST /api/auth/register/verify` | `{ email, otp }` | `{ ticket }` | `OTP_INVALID`, 429 (khóa 15 phút sau 5 lần sai) |
| `POST /api/auth/register` | `{ email, ticket, name, password, passwordConfirm, inviteCode? }` | `null` (không có token, phải đăng nhập) | `TICKET_INVALID`, `VALIDATION_FAILED`, `ALREADY_EXISTS` |
| `POST /api/auth/forgot-password` | `{ email }` | `{ cooldown:60 }` (luôn thành công) | `VALIDATION_FAILED`, 429 |
| `GET /api/auth/reset-password/check?token=` | | `{ valid:true }` | `INVALID_RESET_TOKEN` |
| `POST /api/auth/reset-password` | `{ token, password, passwordConfirm }` | `null` | `INVALID_RESET_TOKEN`, `VALIDATION_FAILED` |

## MFA TOTP + mã khôi phục (Block 9, Đợt 4)

Đăng nhập khi đã bật MFA gồm **2 bước**: `POST /api/auth/login` (mật khẩu đúng) trả `data:{ next:"mfa", challenge }` — **chưa có `accessToken`**; challenge là token loại `mfa` sống 5 phút, *chỉ* dùng được ở `/api/auth/mfa/verify` (gọi API nghiệp vụ bằng challenge → 401). Bước 2 gửi mã 6 số của app Authenticator **hoặc** một mã khôi phục.

| Endpoint | Body | Thành công `data` | Lỗi |
|---|---|---|---|
| `POST /api/auth/mfa/verify` (công khai) | `{ challenge, code }` hoặc `{ challenge, recoveryCode }` | `{ accessToken, tokenType, expiresIn, user }`; dùng mã khôi phục thì thêm `recoveryUsed:true, recoveryRemaining` | challenge sai/hết hạn → 401 `UNAUTHENTICATED`/`TOKEN_EXPIRED`; sai mã → HTTP 200 `INVALID_MFA_CODE`; sai định dạng → `VALIDATION_FAILED` (không tính lần sai); sai 5 lần → 429 `RATE_LIMITED` (+`details.lockedSeconds`) |
| `GET /api/mfa/status` (Bearer) | | `{ enabled, setupPending }` | |
| `POST /api/mfa/setup` (Bearer) | MFA đang tắt: không cần body. **Đang bật (đổi thiết bị)**: `{ password, code \| recoveryCode }` | `{ secret, otpauthUrl, qrDataUrl }` (QR là data URL PNG; `mfaEnabled` vẫn không đổi) | `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `INVALID_MFA_CODE` |
| `POST /api/mfa/enable` (Bearer) | `{ code }` (mã 6 số của khóa vừa setup) | `{ accessToken, tokenType, expiresIn, user, recoveryCodes }`. **Lần bật đầu**: `recoveryCodes` = 10 mã `XXXXX-XXXXX`, *chỉ hiện một lần*. Đổi thiết bị: `recoveryCodes:null` (giữ nhóm cũ) | `INVALID_MFA_CODE`, `MFA_SETUP_REQUIRED` (chưa setup) |
| `POST /api/mfa/disable` (Bearer) | `{ password, code \| recoveryCode }` | `{ accessToken, ... }` | `MFA_NOT_ENABLED`, `INVALID_CREDENTIALS`, `INVALID_MFA_CODE` |
| `POST /api/mfa/recovery-codes/status` (Bearer) | `{ password, code \| recoveryCode }` | `{ total, remaining, createdAt }` (server chỉ giữ hash nên *không thể* hiện lại mã gốc) | như trên |
| `POST /api/mfa/recovery-codes/regenerate` (Bearer) | `{ password, code \| recoveryCode }` | `{ recoveryCodes }` (nhóm mới; nhóm cũ vô hiệu ngay) | như trên |

**Frontend cần biết**
- `enable` và `disable` **tăng `tokenVersion`** (thu hồi mọi token cũ, kể cả token đang gọi) nên response trả **accessToken mới** — SPA phải thay token đang lưu bằng token này, nếu không request kế tiếp sẽ bị 401.
- Xác thực lại = *mật khẩu + (mã 6 số hoặc mã khôi phục)*. Mật khẩu được kiểm trước nên mật khẩu sai không làm mất mã khôi phục. Sai mật khẩu → `INVALID_CREDENTIALS`, sai mã → `INVALID_MFA_CODE` (đều HTTP 200, **không** là 401 nên không được xóa token).
- Một mã 6 số chỉ dùng được **một lần** (kể cả trong cửa sổ ±30 giây) → báo người dùng chờ mã kế tiếp nếu bị từ chối ngay sau khi vừa dùng.
- Mã khôi phục hiển thị `XXXXX-XXXXX`; server chấp nhận gõ thường, có/không dấu gạch, có khoảng trắng.
- Mã lỗi mới: `MFA_NOT_ENABLED`, `MFA_SETUP_REQUIRED` (HTTP 200, `ok:false`).
