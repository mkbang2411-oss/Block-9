// Liệt kê ẢNH đang có trong bucket Supabase "dish-images" và các MÓN đang có trong DB,
// rồi xuất trang  anh-trong-bucket.html  (mở bằng trình duyệt) để bạn nhìn ảnh và biết ảnh nào của món nào.
//   node scripts/list-images.js
// Chỉ ĐỌC, không sửa hay xóa gì. Cần .env có DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Dish, sequelize } = require("../src/models");
const { supabase, thumbPath, BUCKET } = require("../src/utils/storage");

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kb = (n) => (n ? Math.round(n / 1024) + " KB" : "?");

(async () => {
  // 1) lấy toàn bộ file trong bucket (tối đa 1000, đủ cho đồ án)
  const { data, error } = await supabase()
    .storage.from(BUCKET)
    .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw error;
  const files = data.filter((f) => f.id); // bỏ thư mục
  const names = new Set(files.map((f) => f.name));
  const goc = files.filter((f) => /\.webp$/i.test(f.name) && !/_s\.webp$/i.test(f.name));
  const url = (name) => supabase().storage.from(BUCKET).getPublicUrl(name).data.publicUrl;

  // 2) lấy các món trong DB
  const dishes = await Dish.findAll({ order: [["id", "ASC"]] });
  const dungRoi = new Set(dishes.map((d) => d.imagePath).filter(Boolean));

  console.log(`Bucket "${BUCKET}": ${files.length} file, ${goc.length} ảnh gốc (.webp, không tính _s).`);
  console.log(`Database: ${dishes.length} món, ${dishes.filter((d) => d.imageUrl).length} món đang có ảnh.\n`);
  console.log("ID  | Tên món                          | Ảnh hiện tại");
  dishes.forEach((d) => console.log(`${String(d.id).padEnd(3)} | ${d.name.padEnd(32)} | ${d.imagePath || "(chưa có)"}`));

  // 3) trang HTML đối chiếu
  const tuyChon = dishes.map((d) => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join("");
  const cards = goc
    .map((f, i) => {
      const nho = names.has(thumbPath(f.name)) ? thumbPath(f.name) : f.name;
      const size = f.metadata && f.metadata.size;
      const ngay = f.created_at ? new Date(f.created_at).toLocaleString("vi-VN") : "";
      return `<figure class="${dungRoi.has(f.name) ? "dung" : ""}">
  <a href="${esc(url(f.name))}" target="_blank"><img src="${esc(url(nho))}" alt="" loading="lazy"></a>
  <select data-file="${esc(f.name)}"><option value="">— ảnh này của món nào? —</option>${tuyChon}</select>
  <figcaption><b>#${i + 1}</b> ${dungRoi.has(f.name) ? "<em>đang gắn vào món</em>" : ""}<br>
  <code>${esc(f.name)}</code><br><small>${esc(ngay)} · gốc ${kb(size)} · ${names.has(thumbPath(f.name)) ? "có thumbnail" : "THIẾU thumbnail"}</small></figcaption>
</figure>`;
    })
    .join("\n");
  const bang = dishes
    .map((d) => `<tr><td>${d.id}</td><td>${esc(d.name)}</td><td>${esc(d.category)}</td><td>${d.imagePath ? esc(d.imagePath) : "<i>chưa có ảnh</i>"}</td></tr>`)
    .join("\n");
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Ảnh trong bucket ${esc(BUCKET)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:24px;background:#faf6ef;color:#2b2118}
h1{margin:0 0 4px}table{border-collapse:collapse;margin:12px 0 28px;background:#fff}
td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}th{background:#f0e6d6}
.luoi{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
figure{margin:0;background:#fff;border:1px solid #e3d7c3;border-radius:10px;overflow:hidden}
figure.dung{opacity:.55}img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
select{width:100%;padding:7px;border:0;border-top:1px solid #e3d7c3;font:inherit;background:#fffaf0}
select.co{background:#d9f2d9}
.thanh{position:sticky;top:0;background:#faf6ef;padding:10px 0;z-index:5;border-bottom:1px solid #e3d7c3;margin-bottom:14px}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #8a5a2b;background:#8a5a2b;color:#fff;cursor:pointer}
textarea{width:100%;height:170px;margin-top:8px;font:12px/1.4 monospace;display:none}
#canh{color:#b00;margin-left:10px}
figcaption{padding:8px 10px;font-size:13px;word-break:break-all}code{font-size:12px}em{color:#b00;font-style:normal}
</style>
<h1>Ảnh trong bucket "${esc(BUCKET)}"</h1>
<p>${goc.length} ảnh gốc · ${dishes.length} món trong DB. Chọn món dưới mỗi ảnh. Bấm vào ảnh để xem bản gốc. Ảnh mờ = đang gắn vào một món rồi.</p>
<h2>Các món trong database</h2>
<table><tr><th>ID</th><th>Tên món</th><th>Danh mục</th><th>Ảnh hiện tại</th></tr>${bang}</table>
<h2>Ảnh trong bucket (xếp theo thời gian upload)</h2>
<div class="thanh">
  <button id="tai">Tải file image-map.json</button> <button id="tao" style="background:#fff;color:#8a5a2b">Hoặc: hiện nội dung để copy</button> <span id="dem">0 ảnh đã chọn món</span><span id="canh"></span>
  <textarea id="kq" readonly></textarea>
</div>
<div class="luoi">${cards}</div>
<script>
const $ = (s) => document.querySelector(s), sels = [...document.querySelectorAll("select[data-file]")];
function capNhat() {
  const dem = {};
  sels.forEach((x) => { x.classList.toggle("co", !!x.value); if (x.value) dem[x.value] = (dem[x.value] || 0) + 1; });
  $("#dem").textContent = sels.filter((x) => x.value).length + " ảnh đã chọn món";
  const trung = Object.keys(dem).filter((k) => dem[k] > 1);
  $("#canh").textContent = trung.length ? "Cảnh báo: món chọn 2 lần: " + trung.join(", ") : "";
}
sels.forEach((x) => x.addEventListener("change", capNhat));
const taoMap = () => {
  const map = {};
  sels.forEach((x) => { if (x.value) map[x.value] = x.dataset.file; }); // món chọn 2 lần: giữ ảnh chọn sau cùng
  return JSON.stringify(map, null, 2);
};
$("#tai").onclick = () => {
  const text = taoMap();
  if (text === "{}") { $("#canh").textContent = "Chưa chọn món nào cho ảnh."; return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = "image-map.json";
  a.click();
  $("#canh").textContent = "Đã tải image-map.json vào thư mục Downloads. Giờ chạy: node scripts/restore-images.js";
};
$("#tao").onclick = () => {
  const text = taoMap();
  const kq = $("#kq"); kq.style.display = "block"; kq.value = text; kq.select();
  const huongDan = () => ($("#canh").textContent = "Bấm Ctrl+C (Cmd+C trên Mac) để copy ô bên dưới, rồi dán vào scripts/image-map.json");
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => ($("#canh").textContent = "Đã copy! Dán vào scripts/image-map.json rồi lưu lại."), huongDan);
  else huongDan();
};
</script></html>`;
  const out = path.join(__dirname, "..", "anh-trong-bucket.html");
  fs.writeFileSync(out, html);
  console.log(`\nĐã tạo: ${out}\nMở file này bằng trình duyệt, chọn món cho từng ảnh, bấm "Tạo nội dung image-map.json" rồi dán vào scripts/image-map.json`);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
