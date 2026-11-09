// Địa chỉ gốc của REST API.
//  - Frontend và backend chạy CÙNG origin (backend serve thư mục frontend): để "/api".
//  - Backend chạy origin khác (vd http://localhost:3000) trong lúc dev: sửa thành
//    "http://localhost:3000/api" và thêm origin của frontend vào CORS_ORIGIN ở backend.
//    Block 9 không dùng cookie nên KHÔNG cần credentials; token gửi bằng header Authorization.
export const API_BASE = window.API_BASE || "/api";

// Khóa công khai reCAPTCHA v2 (không phải khóa bí mật). Đặt trước khi tải main.js, ví dụ trong index.html:
//   <script>window.RECAPTCHA_SITE_KEY = "6Lc...";</script>
// Để trống = hiện ô tick giả lập (chỉ dùng khi dev; server production không chấp nhận).
export const RECAPTCHA_SITE_KEY = window.RECAPTCHA_SITE_KEY || "";
