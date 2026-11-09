// Thu nhỏ frontend/css/style.css -> frontend/css/style.min.css (Lighthouse: "Minify CSS").
//   npm install            (cài clean-css, nằm trong devDependencies)
//   npm run build:css      (chạy lại MỖI LẦN sửa style.css rồi commit cả style.min.css)
// Trang web chỉ nạp style.min.css; style.css vẫn là file gốc để đọc/sửa.
const fs = require("fs");
const path = require("path");
const CleanCSS = require("clean-css");

const dir = path.join(__dirname, "..", "frontend", "css");
const src = fs.readFileSync(path.join(dir, "style.css"), "utf8");
const out = new CleanCSS({ level: 1 }).minify(src);
if (out.errors.length) {
  console.error(out.errors);
  process.exit(1);
}
fs.writeFileSync(path.join(dir, "style.min.css"), out.styles);
console.log(`style.css ${(src.length / 1024).toFixed(1)} KB -> style.min.css ${(out.styles.length / 1024).toFixed(1)} KB`);
