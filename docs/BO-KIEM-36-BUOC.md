# Bộ nghiệm thu 36 bước — Block 9

> Nguồn chuẩn: `Ke-hoach-chuyen-Block-7-CSR-sang-JWT.md`, phần 4–8 (B/F/H/T), đối chiếu README Block 9. Đây là **36 ca nghiệm thu được xây dựng từ kế hoạch**, không phải 36 assertion có sẵn trong script.

**Trạng thái tại lần tạo:** 0/36 ca được xác nhận PASS trên Supabase thật. `CHƯA CHẠY` không có nghĩa là FAIL. Các bài có thao tác DB nên chạy trên Supabase project thử nghiệm, không chạy trên dữ liệu production.

| # | Nguồn | Bước kiểm | Kết quả cần đạt | Trạng thái |
|---:|---|---|---|---|
| 1 | T1/B9 | GET /api/chefs không token | 401 UNAUTHENTICATED | CHƯA CHẠY |
| 2 | T2/B8 | JWT sai chữ ký | 401 UNAUTHENTICATED | CHƯA CHẠY |
| 3 | T2/B8 | JWT sửa role hoặc alg:none | Không nâng quyền; 401 | CHƯA CHẠY |
| 4 | T3/B8 | JWT hết hạn | 401 TOKEN_EXPIRED | CHƯA CHẠY |
| 5 | T4/B16 | OPTIONS từ CORS_ORIGIN hợp lệ | 204; cho phép Authorization | CHƯA CHẠY |
| 6 | T4/B16 | OPTIONS từ origin không hợp lệ | Không trả Access-Control-Allow-Origin | CHƯA CHẠY |
| 7 | B11/F1 | Đăng nhập và GET /api/auth/me bằng Bearer | Trả người dùng/role thật, không lộ secret | CHƯA CHẠY |
| 8 | B14/T7 | Đổi mật khẩu rồi thử access token cũ | Token cũ bị từ chối | CHƯA CHẠY |
| 9 | B13/F5 | CAPTCHA và gửi OTP đăng ký | Gửi OTP; không tạo token trước kích hoạt | CHƯA CHẠY |
| 10 | B13/F5 | OTP sai, hết hạn, nhập lại | Từ chối OTP không hợp lệ | CHƯA CHẠY |
| 11 | B13/F5 | OTP đúng, nhập tên/mật khẩu | Tạo tài khoản viewer | CHƯA CHẠY |
| 12 | B13/Q7 | Mã mời editor hợp lệ và giả mạo role | Chỉ mã hợp lệ cấp editor; body role không tăng quyền | CHƯA CHẠY |
| 13 | T6/B10 | Sai mật khẩu lần 1–2 | Báo sai; không cấp token | CHƯA CHẠY |
| 14 | T6/B10 | Sai lần 3 và CAPTCHA | Yêu cầu CAPTCHA | CHƯA CHẠY |
| 15 | T6/B10 | Sai 10 lần | Khóa tạm 5 phút | CHƯA CHẠY |
| 16 | T6/B7 | Thử vượt rate limit | 429 RATE_LIMITED | CHƯA CHẠY |
| 17 | B14/F6 | Quên mật khẩu và mở link reset | Link có hạn; đặt lại được; không cấp token | CHƯA CHẠY |
| 18 | B10/F7 | Đăng nhập có MFA bật | Trả challenge, chưa cấp accessToken | CHƯA CHẠY |
| 19 | T11/B19 | Dùng MFA challenge gọi /api/chefs | 401; challenge không thay accessToken | CHƯA CHẠY |
| 20 | B19/F8 | Setup MFA và nhập TOTP hợp lệ | Bật MFA, cấp mã recovery một lần | CHƯA CHẠY |
| 21 | T12/B19 | Dùng lại mã TOTP | Từ chối mã đã dùng | CHƯA CHẠY |
| 22 | T12/B20 | Dùng recovery code lần thứ hai | Từ chối | CHƯA CHẠY |
| 23 | T12/B19 | Nhập sai MFA quá giới hạn | Khóa tạm | CHƯA CHẠY |
| 24 | T13/B21 | Tắt MFA/tạo lại recovery thiếu xác thực lại | Từ chối; yêu cầu mật khẩu + mã | CHƯA CHẠY |
| 25 | T8/B17 | Viewer POST/PATCH món | 403; dữ liệu không đổi | CHƯA CHẠY |
| 26 | T8/B17 | Editor DELETE món | 403; dữ liệu không đổi | CHƯA CHẠY |
| 27 | T9/B18 | Editor PATCH món đầu bếp khác | 403 | CHƯA CHẠY |
| 28 | T9/B18 | Editor PATCH món published của mình | 403 | CHƯA CHẠY |
| 29 | T9/B18 | Editor PATCH món draft của mình; admin DELETE | Editor sửa được draft; admin xóa được | CHƯA CHẠY |
| 30 | T10/F10 | Sửa localStorage/body role chefId status | Không tăng quyền server; UI ẩn thao tác trái phép | CHƯA CHẠY |
| 31 | H3/F4 | Chưa đăng nhập bấm nhà hàng | Nước tràn rồi tới /login, không hộp chọn vai | CHƯA CHẠY |
| 32 | H3/H10 | Bấm Trang chủ từ login/register | Nước tràn, về phố, dọn lớp phủ | CHƯA CHẠY |
| 33 | H2/H1 | Đã đăng nhập ra phố rồi bấm thuyền | Không tự logout; thuyền hỏi xác nhận rồi logout | CHƯA CHẠY |
| 34 | H4/H5/H6 | Viewer chọn Đầu bếp; cô gái/vé/avatar | Báo vai không hợp lệ; vé đúng; đổi avatar hoạt động | CHƯA CHẠY |
| 35 | H9/H10/F4-F7 | Đối chiếu ảnh chụp login/register/forgot/MFA với Block 8 | Bố cục, ảnh, CSS và các trạng thái khớp thiết kế; ghi khác biệt SPA/SSR | CHƯA CHẠY |
| 36 | T5/B26/F13 | Tìm kiếm, phân trang, ba chế độ, dây kéo | Không hỏng tính năng Block 7; test:search PASS | CHƯA CHẠY |

## Cách thực hiện trên Supabase online

1. Tạo **project thử nghiệm riêng** trên Supabase, lấy PostgreSQL connection string ở **Connect → Session pooler** và điền vào `.env` tại máy chạy backend. Không gửi `.env` hay secret lên GitHub.
2. `npm install`; `npm run db:migrate`; tạo dữ liệu test theo hướng dẫn README; `npm start`. Chỉ seed/reset trên database thử nghiệm.
3. Mở terminal khác, chạy `npm run test:auth`, `npm run test:register`, `npm run test:mfa`, `npm run test:search`, `npm run test:avatar` (nếu đã cấu hình Storage).
4. Cài Playwright: `python3 -m pip install playwright` và `python3 -m playwright install chromium`; chạy `npm run test:ui-auth` với backend đang chạy, cấu hình `SERVER_LOG`, `SEED_PASSWORD`, `DEV_PRINT_MAIL` theo README.
5. Kiểm tra thủ công các ca visual/hiệu ứng với Block 8 đang chạy, lưu screenshot, network log đã che token và kết quả từng ca vào cột `Trạng thái`/`Bằng chứng` của CSV.
6. Không đánh dấu PASS cho email thật, reCAPTCHA thật, Supabase Storage khi chỉ chạy bằng mock/dev mode.

## Đối chiếu Block 8

Các file ảnh/âm thanh giống nhau không chứng minh CSS hoặc bố cục đã giống. Cần chụp cùng viewport cho `/login`, `/register` (3 bước), `/forgot-password`, `/reset-password`, `/mfa` và các trạng thái lỗi/CAPTCHA; so sánh thủ công và ghi sai khác. Block 8 SSR và Block 9 SPA nên kiểm **trải nghiệm và luồng**, không yêu cầu DOM/URL nội bộ giống hệt.

## Liên hệ với script e2e hiện có

`scripts/e2e/auth-ui-check.py` chứa các assertion giao diện, không ánh xạ một-một tới 36 ca này. Bộ 36 ca là **ma trận nghiệm thu** bao gồm cả API, bảo mật, UI, Storage và hồi quy. Không cộng số assertion để tuyên bố đã PASS 36/36.
