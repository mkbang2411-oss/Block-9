// Thu nhỏ ẢNH MÓN CŨ đã upload trước khi có tính năng tự thu nhỏ.
//   node scripts/optimize-images.js           -> chỉ XEM TRƯỚC (không đổi gì): in ra ảnh nào nặng, dự kiến nhỏ đi bao nhiêu
//   node scripts/optimize-images.js --apply   -> làm thật: tải ảnh, thu nhỏ, upload ảnh mới, cập nhật DB, rồi mới xóa ảnh cũ
// Cần .env có DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (giống khi chạy app). Chạy lại nhiều lần vẫn an toàn:
// ảnh đã nhỏ sẽ được bỏ qua.
require("dotenv").config();
const sharp = require("sharp");
const { Dish, sequelize } = require("../src/models");
const { uploadImage, removeImage } = require("../src/utils/storage");

const APPLY = process.argv.includes("--apply");
const NGUONG = 150 * 1024; // ảnh nhỏ hơn mức này (và rộng <= 800px, đã là webp) thì bỏ qua
const kb = (n) => Math.round(n / 1024) + " KB";

// cùng cách xử lý với storage.js (để ước tính khớp với kết quả thật)
const thuNho = (buf) =>
  sharp(buf)
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

(async () => {
  let tong = 0, tietKiem = 0, loi = 0;
  const dishes = await Dish.findAll({ order: [["id", "ASC"]] });
  for (const d of dishes) {
    if (!d.imageUrl) continue;
    try {
      const res = await fetch(d.imageUrl);
      if (!res.ok) throw new Error("tải ảnh lỗi HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(buf).metadata();
      if (buf.length < NGUONG && meta.width <= 800 && meta.format === "webp") {
        console.log(`- bỏ qua  #${d.id} ${d.name}: ${kb(buf.length)} (đã nhỏ)`);
        continue;
      }
      const moi = await thuNho(buf);
      tong++;
      tietKiem += buf.length - moi.length;
      console.log(`* ${APPLY ? "xử lý" : "sẽ xử lý"} #${d.id} ${d.name}: ${kb(buf.length)} (${meta.width}x${meta.height}) -> khoảng ${kb(moi.length)}`);
      if (!APPLY) continue;
      const cu = d.imagePath;
      const img = await uploadImage({ buffer: buf }); // 1) upload ảnh mới
      await d.update({ imageUrl: img.url, imagePath: img.path }); // 2) trỏ DB sang ảnh mới
      if (cu) await removeImage(cu); // 3) cuối cùng mới xóa ảnh cũ
    } catch (e) {
      loi++;
      console.error(`! lỗi #${d.id} ${d.name}: ${e.message} (giữ nguyên ảnh cũ)`);
    }
  }
  console.log(`\n${APPLY ? "Đã xử lý" : "Sẽ xử lý"} ${tong} ảnh, tiết kiệm khoảng ${kb(tietKiem)}, lỗi ${loi}.`);
  if (!APPLY && tong) console.log("Muốn làm thật, chạy lại với:  node scripts/optimize-images.js --apply");
  await sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
