// Gán lại ẢNH CŨ trong bucket cho các món, theo bảng ghép trong  scripts/image-map.json
//   node scripts/restore-images.js           -> chỉ XEM TRƯỚC (không đổi gì)
//   node scripts/restore-images.js --apply   -> làm thật: cập nhật imageUrl + imagePath trong DB
// An toàn: chỉ CẬP NHẬT 2 cột ảnh của món có tên khớp; không xóa món, không xóa/upload file nào trong Storage.
// Chạy lại nhiều lần vẫn được. Cần .env có DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// image-map.json có dạng:  { "Phở bò": "06340923-6fff-4e3a-a33e-0c40bb46f4a7.webp", "Bún chả": "0cfa0b58-....webp" }
//   - khóa = TÊN MÓN đúng như trong DB (không phân biệt hoa/thường, dấu vẫn phải đúng)
//   - giá trị = tên file ảnh GỐC (không phải file có đuôi _s.webp)
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Dish, sequelize } = require("../src/models");
const { supabase, thumbPath, BUCKET } = require("../src/utils/storage");

const APPLY = process.argv.includes("--apply");
const MAP_FILE = path.join(__dirname, "image-map.json");
const chuan = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

// Đọc scripts/image-map.json. Nếu chưa có / trống / sai định dạng thì tự tìm file image-map*.json MỚI NHẤT
// trong thư mục Downloads (file tải về từ trang anh-trong-bucket.html) và copy vào scripts/.
function docJson(file) {
  try {
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    return obj && typeof obj === "object" && Object.keys(obj).some((k) => k !== "_ghi_chu") ? obj : null;
  } catch (e) {
    return null;
  }
}
function layMap() {
  const tuScripts = docJson(MAP_FILE);
  if (tuScripts) return tuScripts;
  const dl = path.join(require("os").homedir(), "Downloads");
  const ungVien = fs.existsSync(dl)
    ? fs.readdirSync(dl).filter((f) => /^image-map.*\.json$/i.test(f)).map((f) => path.join(dl, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  for (const f of ungVien) {
    const obj = docJson(f);
    if (obj) {
      fs.copyFileSync(f, MAP_FILE);
      console.log(`Đã lấy bảng ghép từ ${f} và lưu vào ${MAP_FILE}\n`);
      return obj;
    }
  }
  console.error(
    `Chưa có bảng ghép hợp lệ.\n- Mở anh-trong-bucket.html, chọn món cho từng ảnh rồi bấm "Tải file image-map.json" (file sẽ vào thư mục Downloads),\n- rồi chạy lại lệnh này. (File ${MAP_FILE} đang trống, thiếu hoặc sai định dạng JSON.)`
  );
  process.exit(1);
}

(async () => {
  const map = layMap();
  delete map._ghi_chu;

  const { data, error } = await supabase().storage.from(BUCKET).list("", { limit: 1000 });
  if (error) throw error;
  const names = new Set(data.filter((f) => f.id).map((f) => f.name));

  const dishes = await Dish.findAll();
  const byName = new Map(dishes.map((d) => [chuan(d.name), d]));

  let ok = 0, bo = 0;
  const daGan = new Set(); // id món được gán ảnh thành công
  const dungFile = new Map(); // phát hiện 1 file gán cho 2 món
  for (const [ten, file] of Object.entries(map)) {
    const dish = byName.get(chuan(ten));
    if (!dish) {
      console.log(`! bỏ qua "${ten}": không có món nào tên này trong DB`);
      bo++;
      continue;
    }
    if (!/\.webp$/i.test(file) || /_s\.webp$/i.test(file)) {
      console.log(`! bỏ qua "${ten}": "${file}" phải là ảnh gốc .webp (không phải _s.webp)`);
      bo++;
      continue;
    }
    if (!names.has(file)) {
      console.log(`! bỏ qua "${ten}": file "${file}" không có trong bucket ${BUCKET}`);
      bo++;
      continue;
    }
    if (dungFile.has(file)) console.log(`? cảnh báo: "${file}" đang gán cho cả "${dungFile.get(file)}" và "${ten}"`);
    dungFile.set(file, ten);

    const url = supabase().storage.from(BUCKET).getPublicUrl(file).data.publicUrl;
    const thieuThumb = !names.has(thumbPath(file));
    console.log(`* ${APPLY ? "gán" : "sẽ gán"} #${dish.id} ${dish.name} <- ${file}${thieuThumb ? "  (chưa có thumbnail: chạy npm run db:thumbs sau)" : ""}`);
    if (APPLY) await dish.update({ imageUrl: url, imagePath: file });
    daGan.add(dish.id);
    ok++;
  }
  const chuaCo = dishes.filter((d) => !daGan.has(d.id) && !d.imageUrl);
  console.log(`\n${APPLY ? "Đã gán" : "Sẽ gán"} ${ok} món, bỏ qua ${bo}.`);
  if (chuaCo.length) console.log(`Món vẫn chưa có ảnh: ${chuaCo.map((d) => d.name).join(", ")}`);
  if (!APPLY && ok) console.log("Muốn làm thật, chạy lại với:  node scripts/restore-images.js --apply");
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
