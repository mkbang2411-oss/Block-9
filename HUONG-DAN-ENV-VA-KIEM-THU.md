# Hướng dẫn cấu hình .env và kiểm thử Block 9

## 1. Tạo file cấu hình (không đưa khóa bí mật vào ZIP/Git)

Tại thư mục Block-9, chạy `cp .env.example .env` trên macOS/Linux hoặc `Copy-Item .env.example .env` trên PowerShell. File `.env` thật được giữ trên máy bạn. Không gửi mật khẩu, khóa JWT, khóa Supabase service role hoặc SMTP password qua chat.

| Biến | Điền ở đâu / ý nghĩa | Bắt buộc khi nào |
|---|---|---|
| `DATABASE_URL` | Supabase Dashboard → Project Settings → Database → Connection string; chọn Session pooler và thay password đã URL-encode; hoặc `postgresql://postgres:password@localhost:5432/ten_db` | Luôn cần để chạy backend |
| `PORT` | `3000` hoặc cổng còn trống | Có mặc định |
| `SUPABASE_URL` | Project URL từ Supabase → Project Settings → API | Khi upload ảnh lên Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Khóa **service_role** từ API settings; **chỉ backend**, không đưa vào frontend | Khi upload ảnh |
| `CORS_ORIGIN` | Các origin SPA được phép, ví dụ `http://localhost:3000,http://localhost:5173`; không dùng `*` | Khi frontend khác origin |
| `JWT_SECRET` | Tạo riêng bằng `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | Bắt buộc để đăng nhập |
| `JWT_EXPIRES_IN` | `15m` (test hết hạn: `5s`, chỉ trong môi trường test) | Nên giữ 15m |
| `MFA_ENCRYPTION_KEY` | Chuỗi ngẫu nhiên độc lập với JWT_SECRET, dùng lệnh trên; **không thay đổi** sau khi có MFA | Khuyến nghị bắt buộc cho production |
| `MFA_ISSUER` | `Cai Quan An` (tên hiện trong Google Authenticator) | Tùy chọn |
| `APP_URL` | `http://localhost:3000` khi chạy máy; URL HTTPS thực khi triển khai | Email reset và reCAPTCHA |
| `MAIL_FROM` | Email người gửi hợp lệ, ví dụ `"Cai Quan An <your-account@gmail.com>"` | Gửi mail thật |
| `SMTP_HOST`, `SMTP_PORT` | Gmail: `smtp.gmail.com`, `587` | Khi dùng SMTP |
| `SMTP_USER`, `SMTP_PASS` | Email Gmail và **App Password** của Gmail (không phải mật khẩu đăng nhập thường) | Khi dùng SMTP |
| `RESEND_API_KEY` | API key từ Resend; dùng **thay cho** SMTP nếu chọn Resend | Khi dùng Resend |
| `DEV_PRINT_MAIL` | `1` để in OTP/link reset vào log khi dev; để trống khi gửi mail thật | Kiểm thử local |
| `RECAPTCHA_SITE_KEY` | Google reCAPTCHA v2 site key, dành cho frontend | Production |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v2 secret key, chỉ backend | Production |
| `RECAPTCHA_HOSTNAMES` | Danh sách hostname được phép (ví dụ `localhost,example.com`), **không** có `https://` hoặc cổng | Production |
| `CHEF_INVITE_CODE` | Mã mời tự đặt đủ khó đoán; để trống nếu không cho tự đăng ký editor | Khi thử mã mời |
| `SEED_PASSWORD` | Mật khẩu mẫu mạnh cho `viewer@example.com`, `editor@example.com`, `admin@example.com` | Khi seed/test |
| `NODE_ENV` | `development` trên máy; `production` khi triển khai | Theo môi trường |
| `DB_SSL` | Để trống cho Supabase (SSL); `false` cho PostgreSQL local không SSL | Tùy DB |
| `TRUST_PROXY` | `1` nếu chạy sau reverse proxy tin cậy (ví dụ Render), tránh cấu hình tùy tiện | Khi triển khai proxy |

Để thử local mà chưa có dịch vụ mail, đặt `DEV_PRINT_MAIL=1`, để trống `SMTP_USER`, `SMTP_PASS`, `RESEND_API_KEY`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`. Điều này **không** thay thế PostgreSQL: `DATABASE_URL` vẫn phải trỏ đến cơ sở dữ liệu đang hoạt động.

## 2. Chạy trên máy có PostgreSQL/Supabase thật

```bash
npm ci
npm run build:css
npm run db:migrate
npm run db:seed
npm run db:seed:users
npm start
```

Mở terminal khác và chạy:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
SERVER_LOG=/duong-dan/server.log SEED_PASSWORD='mat-khau-seed' npm run test:ui-auth
npm run test:auth
npm run test:register
npm run test:mfa
npm run test:avatar
npm run test:search
```

Để có `SERVER_LOG`, chạy server với `npm start > /duong-dan/server.log 2>&1` (macOS/Linux). Với PowerShell dùng `npm start *> server.log`, rồi đặt `SERVER_LOG` thành đường dẫn tuyệt đối. Script e2e có thay đổi tài khoản thử nghiệm; **chỉ chạy trên DB test riêng**, không chạy trên DB production. `editor@example.com` phải chưa bật MFA trước khi chạy. Test có thể vướng giới hạn tốc độ nếu lặp nhiều lần.

## 3. Kết quả xác minh ở lần bàn giao này

- `node --check` trên tất cả file `.js` thuộc `src`, `frontend/js`, `scripts`: **PASS cú pháp**.
- `python3 -m py_compile scripts/e2e/auth-ui-check.py`: **PASS cú pháp**.
- `auth-ui-check.py`: **CHƯA CHẠY ĐƯỢC ĐẾN ASSERTION** trong môi trường bàn giao. Playwright mặc định thiếu browser bundle; sau khi dùng Chromium hệ thống, điều hướng `localhost:3000` bị chặn (`ERR_BLOCKED_BY_ADMINISTRATOR`). Không có `DATABASE_URL` hợp lệ và Postgres thật nên không được báo PASS.
- Không tìm thấy một script riêng mang tên “bộ kiểm 36 bước” trong gói Block 9. Các số test ghi trong README gốc là kết quả lịch sử, chưa phải kết quả chạy lại sau khi sửa nước.
- Đã bổ sung **3 assertion e2e** về bấm `Trang chủ` từ `/login`: xuất hiện lớp nước, chuyển về `/`, lớp phủ được dọn. Tổng dự kiến **54 assertions**, chưa xác nhận đạt.

## 4. Đối chiếu với kế hoạch

Luồng mục tiêu: đăng ký CAPTCHA → OTP → thông tin; đăng nhập email/mật khẩu → CAPTCHA sau sai nhiều lần → MFA nếu bật → token JWT; quên mật khẩu qua link; role viewer/editor/admin do backend quyết định; editor chỉ sửa món nháp của chính mình; phố có thuyền đăng xuất, cô gái và vé hành khách. Đây là **checklist cần nghiệm thu**, không phải lời khẳng định tất cả đã chạy thành công trên backend thật.

Giao diện đăng nhập/đăng ký của Block 9 dùng các thành phần cảnh đêm, sông, thuyền, CAPTCHA, OTP theo Block 8, nhưng Block 9 là SPA, còn Block 8 là SSR; không thể kết luận giống pixel 100% chỉ từ mã nguồn. Nên chụp cùng viewport và so sánh trên browser sau khi backend chạy.
