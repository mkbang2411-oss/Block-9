require('dotenv').config();
const { Client } = require('pg');

const u = new URL(process.env.DATABASE_URL);
const user = decodeURIComponent(u.username);       // postgres.<mã project>
const password = decodeURIComponent(u.password);

const regions = [
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1',
  'ca-central-1', 'sa-east-1',
];

(async () => {
  const jobs = [];
  for (const prefix of ['aws-0', 'aws-1']) {
    for (const region of regions) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      jobs.push(
        (async () => {
          const c = new Client({
            host, port: 5432, user, password, database: 'postgres',
            ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
          });
          try {
            await c.connect();
            console.log('✅ KẾT NỐI ĐƯỢC:', host);
            await c.end();
          } catch (e) {
            if (/password authentication failed/i.test(e.message)) {
              console.log('🔑 ĐÚNG HOST, SAI MẬT KHẨU:', host);
            }
          }
        })()
      );
    }
  }
  await Promise.all(jobs);
  console.log('Xong. Nếu không có dòng ✅ hoặc 🔑 nào thì project có thể đang paused hoặc user sai.');
})();