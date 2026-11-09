require('dotenv').config();
const { Sequelize } = require('sequelize');

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Thiếu DATABASE_URL trong file .env (xem .env.example)');
}

const isPostgres = /^postgres(ql)?:/.test(url);

// Supabase bắt buộc SSL
const options = {
  logging: false,
  // giữ sẵn 1 kết nối (mặc định Sequelize đóng kết nối rảnh sau 10s -> request kế tiếp phải bắt tay SSL lại, tốn ~0.3-1s)
  pool: { max: 10, min: 1, idle: 60000, acquire: 30000 },
};
if (isPostgres) {
  options.dialect = 'postgres';
  // Supabase bắt buộc SSL; Postgres chạy ở máy mình (localhost) hoặc DB_SSL=false thì tắt SSL
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  options.dialectOptions = { keepAlive: true };
  if (!local && process.env.DB_SSL !== 'false') options.dialectOptions.ssl = { require: true, rejectUnauthorized: false };
}

module.exports = new Sequelize(url, options);
