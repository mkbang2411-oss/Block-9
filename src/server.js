const app = require("./app");
const { sequelize } = require("./models");
const { runMigrations, searchReady } = require("./utils/db-setup");
const { addMissingColumns } = require("./utils/migrate");
const { startCleanup } = require("./utils/cleanup");
const { assertConfigured } = require("./utils/jwt");
const { checkRecaptchaConfig } = require("./utils/recaptcha");
const { User, Dish } = require("./models");

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    assertConfigured(); // thiếu/ngắn JWT_SECRET -> dừng ngay
    checkRecaptchaConfig(); // báo sớm nếu reCAPTCHA / email chưa cấu hình
    await sequelize.authenticate();
    // Code-first: bảng được tạo từ model (chưa có thì tạo, có rồi thì giữ nguyên)
    await sequelize.sync();
    // sync() không thêm cột vào bảng đã có: bổ sung users.chefId/..., dishes.status cho DB đang có dữ liệu
    await addMissingColumns(sequelize, [User, Dish]);
    // Tìm kiếm cần hàm f_norm / f_tsv + extension unaccent, pg_trgm (db/migrations). Thiếu thì tự chạy migration (chạy lại an toàn)
    try {
      if (!(await searchReady(sequelize))) {
        console.log("Chưa có cấu hình tìm kiếm trong DB, đang chạy migration...");
        await runMigrations(sequelize);
      }
    } catch (e) {
      console.error("Không chạy được migration tìm kiếm (hãy chạy: npm run db:migrate):", e.message);
    }
    startCleanup(); // dọn OTP, link đặt lại, tài khoản chưa kích hoạt quá 7 ngày
    app.listen(PORT, () =>
      console.log(`Server chạy tại http://localhost:${PORT}`),
    );
  } catch (err) {
    console.error("Không kết nối được database:", err.message);
    process.exit(1);
  }
})();
