# Tích hợp bộ kiểm 36 bước + auth-ui-check.py + README(2).md

## Phạm vi

- `README.md` là bản README(2).md do người dùng cung cấp, có bổ sung mục 13.
- `scripts/e2e/auth-ui-check.py` là bản do người dùng cung cấp, giữ luồng T-A đến T-I; chỉ thêm tùy chọn `CHROMIUM_PATH` cho môi trường có Chromium hệ thống.
- `BO-KIEM-36-BUOC.md` giữ đúng 36 ca theo kế hoạch.
- `MA-TRAN-36-E2E.csv` ghi rõ kiểm tra nào đã có script và kiểm tra nào chỉ được bao phủ một phần.

## Giới hạn

Bộ e2e UI không bao phủ đầy đủ cả 36 ca. Ví dụ: kiểm tra thuyền đăng xuất, so sánh pixel với Block 8, thử Storage thật, thao tác ABAC của Editor và tìm kiếm ba chế độ phải được kiểm riêng. Các mục được gắn `test:auth`/`test:mfa` chỉ là gợi ý bộ test liên quan, **không khẳng định từng ca đã PASS**.

Chưa chạy Supabase online vì không có DATABASE_URL/credentials thử nghiệm; không tự sử dụng DB production.

## Lưu ý an toàn

Script gốc sử dụng `DEV_PRINT_MAIL=1` để đọc OTP và link reset từ server log; không hoạt động như phép thử email SMTP thật. Script có ghi DB trực tiếp để khôi phục mật khẩu mẫu; nếu lỗi giữa chừng có thể để lại trạng thái thay đổi. Chỉ chạy trên project Supabase test.
