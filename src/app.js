const fs = require("fs");
const path = require("path");
const express = require("express");
const compression = require("compression");

const app = express();
// sau reverse proxy (Render...) để req.ip là IP thật của client (rate limit theo IP)
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
// không để lộ "X-Powered-By: Express"
app.disable("x-powered-by");

// nén HTML/CSS/JS trước khi gửi về trình duyệt
app.use(compression());

// endpoint nhẹ, không đụng DB: dùng cho dịch vụ ping (UptimeRobot...) giữ Render free không "ngủ"
app.get("/healthz", (req, res) => res.type("text").send("ok"));

// Xác thực bằng JWT trong header Authorization (không còn cookie) -> không cần cookie-parser, CSRF
// ---------- REST API (JSON): có CORS, định dạng lỗi và xử lý lỗi riêng ----------
app.use("/api", require("./routes/api"));

// ---------- Frontend SPA (thư mục frontend/) ----------
const FRONT = path.join(__dirname, "..", "frontend");
// ảnh (/img) ít đổi nên cache 30 ngày, CSS/JS cache 1 ngày
app.use(
  express.static(FRONT, {
    maxAge: "1d",
    index: false, // index.html do route fallback bên dưới trả (không cache)
    setHeaders: (res, file) => {
      if (/[\\/]img[\\/]/.test(file)) res.setHeader("Cache-Control", "public, max-age=2592000");
    },
  }),
);

// Routing phía client: mọi đường dẫn GET còn lại (vd /admin/dishes/3/edit khi F5) đều trả index.html.
// Đường dẫn có đuôi file (.js, .css, .png...) mà không tồn tại thì trả 404 thật, không trả HTML.
// Server chèn RECAPTCHA_SITE_KEY (khóa CÔNG KHAI) vào index.html để frontend vẽ reCAPTCHA thật; không đặt khóa = ô tick giả lập (chỉ dev).
const INDEX_FILE = path.join(FRONT, "index.html");
function renderIndex() {
  const key = String(process.env.RECAPTCHA_SITE_KEY || "").trim();
  const tag = key ? `<script>window.RECAPTCHA_SITE_KEY=${JSON.stringify(key).replace(/</g, "\\u003c")};</script>` : "";
  return fs.readFileSync(INDEX_FILE, "utf8").replace("<!--RECAPTCHA_CONFIG-->", tag);
}
app.get("*", (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.setHeader("Cache-Control", "no-cache");
  try {
    res.type("html").send(renderIndex());
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => res.status(404).type("text").send("Not found"));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).type("text").send("Có lỗi xảy ra phía máy chủ.");
});

module.exports = app;
