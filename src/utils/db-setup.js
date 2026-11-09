// Chạy các file db/migrations/*.sql theo thứ tự tên (file nào cũng viết kiểu IF NOT EXISTS / OR REPLACE nên chạy lại an toàn).
// Dùng cho `npm run db:migrate` và tự gọi khi server khởi động (lỗi chỉ cảnh báo, không làm sập server).
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "..", "db", "migrations");

async function runMigrations(sequelize, log = console.log) {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await sequelize.query(fs.readFileSync(path.join(DIR, f), "utf8"));
    log(`  ✓ ${f}`);
  }
  return files;
}

// đã có hàm f_norm chưa? (dùng để biết cần chạy migration không)
async function searchReady(sequelize) {
  const [rows] = await sequelize.query("SELECT to_regprocedure('f_norm(text)') IS NOT NULL AS ok");
  return !!rows[0].ok;
}

module.exports = { runMigrations, searchReady };
