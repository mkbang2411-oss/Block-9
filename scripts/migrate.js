// npm run db:migrate  -  tạo bảng còn thiếu (sync, KHÔNG xóa dữ liệu) rồi chạy db/migrations/*.sql (extension, hàm, index tìm kiếm).
require("dotenv").config();
const { sequelize } = require("../src/models");
const { runMigrations } = require("../src/utils/db-setup");

(async () => {
  await sequelize.sync();
  console.log("Chạy migration:");
  await runMigrations(sequelize);
  console.log("Xong.");
  await sequelize.close();
})().catch((e) => {
  console.error("Migration lỗi:", e.message);
  process.exit(1);
});
