# CÁI QUÁN ĂN — Block 9 (Block 7 chuyển từ CSR "chọn vai" sang JWT)

Website quản lý và giới thiệu món ăn: **SPA** (`frontend/`, JavaScript thuần) + **REST API** (`/api`, Node.js, Express, Sequelize, PostgreSQL/Supabase). Block 9 thay cơ chế "chọn vai bằng cookie" của Block 7 bằng **xác thực thật bằng JWT**: đăng ký có OTP email, đăng nhập email + mật khẩu, chống dò mật khẩu, quên mật khẩu, MFA TOTP kèm mã khôi phục, phân quyền **RBAC** (viewer / editor / admin) và **ABAC** (editor chỉ sửa món nháp của chính đầu bếp mình), ảnh đại diện.

> ## Tình trạng bàn giao
>
> - **Backend: hoàn thành** (B1–B26, H6 phần backend, dọn X1–X5, X7, X8). Kiểm thử tự động trên Postgres 16: `test:auth` 34 · `test:register` 30 · `test:mfa` 83 · `test:avatar` 34 · `test:search` 105, tất cả đạt (chạy lại `test:auth` và `test:search` sau khi sửa frontend: vẫn đạt).
> - **Frontend: luồng xác thực đã triển khai** — nền JWT và toàn bộ luồng vào/ra tài khoản: `F1–F7` (gắn `Authorization`, lưu token, xử lý lỗi 401/403/429, đăng nhập, đăng ký 3 bước, quên / đặt lại mật khẩu, nhập mã MFA) + phần tối thiểu để app không vỡ (route mới và route guard `F9`, nút Đăng xuất `F12` một phần, `H1`, vá nhẹ trang phố, bỏ giao diện "chọn vai" `X6`). Chi tiết ở **mục 12**. Kiểm tra bằng Chromium headless trên backend thật: `scripts/e2e/auth-ui-check.py`, **53/53 theo lần chạy được ghi trong README gốc; chưa chạy lại trên Supabase online trong lần tích hợp này**.
> - **Frontend: đã có mã triển khai cho F8–F14** — gồm trang bảo mật MFA, route, giao diện quyền viewer/editor/admin, ô trạng thái món, thanh trên và escape dữ liệu. **Chưa xác nhận toàn bộ hành vi bằng e2e trên Supabase**; riêng F13 cần chạy hồi quy đầy đủ. Xem mục 9 và 14.
> - **Chưa thử với dịch vụ thật**: Supabase Storage (ảnh món và ảnh đại diện), SMTP/Resend, **reCAPTCHA thật** (giao diện mới chỉ thử với ô tick giả lập khi chưa đặt `RECAPTCHA_SITE_KEY`). Các test thay chúng bằng bản giả hoặc chế độ dev (`DEV_PRINT_MAIL`, bỏ qua reCAPTCHA khi chưa có khóa).
> - Kế hoạch gốc: `Ke-hoach-chuyen-Block-7-CSR-sang-JWT.md` (mã việc B/F/H/X/T lấy theo file đó).

Ký hiệu trong bảng lịch sử: ✅ là trạng thái được báo cáo ở phiên bản trước; **không có nghĩa đã chạy lại trên Supabase trong lần bàn giao này**. Trạng thái mới được phân biệt ở mục 14.

## Mục lục

1. [Tiến độ so với kế hoạch](#1-tiến-độ-so-với-kế-hoạch)
2. [Công nghệ](#2-công-nghệ)
3. [Cài đặt và chạy](#3-cài-đặt-và-chạy)
4. [Xác thực và phân quyền](#4-xác-thực-và-phân-quyền)
5. [REST API tóm tắt](#5-rest-api-tóm-tắt)
6. [Cấu trúc thư mục](#6-cấu-trúc-thư-mục)
7. [Lệnh npm](#7-lệnh-npm)
8. [Kiểm thử](#8-kiểm-thử)
9. [Việc còn lại và giới hạn](#9-việc-còn-lại-và-giới-hạn)
10. [Giao diện SPA: danh sách, bộ lọc, ba chế độ hiển thị](#10-giao-diện-spa-danh-sách-bộ-lọc-ba-chế-độ-hiển-thị)
11. [Tìm kiếm trên PostgreSQL](#11-tìm-kiếm-trên-postgresql)
12. [Frontend xác thực — nửa đầu (F1–F7)](#12-frontend-xác-thực--nửa-đầu-f1f7)

## 1. Tiến độ so với kế hoạch

| Nhóm | Kết quả |
|---|---|
| Backend `B1–B26` | **26 / 26** ✅ |
| Trang home, phần backend `H6` (API ảnh đại diện) | ✅ |
| Dọn / xóa `X1–X5`, `X7`, `X8` | ✅ (xem bên dưới) |
| Kiểm thử `T1–T13` | ✅ tự động (backend) · `T14` ⬜ (cần trang home đầy đủ) |
| Frontend `F1–F7`, `X6` | **✅ xong** (mục 12) |
| Frontend `F9`, `F12` | ✅ (`F12`: thanh trên có liên kết **Bảo mật**; đăng xuất chỉ bằng con thuyền, mục 12.9) |
| Frontend `F8`, `F10–F11`, `F14` | Có mã triển khai; chưa nghiệm thu đầy đủ trên Supabase (mục 9, 14) |
| Frontend `F13` | Có chức năng trang khách; cần kiểm thử hồi quy tìm kiếm / phân trang / ba chế độ (mục 9, 14) |
| Trang home `H1` | ✅ |
| Trang home `H2–H11` | ✅ xong (mục 12.9): thuyền = đăng xuất, nước tràn, hộp "Vai trò không hợp lệ", cô gái + vé hành khách + đổi ảnh, ảnh / âm thanh / CSS của Block 8 |

### Backend (mục 4 của kế hoạch)

| ID | Việc | | Ghi chú |
|----|------|:---:|---------|
| B1 | Gói + biến `.env` | ✅ | `bcryptjs`, `jsonwebtoken`, `nodemailer`, `qrcode`; **không dùng `otplib`** (bản mới đổi API/ESM): TOTP tự cài ở `src/utils/totp.js`, kiểm bằng 6 vector RFC 6238 |
| B2 | Model `User` | ✅ | role `viewer/editor/admin`, `chefId`, `tokenVersion`, cột MFA, bộ đếm đăng nhập sai, **`avatarUrl/avatarPath`** |
| B3 | `RegisterOtp`, `PasswordReset` | ✅ | |
| B4 | `RecoveryCode` | ✅ | chỉ lưu HMAC-SHA256 của mã |
| B5 | `dishes.status` | ✅ | `draft` / `published`; seed ghi `published` tường minh |
| B6 | Migrate cột thiếu | ✅ | `src/utils/migrate.js` gọi sau `sync()`; thêm cả `users.avatarUrl/avatarPath` vào DB đang có dữ liệu |
| B7 | Tiện ích copy từ Block 8 | ✅ | `security, validators, mailer, recaptcha, rateLimit (429 dạng API), cleanup` |
| B8 | `jwt.js` | ✅ | HS256 cố định; từ chối `alg:none`/HS512; challenge MFA loại `mfa` sống 5 phút |
| B9 | Middleware `authenticate` | ✅ | role đọc từ DB, so `tokenVersion`; 401 `UNAUTHENTICATED` / `TOKEN_EXPIRED` |
| B10 | `POST /auth/login` | ✅ | bcrypt + hash giả, CAPTCHA từ lần sai 3, khóa 5 phút sau 10 lần, `ACCOUNT_NOT_ACTIVATED`, bật MFA → `next:"mfa"` |
| B11 | `GET /auth/me` | ✅ | thêm `avatarUrl` |
| B12 | `POST /auth/logout` | ✅ | |
| B13 | Đăng ký 3 bước | ✅ | role luôn `viewer`; đúng `CHEF_INVITE_CODE` → `editor` |
| B14 | Quên / đặt lại mật khẩu | ✅ | `tokenVersion+1`, không tắt MFA, không cấp token |
| B15 | Mã lỗi mới | ✅ | + `MFA_NOT_ENABLED`, `MFA_SETUP_REQUIRED` |
| B16 | CORS | ✅ | chỉ origin trong `CORS_ORIGIN`, header `Content-Type, Authorization`, không `*`, không credentials |
| B17 | RBAC | ✅ | `src/api/permissions.js`, `requirePermission` |
| B18 | ABAC món ăn | ✅ | 401 → 403 (role) → 404 → 403 (thuộc tính); `SELECT … FOR UPDATE` trong transaction |
| B19 | MFA TOTP | ✅ | `setup`, `enable`, `verify`, `disable`, `status`; bước ±1; mã dùng 1 lần; sai 5 lần → khóa 5 phút theo tài khoản; khóa TOTP mã hóa AES-256-GCM |
| B20 | Recovery code | ✅ | 10 mã/nhóm, dùng 1 lần, tạo nhóm mới thì nhóm cũ bị xóa |
| B21 | Xác thực lại thao tác nhạy cảm | ✅ | mật khẩu + (TOTP hoặc recovery): đổi thiết bị, tắt MFA, xem/tạo lại recovery |
| B22 | Serializer người dùng | ✅ | không bao giờ trả `passwordHash`, `mfaSecret`, `tokenVersion`, hash recovery, `avatarPath` |
| B23 | `set-role.js`, seed 3 tài khoản | ✅ | `npm run db:seed:users` |
| B24 | `startCleanup()` | ✅ | dọn OTP, link đặt lại, tài khoản chưa kích hoạt quá 7 ngày |
| B25 | Không copy `csrf.js` | ✅ | không còn cookie xác thực nên không có CSRF |
| B26 | Giữ tìm kiếm / phân trang / CRUD / upload ảnh món | ✅ | `test:search` 105/105 |
| H6 | **API ảnh đại diện** (phần backend) | ✅ | `POST` / `DELETE /api/auth/avatar`, xem mục 4.6 |

### Xóa / dọn (mục 7)

| ID | Việc | | Ghi chú |
|----|------|:---:|---------|
| X1 | Route SSR cũ | ✅ | `admin.js, public.js, pages.js, auth.js` (bản chọn vai) |
| X2 | `src/views/**`, `public/`, `src/utils/pho.js` | ✅ | đã xóa ở Block 9 (không còn file nào tham chiếu; `frontend/` đã có bản thay thế, `pho.js` nằm ở `frontend/js/`) |
| X3 | Middleware vai bằng cookie | ✅ | |
| X4 | Endpoint chọn vai | ✅ | |
| X5 | Thư viện không dùng | ✅ | `cookie-parser`, `ejs`, `method-override` |
| X6 | Giao diện "chọn vai" ở `login.js` | ✅ | trang đăng nhập viết lại (F4); `chonVai` chỉ còn ở hộp chọn vai trang phố |
| X7 | `mock-server/` + lệnh `npm run mock` | ✅ | **đã xóa** thay vì sửa: ngoài cookie `role` cũ, nó còn lệch cả hợp đồng hiện tại (không có `ok`, dùng PUT, mã 400/404/409/204, không có `status` món) nên không thể dùng để chạy frontend mới |
| X8 | Tài liệu | ✅ | `README.md` (file này) và `API.md` viết lại theo JWT, RBAC/ABAC, avatar |

Còn sót nhưng **ngoài kế hoạch** nên chưa đụng: `cookieOptions` trong `src/utils/security.js`, `src/utils/paginate.js`, `src/utils/tim-kiem.js` (không còn nơi nào dùng), `anh-trong-bucket.html`.

## 2. Công nghệ

- **Node.js 20+ (đã chạy thử trên Node 22), Express 4**: máy chủ, `/api` và phục vụ luôn thư mục `frontend/` (cùng origin).
- **Sequelize + PostgreSQL / Supabase**: dữ liệu; tìm kiếm bằng `unaccent`, `pg_trgm`, full-text.
- **jsonwebtoken** (HS256), **bcryptjs** (cost 12), TOTP tự cài (RFC 6238), **qrcode** (mã QR cho Authenticator), **nodemailer** / Resend (email).
- **multer + sharp + Supabase Storage**: ảnh món (≤ 800px) và ảnh đại diện (vuông 512px, WEBP).
- **Frontend**: HTML/CSS/JavaScript thuần, ES modules, History API, không cần build (trừ `npm run build:css`).

## 3. Cài đặt và chạy

### Yêu cầu

Node.js và npm; một PostgreSQL có quyền tạo extension `unaccent`, `pg_trgm` (Supabase có sẵn); (tùy chọn) bucket Supabase Storage tên `dish-images`, public.

### Các bước

```bash
npm install
cp .env.example .env        # rồi điền các biến ở bảng dưới
npm run db:migrate          # bảng còn thiếu + extension + hàm f_norm/f_tsv + index (chạy lại an toàn)
npm run db:seed             # 1.000 món / 60 đầu bếp / 120 nguyên liệu (chạy lại an toàn, không trùng)
npm run db:seed:users       # 3 tài khoản mẫu viewer / editor / admin (mật khẩu lấy từ SEED_PASSWORD)
npm start                   # hoặc: npm run dev     -> http://localhost:3000
```

Server **từ chối khởi động** nếu `JWT_SECRET` thiếu hoặc < 32 byte. Khi khởi động server tự thêm cột còn thiếu (`users.*`, `dishes.status`) và tự chạy migration tìm kiếm nếu chưa có. Postgres ở `localhost` tự tắt SSL (ép bằng `DB_SSL=false`); Supabase bật SSL.

### Biến môi trường (`.env.example`)

| Biến | Bắt buộc | Ý nghĩa |
|---|:---:|---|
| `DATABASE_URL` | ✅ | Chuỗi kết nối Postgres (Supabase: Session pooler, cổng 5432) |
| `JWT_SECRET` | ✅ | ≥ 32 byte ngẫu nhiên, **không commit**. Tạo: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | | Thời hạn access token (mặc định `15m`; đặt `5s` để thử `TOKEN_EXPIRED`). Không có refresh token |
| `PORT` | | Mặc định 3000 |
| `CORS_ORIGIN` | | Origin của SPA, cách nhau bằng dấu phẩy. Bỏ trống = chỉ origin dev (`localhost:3000/5173/4200/5500`). `*` bị bỏ qua |
| `APP_URL` | | URL công khai của SPA (link email đặt lại mật khẩu, hostname reCAPTCHA) |
| `MFA_ENCRYPTION_KEY` | prod | Khóa mã hóa khóa TOTP + HMAC mã khôi phục (≥ 32 byte). Không đặt thì dẫn xuất từ `JWT_SECRET`. **Chạy thật: đặt khóa riêng và không đổi** sau khi đã có người bật MFA |
| `MFA_ISSUER` | | Tên hiện trong app Authenticator |
| `MAIL_FROM`, `SMTP_HOST/PORT/USER/PASS`, `RESEND_API_KEY` | prod | Gửi OTP / link đặt lại mật khẩu. Dev: `DEV_PRINT_MAIL=1` in thư ra console |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_HOSTNAMES` | prod | reCAPTCHA v2. Để trống khi dev = bỏ qua kiểm tra; production thiếu khóa = từ chối |
| `CHEF_INVITE_CODE` | | Đúng mã khi đăng ký → `editor`. Trống = không ai đăng ký được editor bằng mã |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ cho ảnh | Tải ảnh món và ảnh đại diện. Thiếu thì chỉ các thao tác ảnh lỗi (500), phần còn lại vẫn chạy |
| `TRUST_PROXY` | | Đặt `1` khi chạy sau reverse proxy (Render…) để `req.ip` là IP thật (rate limit theo IP) |
| `SEED_PASSWORD` | | Mật khẩu 3 tài khoản mẫu (production bắt buộc đặt) |
| `NODE_ENV` | | `production` bật các ràng buộc chặt (reCAPTCHA, `SEED_PASSWORD`) |

### Cấp vai trò

Tài khoản đăng ký luôn là `viewer`. Chỉ người có quyền chạy lệnh trên máy chủ mới nâng được quyền, web không có đường nào tự nâng:

```bash
npm run db:set-role -- bep@example.com editor 3     # editor, chỉ sửa món draft của đầu bếp id 3
npm run db:set-role -- sep@example.com admin
npm run db:set-role -- bep@example.com viewer       # thu hồi về chỉ đọc
```

Đổi role / `chefId` sẽ tăng `tokenVersion`: mọi token đang sống của tài khoản đó bị từ chối, phải đăng nhập lại.

## 4. Xác thực và phân quyền

### 4.1 JWT

- Access token **HS256** ký bằng `JWT_SECRET`, `algorithms` cố định nên token `alg:none` hoặc tự khai thuật toán khác bị từ chối. Claim: `sub` (id), `tv` (tokenVersion), `typ`, `iss`, `aud`, `jti`, `exp`. **Không** chứa mật khẩu, secret, email hay role.
- Mỗi request có quyền: `authenticate` verify token → **đọc lại user từ DB** → so `tokenVersion` → gắn `req.user`. Role/`chefId` luôn lấy từ DB, không tin claim nào trong token.
- Thiếu / sai chữ ký / token loại khác / user không còn / `tokenVersion` lệch → `401 UNAUTHENTICATED`; hết hạn → `401 TOKEN_EXPIRED`.
- **Thu hồi token**: `tokenVersion + 1` khi đổi mật khẩu, bật/tắt MFA, đổi role. Đăng xuất chỉ là client xóa token; token đã cấp vẫn sống đến khi hết hạn (mặc định 15 phút).
- Header: `Authorization: Bearer <accessToken>`. Không còn cookie xác thực nên **không có CSRF** và không cần `csrf.js`.

### 4.2 Đăng nhập, chống dò mật khẩu

`POST /api/auth/login {email, password, recaptcha?}`:

1. Cửa sổ 15 phút kể từ lần sai **đầu tiên**; sai từ **3 lần** → bắt buộc CAPTCHA; sai **10 lần** → khóa 5 phút (`429 RATE_LIMITED` + `Retry-After` + `details.lockedSeconds`), kể cả mật khẩu đúng.
2. Email không có tài khoản cũng bị đếm (trong RAM) và vẫn chạy bcrypt với hash giả → không dò được email nào đã đăng ký; cùng một thông báo cho "sai email" và "sai mật khẩu".
3. Mật khẩu đúng nhưng chưa kích hoạt email → `ACCOUNT_NOT_ACTIVATED`, **không** cấp token.
4. Mật khẩu đúng + đã bật MFA → chỉ trả `{ next:"mfa", challenge }`, **chưa có `accessToken`**.
5. Rate limit theo IP: 30 lần / 15 phút cho đăng nhập.

Sai mật khẩu / sai mã trả **HTTP 200 + `ok:false`** (không phải 401) để SPA không xóa token hay chuyển trang mỗi lần gõ sai. 401 chỉ dành cho token thiếu / sai / hết hạn.

### 4.3 Đăng ký và quên mật khẩu

- Đăng ký 3 bước: email + CAPTCHA → mã OTP gửi email (`ticket`) → họ tên + mật khẩu (+ mã mời). Role mặc định `viewer`, `role` do client gửi bị bỏ qua; đúng `CHEF_INVITE_CODE` → `editor`. Không cấp token, phải đăng nhập.
- Quên mật khẩu: link email 30 phút trỏ về trang SPA `/reset-password?token=`; đổi xong `tokenVersion+1`, gửi mail "mật khẩu đã đổi", **không tắt MFA**, không cấp token. Email không tồn tại vẫn trả y như tồn tại.
- Dọn dữ liệu hết hạn mỗi giờ (`startCleanup`).

### 4.4 MFA TOTP + mã khôi phục

- Bật: `POST /api/mfa/setup` (tạo khóa, trả QR) → `POST /api/mfa/enable {code}` (nhập mã 6 số) → hiện **10 mã khôi phục một lần duy nhất**. Server chỉ lưu hash nên không thể hiện lại mã gốc.
- Đăng nhập bước 2: `POST /api/auth/mfa/verify {challenge, code | recoveryCode}` → `accessToken`. Challenge sống 5 phút và chỉ dùng được ở endpoint này.
- Mã TOTP chấp nhận bước thời gian hiện tại ±1 và dùng **một lần** (cập nhật nguyên tử `mfaLastStep`); sai 5 lần → khóa 5 phút theo tài khoản. Mã khôi phục dùng một lần; tạo nhóm mới thì nhóm cũ vô hiệu.
- Thao tác nhạy cảm (đổi thiết bị, tắt MFA, xem trạng thái / tạo lại mã khôi phục) phải **xác thực lại bằng mật khẩu + (TOTP hoặc mã khôi phục)**.
- `enable` và `disable` **tăng `tokenVersion`** nên trả **accessToken mới**: SPA phải thay token đang lưu.

### 4.5 RBAC + ABAC

| Role | Quyền |
|---|---|
| `viewer` | đọc món (công khai), đầu bếp, nguyên liệu |
| `editor` | như viewer + tạo / sửa món (bị ràng buộc ABAC) |
| `admin` | toàn quyền, thêm xóa; chỉ cấp được bằng `set-role.js` |

`GET /api/dishes` và `/api/options` công khai; `GET /api/chefs`, `/api/ingredients` cần đăng nhập (viewer trở lên).

**ABAC cho món ăn** (`src/routes/api.js`): thứ tự **401 → 403 theo role → 404 → 403 theo thuộc tính → thực hiện**.

- Editor chỉ sửa món có `chefId = user.chefId` **và** `status = draft`.
- Khi sửa, bản ghi được đọc lại và khóa (`SELECT … FOR UPDATE`) **trong transaction**, nên món vừa bị đổi sang `published` giữa chừng cũng bị chặn.
- Khi tạo, editor bị **ép** `chefId` = đầu bếp của mình và `status = draft`; editor chưa được gán `chefId` thì không tạo được món.
- Quyết định quyền **không bao giờ** dựa vào `role`, `chefId`, `status` do client gửi trong body.

### 4.6 Ảnh đại diện (H6, phần backend)

| Endpoint | Mô tả |
|---|---|
| `POST /api/auth/avatar` | Bearer, `multipart/form-data`, trường **`avatar`** (JPG/PNG/WEBP ≤ 3MB). Trả user với `avatarUrl` mới |
| `DELETE /api/auth/avatar` | Bearer. Trả user với `avatarUrl: null` (gọi khi chưa có ảnh vẫn `ok:true`) |

- Server kiểm theo **nội dung ảnh** (sharp), không tin mimetype hay đuôi file: chỉ JPEG/PNG/WEBP, tối thiểu 32×32, giới hạn 25 triệu điểm ảnh (chống ảnh bom giải nén). GIF, SVG, file chữ giả làm ảnh → `VALIDATION_FAILED` `fields.avatar`.
- Ảnh được cắt vuông **512×512** (cover), xoay đúng chiều, đổi **WEBP**, bỏ EXIF/GPS, rồi lưu Supabase tại `avatars/<userId>/<uuid>.webp` (đường dẫn dùng id của người đang đăng nhập, không nhận gì từ client).
- Thứ tự: tải ảnh mới → ghi DB → xóa ảnh cũ. Ghi DB lỗi thì xóa ảnh mới vừa tải (không để file mồ côi); Storage lỗi thì `500` chung, DB giữ ảnh cũ. Giới hạn 20 lần / giờ / IP.
- `avatarPath` là đường dẫn nội bộ, **không** có trong response. Lưu ý: ảnh nằm trong bucket public nên ai có URL đều xem được.

### 4.7 Rủi ro cần biết

- SPA dự kiến lưu token trong `localStorage`: nếu có lỗ hổng XSS thì token bị đọc được. Mọi dữ liệu người dùng khi render `innerHTML` phải qua `esc()` (việc F14).
- Token đã cấp còn dùng được đến khi hết hạn (đăng xuất không thu hồi). Muốn thu hồi ngay phải đổi `tokenVersion` (đổi mật khẩu / đổi role / bật tắt MFA).
- Bộ đếm đăng nhập sai cho email không có tài khoản và rate limit theo IP nằm **trong RAM**: chỉ đúng khi chạy **1 instance** (sai khi scale ngang hoặc khi server khởi động lại).
- Đổi `JWT_SECRET` làm mọi token cũ vô hiệu; nếu không đặt `MFA_ENCRYPTION_KEY` thì còn làm mọi MFA đã bật vô dụng.

## 5. REST API tóm tắt

Chi tiết từng endpoint, trường dữ liệu, mã lỗi, checklist: xem **[API.md](API.md)**.

### Định dạng phản hồi

| Tình huống | HTTP | Body |
|---|---|---|
| Thành công | `200` | `{ "ok": true, "data": ..., "meta"?: ... }` (`meta` chỉ có ở danh sách) |
| Lỗi nghiệp vụ đã biết | `200` | `{ "ok": false, "error": { "code", "message", "fields"?, "details"? } }` |
| Lỗi kỹ thuật | `4xx / 5xx` | `{ "error": { "code", "message", "requestId" } }` (không có `ok`) |

Frontend kiểm ba tầng (có response không → HTTP status → `ok` true/false) rồi xử lý theo `error.code`, không so sánh nội dung `message`. Lỗi 5xx chỉ trả câu chung; chi tiết nằm trong log kèm `requestId` (cũng gửi qua header `X-Request-Id`).

### Mã lỗi (`src/api/errors.js`)

- **Nghiệp vụ (HTTP 200, `ok:false`)**: `NOT_FOUND`, `VALIDATION_FAILED` (kèm `fields`), `ALREADY_EXISTS`, `RESOURCE_IN_USE`, `RELATION_CONFLICT`, `INVALID_CREDENTIALS`, `ACCOUNT_NOT_ACTIVATED`, `CAPTCHA_REQUIRED`, `OTP_INVALID`, `TICKET_INVALID`, `INVALID_RESET_TOKEN`, `MFA_REQUIRED`, `INVALID_MFA_CODE`, `MFA_NOT_ENABLED`, `MFA_SETUP_REQUIRED`.
- **Kỹ thuật (đúng mã HTTP)**:

| HTTP | `code` |
|---|---|
| 400 | `INVALID_JSON`, `BAD_REQUEST` |
| 401 | `UNAUTHENTICATED` (thiếu / sai token), `TOKEN_EXPIRED` (hết hạn) |
| 403 | `FORBIDDEN` (role / thuộc tính không đủ quyền), `CORS_NOT_ALLOWED` |
| 404 | `ROUTE_NOT_FOUND` |
| 413 / 415 | `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` |
| 429 | `RATE_LIMITED` (kèm `Retry-After`) |
| 500 / 502 | `DB_UNAVAILABLE`, `INTERNAL_ERROR` / `EMAIL_SEND_FAILED` |

### Endpoint chính

| Nhóm | Endpoint | Quyền |
|---|---|---|
| Hệ thống | `GET /healthz` (không đụng DB), `GET /api/health`, `GET /api/options` | công khai |
| Đăng nhập | `POST /api/auth/login`, `POST /api/auth/mfa/verify`, `POST /api/auth/logout` | công khai |
| Tài khoản | `GET /api/auth/me`, `POST` / `DELETE /api/auth/avatar` | đăng nhập |
| Đăng ký | `POST /api/auth/register/otp`, `/register/verify`, `/register` | công khai |
| Mật khẩu | `POST /api/auth/forgot-password`, `GET /api/auth/reset-password/check`, `POST /api/auth/reset-password` | công khai |
| MFA | `GET /api/mfa/status`, `POST /api/mfa/setup`, `/mfa/enable`, `/mfa/disable`, `/mfa/recovery-codes/status`, `/mfa/recovery-codes/regenerate` | đăng nhập |
| Món ăn | `GET /api/dishes[/:id]` | công khai |
| | `POST /api/dishes`, `PATCH /api/dishes/:id` | editor (ABAC), admin |
| | `DELETE /api/dishes/:id` | admin |
| Đầu bếp, nguyên liệu | `GET /api/chefs`, `/api/ingredients` (+ `/:id`) | viewer, editor, admin |
| | `POST`, `PATCH`, `DELETE` | admin |

- Sửa dùng **PATCH** (không có PUT): trường không gửi thì giữ nguyên, nhưng mọi trường vẫn được validate lại và chỉ các trường đã khai báo mới được ghi vào DB.
- Thêm / sửa **món ăn** dùng `multipart/form-data` (ảnh JPG/PNG/WEBP ≤ 3MB; có thêm trường `status`); đầu bếp và nguyên liệu dùng JSON. Thêm / sửa món chạy trong transaction.
- Danh sách: tìm / lọc / sắp xếp / phân trang chạy bằng SQL trên toàn bộ dữ liệu (mục 11). Danh sách rỗng → `200` với `data: []`; id không có hoặc sai kiểu → `200` `ok:false` `NOT_FOUND`.
- **CORS**: chỉ origin liệt kê trong `CORS_ORIGIN`; origin lạ → `403 CORS_NOT_ALLOWED`; preflight `OPTIONS` → `204` với `Allow-Headers: Content-Type, Authorization`. Không dùng `*`, không bật credentials.
- **Routing phía client**: server trả `index.html` cho mọi đường dẫn GET không phải `/api` và không có đuôi file, nên F5 ở `/dishes/2` hay `/admin/dishes/3/edit` vẫn đúng trang.

## 6. Cấu trúc thư mục

```text
Block-9/
├── frontend/                      # SPA (nửa đầu đã chuyển sang JWT, xem mục 12)
│   ├── index.html
│   ├── css/  img/
│   └── js/
│       ├── main.js  router.js  api.js  config.js  state.js  session.js
│       ├── effects.js  resources.js  list-config.js  pho.js  utils.js  am-thanh.js
│       ├── day-keo.js  gia-keo.js  chon.js  chon-nhieu.js
│       └── pages/                 # home, login, register, forgot, reset, mfa-verify, auth-ui (dùng chung),
│                                  # khach, listing, dish-detail, admin-form, admin-delete, error
├── src/
│   ├── app.js  server.js  constants.js
│   ├── api/                       # errors.js, response.js, middleware.js (CORS, requestId, lỗi), permissions.js, serializers.js
│   ├── middleware/auth.js         # authenticate, requirePermission
│   ├── routes/
│   │   ├── api.js                 # gắn router, CRUD món / đầu bếp / nguyên liệu, ABAC
│   │   ├── auth-api.js            # login, me, logout, avatar
│   │   ├── register-api.js        # đăng ký 3 bước, quên / đặt lại mật khẩu
│   │   └── mfa.js                 # MFA TOTP, recovery code, xác thực lại
│   ├── models/                    # User, RegisterOtp, PasswordReset, RecoveryCode, Dish, Chef, Ingredient
│   ├── admin/resources.js         # trường dữ liệu + validate của món / đầu bếp / nguyên liệu
│   ├── config/database.js
│   └── utils/                     # jwt, totp, mfa-crypto, security, validators, mailer, recaptcha, rateLimit, cleanup,
│                                  # storage (ảnh món + avatar), migrate, db-setup, list-query, format
├── scripts/                       # seed, seed-users, set-role, migrate, test-*.js, build-css, ảnh...
│   └── e2e/                       # auth-ui-check.py (giao diện xác thực), ui-check.py (danh sách)
├── db/migrations/001_search_setup.sql
├── docs/                          # BAN_GIAO.md (bằng chứng phần tìm kiếm), screenshots/
├── API.md  README.md  .env.example  package.json
```

## 7. Lệnh npm

| Lệnh | Công dụng |
|---|---|
| `npm start` / `npm run dev` | Chạy máy chủ (`dev` dùng nodemon) |
| `npm run db:migrate` | Bảng còn thiếu + extension / hàm / index tìm kiếm (chạy lại an toàn) |
| `npm run db:seed` | Nạp 1.000 món / 60 đầu bếp / 120 nguyên liệu (không xóa, không trùng) |
| `npm run db:seed:reset` | Xóa sạch 3 bảng dữ liệu rồi seed lại (`--reset --yes`) |
| `npm run db:seed:users` | Tạo 3 tài khoản mẫu viewer / editor / admin |
| `npm run db:set-role -- <email> <role> [chefId]` | Cấp / đổi role (và đầu bếp phụ trách) |
| `npm run build:css` | Tạo `frontend/css/style.min.css` |
| `npm run db:thumbs` | Tạo ảnh thu nhỏ cho ảnh món |
| `npm run test:auth` | JWT + RBAC + ABAC (34 kiểm tra) |
| `npm run test:register` | Đăng ký 3 bước, quên / đặt lại mật khẩu (30) |
| `npm run test:mfa` | MFA TOTP, recovery code, xác thực lại (83) |
| `npm run test:avatar` | API ảnh đại diện (34) |
| `npm run test:search` | Phân trang, search, filter, sort, fulltext, fuzzy (105) |
| `npm run test:ui-auth` | Giao diện đăng nhập / đăng ký / quên mật khẩu / MFA bằng Chromium headless (53), cần server đang chạy, xem mục 12.8 |

## 8. Kiểm thử

Các bài test chạy trên **DB thật** (Postgres 16 cục bộ), tự tạo dữ liệu thử có hậu tố ngẫu nhiên rồi dọn, tự mở server ở cổng ngẫu nhiên. Cần `DATABASE_URL` và `JWT_SECRET`.

```bash
npm run db:migrate && npm run db:seed
npm run test:auth && npm run test:register && npm run test:mfa && npm run test:avatar && npm run test:search
```

| ID | Chứng minh | | Chạy bằng |
|----|-----------|:---:|-----------|
| T1 | Không token → 401 `UNAUTHENTICATED` | ✅ | test:auth |
| T2 | Token sai chữ ký / sửa payload / `alg:none` / HS512 | ✅ | test:auth |
| T3 | Token hết hạn → `TOKEN_EXPIRED` | ✅ | test:auth (token ký sẵn đã hết hạn; chưa thử cách `JWT_EXPIRES_IN=5s` rồi chờ) |
| T4 | Preflight CORS, origin lạ bị chặn | ✅ | test:auth (bằng header; chưa chạy SPA thật ở `localhost:5173`) |
| T5 | Tìm kiếm + phân trang vẫn đúng | ✅ | test:search |
| T6 | Pending / sai mật khẩu / CAPTCHA / khóa 429 | ✅ | test:auth (CAPTCHA mới thử ở chế độ dev bỏ qua kiểm tra, chưa có khóa reCAPTCHA thật) |
| T7 | Đặt lại mật khẩu → token cũ chết; MFA vẫn bắt buộc | ✅ | test:register, test:auth, test:mfa |
| T8 | RBAC (viewer 403, editor 403, admin 200; dữ liệu không đổi khi 403) | ✅ | test:auth |
| T9 | ABAC (403, 403, 200, 200) | ✅ | test:auth |
| T10 | Không tin client (role / chefId / status trong body) | ✅ | test:auth |
| T11 | MFA chưa xong → không có accessToken; challenge không gọi được API | ✅ | test:mfa |
| T12 | Mã dùng lại / mã khôi phục lần 2 / sai quá giới hạn (kể cả 6 request song song) | ✅ | test:mfa |
| T13 | Thao tác nhạy cảm đòi mật khẩu + mã | ✅ | test:mfa |
| T14 | Trang home (thuyền, cô gái, avatar) | ✅ (Chromium + API giả, 16/16) | chưa thử với Supabase thật; xem mục 12.9 |
| — | Giao diện: token gắn đúng ở `/api/chefs`, 401 về `/login`, 403 giữ token, CAPTCHA, khóa 429, đăng ký, quên mật khẩu, MFA | ✅ | `scripts/e2e/auth-ui-check.py` (mục 12.8) |
| — | API ảnh đại diện: xác thực, định dạng, cắt vuông 512, client không quyết định được đường dẫn, dọn file cũ, Storage lỗi → DB giữ nguyên | ✅ | test:avatar |

`test:avatar` thay `uploadAvatar` / `removeFile` của Storage bằng bản giả (ghi lại lời gọi); phần xử lý ảnh bằng sharp vẫn chạy thật. Ngoài test, server thật (`npm start`) đã được thử bằng curl: `/healthz`, `/api/health`, SPA fallback, 401 khi thiếu token, đăng nhập bằng tài khoản mẫu, ảnh hỏng bị từ chối; tải ảnh thật báo 500 chung vì máy thử chưa cấu hình Supabase.

**Chưa có**: bằng chứng thủ công theo mục 8 của kế hoạch cho phần còn lại (tab Network, Local Storage, curl / Postman đã che token; ảnh trang home). Đã có ảnh giao diện xác thực ở `docs/screenshots/b9_*.png`.

## 9. Việc còn lại và giới hạn

### Frontend (mục 5 và 6 của kế hoạch) — trạng thái mã nguồn và kiểm chứng còn thiếu

| ID | Việc | Ghi chú |
|----|------|---------|
| F8 | Trang bảo mật tài khoản `/account/security`: bật/tắt MFA, recovery code | **Có `frontend/js/pages/security.js` và route**; cần e2e cho toàn bộ vòng đời MFA, token mới, recovery code trên Supabase test |
| F9 | Route `/account/security` và route xác thực | **Có khai báo trong `frontend/js/main.js`**; cần kiểm tra route guard khi chạy thật |
| F10 | Khu quản trị theo role: viewer/editor/admin và ABAC trong UI | **Có `frontend/js/quyen.js` và các lời gọi `duocThem`, `duocSua`, `duocXoa` trong `listing.js`**; cần e2e xác nhận ẩn nút, khóa trường và server trả 403 đúng |
| F11 | Ô `status` (draft / published) cho món | **Có mã xử lý**; cần test tạo/sửa, giới hạn editor và dữ liệu lưu DB |
| F12 | Liên kết **Bảo mật** ở thanh trên khi đã đăng nhập (không còn nút Đăng xuất ở thanh trên; chỉ đăng xuất bằng thuyền) | ✅ `utils.js` (`thanhTren`) và thanh trên của `khach.js` |
| F13 | Chạy lại trang khách không token: tìm kiếm, phân trang, ba chế độ hiển thị, chi tiết món | Đã kiểm trên trình duyệt, không token: `/dishes`, `/khach` (có nút Đăng nhập, hàng chờ) và `/dishes/1` mở được, `/dishes` không gửi `Authorization`. **Chưa kiểm lại** tìm kiếm / phân trang / ba chế độ hiển thị (dây kéo) sau khi đổi frontend |
| F14 | Escape dữ liệu người dùng khi render HTML | **Đã thấy `esc()` trong các trang liên quan**; chưa có bằng chứng rà soát toàn bộ sink DOM và test XSS |
| H2 | Thuyền = đăng xuất (lắc, tiếng nước, hộp xác nhận) | ✅ `pages/home.js` |
| H3 | Hiệu ứng nước sông tràn từ đáy lên (`fx: { type: "nuoc" }`): khi đăng xuất, khi đăng nhập / xác thực MFA xong (`fxCho` trong `pages/login.js`), khi chưa đăng nhập mà bấm nhà hàng, và khi bấm **Trang chủ** (`.dn-ve`) từ cảnh đêm của `/login`, `/register`, `/forgot-password`, `/reset-password`, `/mfa` (`chonFx` chọn nước khi link nằm trong `.dn`; ra phố từ trang khác vẫn là cành cây). Đợi animation `nuoc-len` thật chạy xong (tối đa 2 giây) rồi mới đổi màn hình; trong lúc nước dâng, body có lớp `dang-nuoc` để tạm dừng animation của cảnh đêm; `prefers-reduced-motion` thì bỏ hiệu ứng | ✅ `effects.js`, `style.css` (`.nuoc-tran`, `html[data-nuoc]`, `.dang-nuoc`) |
| H4 | Hộp chọn vai: hộp "Vai trò không hợp lệ" đúng kiểu Block 8 | ✅ |
| H5 | Cô gái áo dài + Vé hành khách (tên + avatar) | ✅ `pages/ve-hanh-khach.js` |
| H7 | Chỉ còn `data-dn` / `data-tk` kiểu EJS | ✅ trang phố dùng `getMe()` |
| H8 | Phím mũi tên không dạo phố khi đang mở hộp | ✅ `pages/home.js` |
| H9 | Ảnh: `img/pho/{co-gai,bang-dang-nhap,bang-dang-xuat}.webp`, `audio/co-gai-cuoi-1..4.mp3` và bộ ảnh cảnh đêm của màn hình vào / ra tài khoản `img/dang-nhap/{nen-dem,den-1,den-2,den-3}.webp` (nền ban đêm + hoa đăng; dùng cùng `img/thuyen.webp`) | ✅ (`bang-dang-nhap/xuat.webp` chưa được code nào dùng) |
| H10 | CSS: nút thuyền / vé / avatar / nước tràn, và khung cảnh đêm `.dn` (bầu trời sao, ánh trăng, sông, thuyền, hoa đăng, thẻ đăng nhập, ô CAPTCHA `.dn-cap`, ô mã 6 số `.dn-otp`, nút **Trang chủ** `.dn-ve`) | ✅ `css/style.css` (+ `style.min.css`, chạy `npm run build:css`) |
| H11 | `giong()`, `nuoc`, `cuoi` trong `am-thanh.js` | ✅ (`giong()` copy cho đủ bộ, Block 8 cũng chưa gọi tới) |
| H6 | Phần frontend: đổi / cắt ảnh đại diện (kéo, zoom, cắt vuông 512px) rồi `POST /api/auth/avatar` | ✅ `api.auth.uploadAvatar` + `ve-hanh-khach.js` |

### 12.9 Trang home hoàn chỉnh (H1–H11) và thanh trên (F12)

- Thuyền / cô gái chỉ có khi `getMe()` trả về user; chưa đăng nhập thì thuyền đứng yên, không có cô gái, bấm nhà hàng → nước tràn → `/login`. Từ `/login` bấm **Trang chủ** thì nước tràn quay về `/` (kiểm bằng e2e nhóm A2).
- Đăng xuất (chỉ bằng con thuyền ở trang chủ; thanh trên của khách và đầu bếp không có nút Đăng xuất) gọi `api.auth.logout()`, xóa token rồi sang `/login` bằng nước tràn. Token **không** bị xóa khi chỉ ra phố (H1).
- Vé hành khách: ảnh được cắt vuông 512px ở trình duyệt rồi gửi `multipart` (`avatar`) kèm Bearer; server kiểm tra lại nội dung ảnh. Block 9 chỉ lưu ảnh 512px (không có thumbnail 240px như Block 8).
- Tệp mới / sửa: `pages/home.js`, `pages/ve-hanh-khach.js` (mới), `effects.js`, `api.js`, `utils.js`, `pages/khach.js`, `main.js`, `am-thanh.js`, `css/style.css` (+ `style.min.css`), `img/pho/{co-gai,bang-dang-nhap,bang-dang-xuat}.webp`, `audio/co-gai-cuoi-1..4.mp3`.
- `bang-dang-nhap.webp` / `bang-dang-xuat.webp` đã copy theo kế hoạch H9 nhưng code Block 8 không dùng tới nên Block 9 cũng chưa dùng.

Hợp đồng API cho nửa sau (không đổi so với trước):

- `POST /api/auth/login`, `POST /api/auth/mfa/verify`: xem mục 12.
- `enable` / `disable` MFA trả **accessToken mới**: phải thay token đang lưu.
- Món ăn có thêm `status` (`draft|published`); user có thêm `avatarUrl`.

### Giới hạn

- Hàng chờ đặt món ở giao diện khách chỉ lưu trên trình duyệt; chưa có bảng đơn hàng.
- Dữ liệu đầu bếp chỉ gồm tên và chuyên môn; nguyên liệu không có định lượng theo từng món.
- Chưa có refresh token (access token sống `JWT_EXPIRES_IN`, hết hạn phải đăng nhập lại).
- Chưa có sort theo điểm đánh giá (schema không có cột rating).
- Trình duyệt đã thử cho phần danh sách: Chromium headless (Playwright). Chưa thử Safari / Firefox / thiết bị cảm ứng thật.

## 10. Giao diện SPA: danh sách, bộ lọc, ba chế độ hiển thị

> Phần này mô tả giao diện danh sách của Block 7, **không đổi ở Block 9**. Khu quản trị `/admin/*` giờ yêu cầu đăng nhập (mục 12); trang khách `/dishes` dùng API công khai.

### Danh sách: sắp xếp, lọc, giữ trạng thái trên URL

- **Tìm + lọc + sắp xếp + phân trang: ở server, bằng SQL trên PostgreSQL** (`src/utils/list-query.js`): `WHERE` (search + filter) → `ORDER BY` → `LIMIT/OFFSET`; `total` là `COUNT(*)` cùng mệnh đề `WHERE`. Mỗi bảng có allowlist cột sắp xếp/lọc, giá trị người dùng luôn là tham số (không ghép vào SQL). Chi tiết ở mục **10. Tìm kiếm trên PostgreSQL**.
- **Lọc tức thì: ở client** (`frontend/js/list-config.js`, `pages/listing.js`): gõ tới đâu lọc ngay trên dữ liệu đang có, sau 300ms mới hỏi server để phủ toàn bộ dữ liệu và có đúng số trang.
- **Trạng thái nằm trên URL**: `/dishes?q=pho&sort=price_desc&page=3&sel=45`. F5, bookmark, gửi link, nút Back/Forward đều ra đúng trang, đúng bộ lọc, đúng món đang mở. Vào bằng `?sel=45` (không có `page`) thì server tự tìm đúng trang chứa món 45.

### Ba chế độ hiển thị + dây kéo màn

Góc phải phía trên có **sợi dây kéo**. Kéo dây xuống (hoặc bấm / Tab tới rồi Enter) thì tấm màn hạ xuống với 3 lựa chọn; chọn xong màn tự cuộn lên, Esc hoặc bấm ra ngoài cũng đóng.

| Chế độ      | `?view=`                | Cách hoạt động                                                                     |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Phân trang  | `pagination` (mặc định) | thay danh sách bằng trang được chọn, `?page=N`                                     |
| Load more   | `more`                  | bấm "Xem thêm" thì **nối** trang kế vào cuối danh sách                             |
| Cuộn vô hạn | `infinite`              | `IntersectionObserver` canh một vùng ở cuối danh sách, cuộn tới là tự nối trang kế |

- **Không có API mới**: cả 3 chế độ gọi cùng `GET /api/<resource>?q=&sort=&<bộ lọc>&page=`, nên **sắp xếp + lọc luôn do server làm trên toàn bộ dữ liệu**, rồi mới cắt trang. Server chưa đổi dòng nào.
- **Đồng bộ**: dùng chung `pages/listing.js` nên áp dụng cho cả 3 tab quản trị (món / đầu bếp / nguyên liệu) và trang khách `/dishes`. Chế độ được nhớ trong `localStorage` (`ds-view`) nên đổi ở tab này thì tab kia cũng theo; `?view=` trên URL luôn thắng giá trị đã nhớ.
- **Đổi chế độ / từ khóa / bộ lọc / sắp xếp** thì giữ nguyên các lựa chọn còn lại và **bắt đầu lại từ trang 1**, bỏ danh sách đã nối trước đó; kết quả của lần tải cũ về muộn bị bỏ nên không bao giờ trộn hai lần tìm.
- **Giữ trạng thái**: ở Load more / Cuộn vô hạn, `?page=N` nghĩa là "đã tải trang 1..N" (tối đa 30 trang). F5, bookmark, mở link ở tab mới, Back từ trang chi tiết đều tải lại đúng từng đó trang. Mở bằng `?sel=ID` (không có `page`) thì server tìm trang chứa món đó rồi client nối thêm các trang phía trước.
- **Chống lỗi**: có cờ chặn gọi trùng khi đang tải hoặc đã hết; lọc bỏ mục trùng id khi nối; lỗi tải thêm thì hiện nút "Thử lại" (không tự lặp vô hạn); rời màn hình thì ngắt observer và hủy request.
- **Truy cập**: dây là `<button>` có `aria-label`/`aria-expanded`, tab trong màn bị khóa (`inert`) khi đóng, và `prefers-reduced-motion` tắt hiệu ứng đung đưa / trượt.
- File: `frontend/js/day-keo.js` (dây + màn, chỉ là giao diện), `list-config.js` (`view` trên URL + lưu lựa chọn), `pages/listing.js` (nối trang, observer), CSS ở cuối `style.css` (nhớ `npm run build:css`).

- Từ trang chi tiết món, form sửa, trang xóa bấm quay lại → về đúng danh sách (đúng trang, bộ lọc, sắp xếp) nhờ nhớ URL danh sách gần nhất trong `sessionStorage`.
- **Chi tiết món có URL riêng** `/dishes/:id` (bookmark, F5, gửi link đều đúng món). Khung chi tiết trong danh sách có nút **Trang chi tiết** dẫn tới đó; còn `?sel=ID` mở khung chi tiết ngay trong danh sách (dùng cho cả 3 tab: món / đầu bếp / nguyên liệu).
- **Vị trí cuộn khi quay lại**: có `?sel` → cuộn tới đúng ô món vừa xem (không dùng `scrollTop` vì mở khung chi tiết làm đổi bố cục lưới); không có `?sel` (F5 / Back) → khôi phục `scrollTop` đã lưu theo URL danh sách. Ở Load more / Cuộn vô hạn, `?page=N` tải lại đủ trang 1..N trước nên chiều cao đủ để cuộn đúng chỗ.
- **Tìm nâng cao cho khách** (`/dishes`): ô từ khóa (tên món) + **Tên đầu bếp** + **Giá từ / đến** + danh mục + tình trạng + **khoảng giá (thanh kéo 7 nấc: 100.000 · 200.000 · 500.000 · 1.000.000 · 2.000.000 · 5.000.000 · trên 10.000.000)** + sắp xếp chia 2 khu (trường: tên / giá / mới thêm / độ liên quan; thứ tự: A → Z / Z → A). Ô tìm luôn dùng kiểu **gần đúng** (chứa từ khóa hoặc gõ sai chính tả vẫn ra), không còn ô chọn kiểu tìm. Các điều kiện kết hợp bằng AND, đều chạy ở server.

## 11. Tìm kiếm trên PostgreSQL

**Chạy ở đâu:** toàn bộ ở database. Client chỉ gửi tham số; ô lọc tức thì ở client chỉ để hiện kết quả tạm trong lúc chờ server.
**Thứ tự xử lý:** `WHERE` (search + filter, nối bằng AND) → `ORDER BY …, id ASC` → `LIMIT/OFFSET`. `total` = `COUNT(*)` với cùng `WHERE`, tính trước khi cắt trang.

### Tham số `GET /api/dishes | /api/chefs | /api/ingredients`

| Tham số     | Giá trị                                                                                                                                      | Ghi chú                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `mode`      | `basic` (mặc định) · `advanced` · `fulltext` · `fuzzy`                                                                                       | sai giá trị → `VALIDATION_FAILED`                                                            |
| `q`         | chuỗi ≤ 100 ký tự                                                                                                                            | trim, nhiều khoảng trắng → 1; rỗng = không có điều kiện                                      |
| `sortBy`    | `name` · `newest` · `price` (món) · `relevance`                                                                                              | `relevance` chỉ có nghĩa khi `mode=fulltext/fuzzy` và có `q` (là mặc định ở hai mode đó)     |
| `sortOrder` | `asc` · `desc`                                                                                                                               | `sort=price_desc`… kiểu cũ vẫn dùng được                                                     |
| `page`      | số nguyên ≥ 1                                                                                                                                | `0`, `-1`, `abc`, `1.5` → `VALIDATION_FAILED`; vượt tổng số trang → `items` rỗng (không kẹp) |
| `pageSize`  | 1…60 (mặc định 9)                                                                                                                            | ngoài khoảng → `VALIDATION_FAILED`                                                           |
| `focus`     | id                                                                                                                                           | trả đúng trang đang chứa id đó (bookmark `?sel=`)                                            |
| `all=true`  |                                                                                                                                              | lấy hết, không phân trang                                                                    |
| Món ăn      | `category`, `available` (`true`/`false`), `minPrice`, `maxPrice`, `chefId`, `chef` (tên đầu bếp, chứa chuỗi, không phân biệt hoa/thường/dấu) | `0` và `false` là giá trị hợp lệ; `minPrice > maxPrice` → lỗi                                |
| Đầu bếp     | `specialty`                                                                                                                                  | chứa chuỗi, không phân biệt hoa/thường/dấu                                                   |
| Nguyên liệu | `unit`                                                                                                                                       |                                                                                              |

Phản hồi: `{ ok, data: [...], meta: { total, page, pageSize, perPage, totalPages, sort, sortBy, sortOrder, mode } }`. Giữ đúng quy ước của dự án: lỗi nghiệp vụ trả HTTP 200 + `ok:false`, `code: VALIDATION_FAILED` kèm `fields` (tài liệu bổ sung gợi ý dùng status lỗi; mình giữ quy ước cũ vì frontend hiện tại dựa vào nó).

Ví dụ:

```text
/api/dishes?q=pho&minPrice=20000&maxPrice=80000&sortBy=price&sortOrder=asc&page=2&pageSize=12
/api/dishes?mode=fulltext&q=hầm xương
/api/dishes?mode=fuzzy&q=spagheti
/dishes?q=pho&sort=price_asc&page=2&view=pagination        (URL giao diện, bookmark được)
/dishes/45                                                   (chi tiết một món, mở trực tiếp / F5 đều đúng)
```

### Tiếng Việt không dấu + index (`db/migrations/001_search_setup.sql`)

- `f_norm(text)` = `lower(unaccent(...))` + `đ→d`, khai báo `IMMUTABLE` để dùng trong index. Được áp dụng **cho cả dữ liệu lẫn từ khóa** ngay trong SQL nên luôn nhất quán ("pho" ↔ "Phở", "bun bo" ↔ "Bún bò").
- `f_tsv(a, b)` = `to_tsvector('simple', f_norm(coalesce(a,'') || ' ' || coalesce(b,'')))`: mô tả NULL không làm hỏng kết quả.
- Index: GIN `gin_trgm_ops` trên `f_norm(name)` của 3 bảng (+ `chefs.specialty`) phục vụ `LIKE '%x%'` và fuzzy; GIN trên `f_tsv(...)` phục vụ full-text; B-tree cho giá, danh mục, `chefId`. Đã kiểm tra bằng `EXPLAIN`: cả 3 kiểu tìm đều dùng Bitmap Index Scan.

| Kiểu       | Điều kiện SQL                                                                                                 | Tìm trên                                                        | Sắp xếp mặc định              |
| ---------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------- |
| `basic`    | mỗi từ: `f_norm(name) LIKE '%từ%' ESCAPE` (AND giữa các từ)                                                   | tên (cả 3 tab)                                                  | tên A→Z, `id`                 |
| `advanced` | như `basic` (cùng luật khớp tên) + các bộ lọc `category`/`minPrice`/`maxPrice`/`available` ghép AND           | tên + bộ lọc                                                    | tên A→Z, `id`                 |
| `fulltext` | `f_tsv(...) @@ plainto_tsquery('simple', f_norm(q))`                                                          | món: tên + mô tả · đầu bếp: tên + chuyên môn · nguyên liệu: tên | `ts_rank` giảm dần, `id`      |
| `fuzzy`    | `f_norm(name) % f_norm(q)` (pg_trgm, **ngưỡng similarity 0.3** = mặc định của `pg_trgm.similarity_threshold`) | tên (cả 3 tab)                                                  | `similarity()` giảm dần, `id` |

- `%`, `_`, `\` người dùng gõ được escape trong SQL, chỉ khớp đúng ký tự đó. Input rỗng không tạo SQL lỗi; `plainto_tsquery` nuốt ký tự đặc biệt nên `& | ! ( ) :*` không gây lỗi cú pháp.
- Full-text dùng `plainto_tsquery` nên khớp **cả từ** (không khớp tiền tố) và cần có đủ các từ; muốn khớp một phần từ hãy dùng `basic`.
- Sắp theo tên dùng `f_norm(name)` (bỏ dấu) rồi tới `id`, nên "Phở…" và "Pho…" nằm lẫn nhau; không dùng collation `vi-VN` vì Supabase không bảo đảm có sẵn.
- **Chưa có sort theo điểm đánh giá**: schema không có cột rating, nên chưa tự thêm.

### Kiểm thử

```bash
npm run db:migrate && npm run db:seed && npm run test:search
```

`scripts/test-search.js` chạy 105 kiểm tra trên DB thật (chỉ đọc, trừ nhóm CRUD ở cuối: tạo rồi xóa 1 nguyên liệu tạm): seed, phân trang (page ngoài khoảng, pageSize sai, duyệt hết trang không mất/lặp), search hoa/thường/dấu/đầu/giữa/cuối, input rỗng, `%` `_` `'` và chuỗi kiểu SQL injection, filter kết hợp AND, `minPrice=0`, `available=false`, `minPrice>maxPrice`, sort tăng/giảm/trùng giá + id, full-text (mô tả NULL), fuzzy (gõ sai, không kết quả, thứ tự), `focus`, lọc theo tên đầu bếp, 401/403/404, CRUD ↔ total.

### Chưa làm / ghi chú

- Bằng chứng bàn giao (EXPLAIN, ví dụ API, ảnh chụp 3 chế độ + dây kéo, kiểm tra trình duyệt): xem **[docs/BAN_GIAO.md](docs/BAN_GIAO.md)**.
- URL giao diện dùng `sort=price_asc` (không phải `sortBy=&sortOrder=`) và chưa có `pageSize` trên URL (cố định 9/trang); API thì nhận cả hai kiểu và `pageSize` 1–60.
- Phản hồi danh sách là `{ ok, data: [...], meta: {...} }` thay vì `data: { items, total, ... }` như ví dụ của tài liệu bổ sung (giữ nguyên hợp đồng cũ để không phá frontend/CRUD).

- Giao diện đã chạy thử bằng Chromium headless (Playwright) với 1.000 món: 3 chế độ, dây kéo, lọc đầu bếp, bookmark, Back + cuộn (xem docs/BAN_GIAO.md). Chưa thử trên Safari / Firefox / thiết bị cảm ứng thật.

## 12. Frontend xác thực — nửa đầu (F1–F7)

"Nửa đầu" được hiểu là **F1–F7** (7 trong 14 việc F): mọi thứ cần để đăng ký, đăng nhập, vào / ra tài khoản bằng JWT. Phần quản trị theo role, trang bảo mật tài khoản và trang phố đầy đủ (nửa sau) ở mục 9.

### 12.1 Việc đã làm

| ID | Việc | Kết quả | File |
|----|------|:---:|------|
| F1 | `Authorization: Bearer` gắn ở **một chỗ** trong `request()`, chỉ khi URL thuộc `API_BASE`; bỏ `credentials:"include"`; thêm `api.auth.*` (login, mfaVerify, me, logout, registerOtp, registerVerify, register, forgot, resetCheck, reset). Lời gọi công khai truyền `auth:false` | ✅ | `api.js`, `config.js` |
| F2 | Token ở `localStorage` (mọi lời gọi bọc try/catch, hỏng thì giữ trong bộ nhớ tab); `getMe()` thay `getRole()`; challenge MFA chỉ trong bộ nhớ | ✅ | `session.js` (mới), `state.js` |
| F3 | 401 → xóa token + về `/login?next=…` (kèm thông báo `TOKEN_EXPIRED` / token mất hiệu lực); 403 → màn hình lỗi, **giữ token**; 429 → màn hình lỗi có nút Thử lại; mất mạng / 500 **không** đăng xuất; đã đổi `UNAUTHORIZED` → `UNAUTHENTICATED` / `TOKEN_EXPIRED` | ✅ | `api.js`, `router.js`, `listing.js`, `admin-form.js`, `admin-delete.js` |
| F4 + X6 | Đăng nhập email + mật khẩu; CAPTCHA khi server đòi (`details.needCaptcha` / `CAPTCHA_REQUIRED`); khóa 429 → nút đếm ngược `mm:ss`; `?next=` chỉ nhận đường dẫn nội bộ; đã đăng nhập mà mở `/login` thì tự chuyển đi; bỏ hẳn form "chọn vai" | ✅ | `pages/login.js` |
| F5 | Đăng ký 3 bước trong một trang (email + CAPTCHA → OTP → họ tên / mật khẩu / mã mời); ticket chỉ trong bộ nhớ; `TICKET_INVALID` quay về bước 1; gửi lại OTP chờ 60 giây | ✅ | `pages/register.js` |
| F6 | Quên mật khẩu (luôn báo chung, không lộ email nào có tài khoản) và đặt lại mật khẩu từ `/reset-password?token=` (kiểm link trước khi hiện form, `Referrer-Policy: no-referrer`) | ✅ | `pages/forgot.js`, `pages/reset.js` |
| F7 | Trang nhập mã MFA: mã 6 số hoặc mã khôi phục; challenge hết hạn → về đăng nhập; sai quá 5 lần → đếm ngược; thay token và báo số mã khôi phục còn lại | ✅ | `pages/mfa-verify.js` |
| F9 (một phần) | Route `/register`, `/forgot-password`, `/reset-password`, `/mfa`; khu `/admin/*` đổi từ `{role:"admin"}` sang `{auth:true}` (kiểm bằng `/auth/me`, không còn so với cookie) | 🟡 | `main.js`, `router.js` |
| F12 (một phần) | Thanh trên không còn nút Đăng xuất (đã bỏ, chỉ đăng xuất bằng thuyền) | 🟡 | `utils.js`, `main.js`, `pages/khach.js` |
| H1 | Ra phố **không còn** gọi `api.logout()` | ✅ | `pages/home.js` |

Giao diện các trang vào / ra tài khoản là **cảnh ban đêm** (`.dn`, giống Block 8): thẻ ở giữa, tab Đăng nhập / Đăng ký, nút **Trang chủ** ở góc, ô nhập dạng `truongDem` (id `f-<tên trường>`, vd. `#f-email`, `#f-recoveryCode`), mã 6 số là 6 ô `.dn-otp`, CAPTCHA là `#captcha .dn-cap`.

Dùng chung: `pages/auth-ui.js` (khung đêm `khungDem`, ô nhập `truongDem`, hiện lỗi theo ô, đếm ngược, CAPTCHA `ganCaptchaDem`, `safeNext`; `ganCaptcha` bản cũ không còn nơi nào gọi). CSS thêm ở cuối `style.css` (nhớ `npm run build:css`, đã build).

### 12.2 Luồng đăng nhập

```text
/login ── email + mật khẩu ──► POST /auth/login
   │                              ├─ { accessToken, user }  → lưu token → ?next hoặc /khach (viewer) | /admin/dishes (editor, admin)
   │                              ├─ { next:"mfa", challenge } → /mfa → POST /auth/mfa/verify → lưu token
   │                              ├─ 200 ok:false INVALID_CREDENTIALS / ACCOUNT_NOT_ACTIVATED / CAPTCHA_REQUIRED → báo lỗi tại chỗ
   │                              └─ 429 RATE_LIMITED → nút đếm ngược
   └─ Quên mật khẩu → /forgot-password → email → /reset-password?token= → /login
```

Router: route có `auth:true` mà chưa đăng nhập → `/login?next=<đường dẫn cũ>`; đăng nhập xong quay lại đúng trang đó.

### 12.3 Lưu token và rủi ro

- Khóa `localStorage`: `cqa-token` (chỉ access token, sống `JWT_EXPIRES_IN`, mặc định 15 phút, không có refresh token).
- **Rủi ro XSS**: script lạ chạy được trên trang thì đọc được token. Vì vậy các trang mới đều `esc()` mọi dữ liệu động; `F14` đã có các chỗ gọi `esc()` trong `listing.js` / `khach.js`, nhưng vẫn cần rà soát và thử XSS toàn diện.
- Challenge MFA và ticket đăng ký **không** nằm trong localStorage / sessionStorage: F5 giữa chừng là làm lại (đã kiểm: challenge không xuất hiện trong storage).
- Đăng xuất = xóa token phía client (server chỉ trả ok); token đã cấp còn dùng được đến khi hết hạn nếu bị lấy trước đó.
- Chưa đồng bộ đăng xuất giữa nhiều tab: tab kia chỉ biết khi request kế tiếp trả 401.

### 12.4 CAPTCHA

- Có khóa: đặt trước khi tải `main.js` (ví dụ trong `frontend/index.html`): `<script>window.RECAPTCHA_SITE_KEY = "6Lc...";</script>`; cùng với `RECAPTCHA_SECRET_KEY` ở backend.
- Không có khóa: hiện ô tick giả lập `.dn-cap` ("Tôi không phải là người máy", bấm là xong sau khoảng 0,7 giây), gửi `"dev-captcha"`. Có khóa thì widget reCAPTCHA thật nằm trong `.dn-rc`. Backend dev bỏ qua kiểm tra; **backend production từ chối** nếu thiếu khóa nên production bắt buộc phải cấu hình cả hai.
- Backend không có đường nào trả site key cho SPA (chưa đổi để không đụng hợp đồng đã chốt). Nếu muốn lấy từ server, thêm `recaptchaSiteKey` vào `/api/options` rồi đọc trong `auth-ui.js`.

### 12.5 Việc cần biết khi dùng giao diện

- **Khu `/admin/*` cho phép tài khoản đã đăng nhập truy cập theo guard**; UI hiện có kiểm tra quyền qua `quyen.js` (F10), nhưng chưa chạy e2e xác nhận tất cả nút và hành động theo role. Backend vẫn phải kiểm tra quyền độc lập. Sau đăng nhập, viewer được đưa tới `/khach`, editor / admin tới `/admin/dishes`.
- Mã TOTP vừa dùng ở bước bật MFA **không** dùng lại được để đăng nhập trong cùng bước 30 giây (thiết kế của backend); trang `/mfa` nhắc người dùng chờ mã mới.
- Sau khi đổi mật khẩu thành công, người dùng phải đăng nhập lại (server không cấp token, không tắt MFA).

### 12.6 Vá tối thiểu trang phố (chưa phải H2–H5)

- Chưa đăng nhập: bấm nhà hàng → `/login`. Đã đăng nhập: hiện hộp chọn vai; **vai chỉ là lựa chọn giao diện** (không gửi lên server). Chọn Đầu bếp mà tài khoản không phải editor / admin thì báo "Vai trò không hợp lệ" và tự chọn lại Khách hàng. Vào `/admin` thật sự vẫn do server quyết định.
- Trang phố dùng `getMe()`; mở được khi chưa đăng nhập hoặc khi mất mạng.

### 12.7 Các file đổi

Mới: `frontend/js/session.js`, `pages/auth-ui.js`, `pages/register.js`, `pages/forgot.js`, `pages/reset.js`, `pages/mfa-verify.js`, `scripts/e2e/auth-ui-check.py`, `docs/screenshots/b9_*.png`.
Sửa: `api.js`, `state.js`, `config.js`, `router.js`, `main.js`, `utils.js`, `pages/login.js` (viết lại), `pages/home.js`, `pages/khach.js`, `pages/listing.js` (đổi mã lỗi), `pages/admin-form.js`, `pages/admin-delete.js` (xử lý 401), `css/style.css`, `css/style.min.css`, `package.json`.
**Không đổi** backend (`src/`).

### 12.8 Kiểm thử giao diện

```bash
# server chạy với DEV_PRINT_MAIL=1 và CHEF_INVITE_CODE đặt; đã db:seed:users; editor@example.com chưa bật MFA
pip install playwright && playwright install chromium
SERVER_LOG=/path/to/server.log SEED_PASSWORD=<mật khẩu mẫu> npm run test:ui-auth
```

Bộ assertion trong script (chưa chạy lại trên Supabase online), đọc OTP / link đặt lại từ log server (`DEV_PRINT_MAIL=1`), tính mã TOTP bằng `src/utils/totp.js`:

| Nhóm | Nội dung |
|---|---|
| A | Không token: `/dishes` xem được và không gửi `Authorization`; `/admin/chefs` → `/login?next=`; bấm nhà hàng → `/login` |
| A2 | Bấm **Trang chủ** (`.dn-ve`) ở `/login`: nước tràn lên (có `.nuoc-tran` và lớp `dang-nuoc`) rồi sang `/`; nước rút hết, không kẹt lớp phủ / `data-nuoc` (2 kiểm tra) |
| B | Sai mật khẩu ở lại trang, không có token; sai lần 3 hiện CAPTCHA, chưa tick thì bị chặn; thành công → token trong localStorage, `/api/chefs` có `Bearer`; đã đăng nhập mở `/login` thì chuyển đi; Đăng xuất xóa token |
| C | Token rác: về `/login` kèm thông báo và token bị xóa; trang công khai vẫn xem được |
| D | Viewer xóa món → 403, **vẫn còn token** |
| E | Quên mật khẩu → link trong mail → đổi mật khẩu → link không dùng lại được → đăng nhập mật khẩu mới; không cấp token |
| F | Đăng ký 3 bước (OTP sai, mật khẩu yếu) → đăng nhập → role `viewer` |
| G | MFA: mã sai, mã đúng, mã khôi phục, F5 mất challenge, challenge không nằm trong storage |
| H | Khóa 429 hiện đếm ngược; `?next=//evil.com` bị bỏ; `?next=/admin/ingredients` được theo |
| I | Không có lỗi JS / console error |

Script chờ theo điều kiện (URL đổi, nút Đăng xuất xuất hiện) chứ không chờ cố định: đăng xuất có hiệu ứng nước nên mất khoảng 1,0–1,1 giây (đo trên Chromium headless).

Lưu ý khi chạy: test **ghi dữ liệu thật** (tạo vài tài khoản `sv…@example.com`, đổi tạm mật khẩu `viewer@example.com` rồi ghi lại mật khẩu mẫu, bật rồi tắt MFA của editor) và bị rate limit theo IP của backend (30 lần đăng nhập / 15 phút) nên chạy liên tiếp nhiều lần sẽ vấp 429, khởi động lại server để xóa bộ đếm. Đã chạy trên Chromium headless; chưa thử Safari / Firefox / thiết bị cảm ứng.

Ngoài script, đã kiểm tay bằng Playwright: trang phố khi đã đăng nhập vẫn giữ token (H1), hộp chọn vai báo "Vai trò không hợp lệ" cho viewer, `/khach` và `/dishes/1` mở được không token.

**Chưa kiểm**: reCAPTCHA thật; gửi email thật; `T3` bằng cách đặt `JWT_EXPIRES_IN=5s` rồi chờ trên giao diện; `T4` khi chạy SPA ở origin khác (`localhost:5173`); tìm kiếm / phân trang / ba chế độ hiển thị của danh sách sau thay đổi (F13).



## 13. Nghiệm thu 36 bước tích hợp với e2e và README

- Chuẩn yêu cầu: `Ke-hoach-chuyen-Block-7-CSR-sang-JWT.md`.
- Danh sách ca nghiệm thu: [`docs/BO-KIEM-36-BUOC.md`](docs/BO-KIEM-36-BUOC.md).
- Bảng ánh xạ ca → kiểm thử tự động / thủ công: [`docs/MA-TRAN-36-E2E.csv`](docs/MA-TRAN-36-E2E.csv) và [`docs/HUONG-DAN-TICH-HOP-E2E.md`](docs/HUONG-DAN-TICH-HOP-E2E.md).
- Script giao diện do người dùng cung cấp: `scripts/e2e/auth-ui-check.py` (giữ luồng A–I và kiểm tra nước tràn A2). Script không thay thế kiểm thử API RBAC/ABAC hoặc kiểm tra ảnh bằng mắt.
- **Không có ca nào được xác nhận PASS trên Supabase online ở lần tích hợp này**; những con số PASS lịch sử trong README không phải kết quả chạy lại.
- **Cảnh báo:** Script có thay đổi mật khẩu tài khoản `viewer@example.com`, bật/tắt MFA tài khoản `editor@example.com`, tạo tài khoản và có lệnh cập nhật DB trực tiếp. Chỉ chạy trên Supabase **project test riêng** với tài khoản mẫu, không chạy trên dữ liệu production.

### Chạy kiểm tra trên máy có kết nối Supabase test

```bash
npm install
# tạo .env từ .env.example và điền DATABASE_URL, JWT_SECRET, SEED_PASSWORD, ...
npm run db:migrate
npm run db:seed
npm run db:seed:users
python3 -m pip install playwright
python3 -m playwright install chromium
# terminal 1 (giữ log để e2e đọc OTP / reset link):
DEV_PRINT_MAIL=1 npm start 2>&1 | tee server-e2e.log
# terminal 2:
SERVER_LOG=server-e2e.log SEED_PASSWORD=Passw0rd1 python3 scripts/e2e/auth-ui-check.py
```

Trên Windows PowerShell, dùng biến môi trường `$env:DEV_PRINT_MAIL="1"` và chuyển hướng log tương ứng. **Không commit** `.env`, log chứa OTP/reset link, ảnh chụp có token hoặc mật khẩu. Chạy thêm các lệnh `npm run test:auth`, `test:register`, `test:mfa`, `test:avatar`, `test:search` để bao phủ những ca API mà e2e UI chưa kiểm.


## 14. Rà soát yêu cầu theo PDF kế hoạch và giới hạn nghiệm thu hiện tại

Nguồn đối chiếu: **Kế hoạch chuyển Block 7 (CSR) sang JWT**, mục 4 (B1–B26), mục 5 (F1–F14), mục 6 (H1–H11), mục 7 (X1–X8), mục 8 (T1–T14). Bảng này phân biệt **có mã nguồn** với **đã được chứng minh chạy đúng**.

| Nhóm | Mã nguồn / tài liệu | Bằng chứng còn thiếu |
|---|---|---|
| B1–B26 | Có module backend JWT, MFA, RBAC/ABAC, migration và các test API | Chạy lại toàn bộ trên Supabase **project test**, kiểm tra dữ liệu và lưu log đã che bí mật |
| F1–F7 | Có các trang xác thực và `auth-ui-check.py` | Chạy e2e thật với backend/DB; kiểm tra OTP, reset, CAPTCHA, MFA |
| F8–F9 | Có `pages/security.js` và route `/account/security` | E2E bật/tắt MFA, recovery, thay token, route guard |
| F10–F11 | Có `quyen.js`, các kiểm tra quyền ở `listing.js`, mã trạng thái món | E2E 3 role, nút ẩn/hiện, món `draft/published`, thao tác bị chặn ở API |
| F12 | Có liên kết Bảo mật trong giao diện; đăng xuất bằng thuyền | Kiểm tra liên kết, điều hướng và logout |
| F13 | Có các trang danh sách, tìm kiếm, phân trang và chi tiết | Chạy lại trang khách không token, đủ ba chế độ hiển thị |
| F14 | Có sử dụng `esc()` ở nhiều chỗ render | Rà toàn bộ `innerHTML` và thử payload XSS; chưa kết luận an toàn toàn diện |
| H1–H11 | Có code home, nước tràn, thuyền, vé, avatar, CSS/ảnh/âm thanh | So sánh ảnh chụp Block 8 và Block 9 khi chạy; test avatar với **Supabase Storage thật** |
| X1–X8 | README ghi đã dọn các phần SSR/cookie và tài liệu cũ | Kiểm tra lại tham chiếu và regression khi chạy |
| T1–T14 / 36 bước | Có các script và ma trận tại `docs/` | **Chưa có kết quả 36/36 trên Supabase online**, chưa có bộ ảnh Network, Local Storage, request và DB tương ứng |

**Những dịch vụ chưa được chứng minh bằng test tích hợp thật:** Supabase PostgreSQL online, Supabase Storage upload avatar, SMTP/Resend và reCAPTCHA production. Các kết quả PASS lịch sử trong README không phải kết quả của lần rà soát này. Không chạy script e2e có tác động dữ liệu trên project production.

**Checklist trước khi nộp:** dùng Supabase project test; chạy migrate/seed; chạy `npm run test:auth`, `test:register`, `test:mfa`, `test:avatar`, `test:search`; chạy `auth-ui-check.py`; kiểm tra F8/F10/F11/F13/H6; đối chiếu giao diện Block 8; lưu bằng chứng đã che token/OTP/secret; cập nhật `docs/BO-KIEM-36-BUOC.md` theo kết quả thực tế.
