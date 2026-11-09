// Tạo thumbnail 240px (abc.webp -> abc_s.webp) cho ẢNH MÓN CŨ đã upload trước khi có thumbnail.
// Ảnh mới upload qua trang quản trị sẽ tự có thumbnail (xem src/utils/storage.js).
//   node scripts/make-thumbs.js   -> chạy lại nhiều lần vẫn an toàn (ghi đè thumbnail cũ)
// Cần .env có DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
require("dotenv").config();
const { Dish, sequelize } = require("../src/models");
const { makeThumb, thumbPath, supabase, BUCKET } = require("../src/utils/storage");

(async () => {
  let ok = 0, loi = 0;
  const dishes = await Dish.findAll({ order: [["id", "ASC"]] });
  for (const d of dishes) {
    if (!d.imageUrl || !d.imagePath) continue;
    try {
      const res = await fetch(d.imageUrl);
      if (!res.ok) throw new Error("tải ảnh lỗi HTTP " + res.status);
      const thumb = await makeThumb(Buffer.from(await res.arrayBuffer()));
      const { error } = await supabase()
        .storage.from(BUCKET)
        .upload(thumbPath(d.imagePath), thumb, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: true,
        });
      if (error) throw error;
      ok++;
      console.log(`* #${d.id} ${d.name}: thumbnail ${Math.round(thumb.length / 1024)} KB`);
    } catch (e) {
      loi++;
      console.error(`! lỗi #${d.id} ${d.name}: ${e.message}`);
    }
  }
  console.log(`\nXong: ${ok} thumbnail, lỗi ${loi}.`);
  await sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
