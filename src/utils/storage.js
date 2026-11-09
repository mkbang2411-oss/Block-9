// Lưu ảnh món ăn lên Supabase Storage (bucket "dish-images"), DB chỉ giữ URL.
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");
const WebSocket = require("ws");

const BUCKET = "dish-images";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// tạo client lúc cần dùng, thiếu biến môi trường thì chỉ lỗi khi upload chứ không sập cả app
let client = null;
function supabase() {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      // Node 20 không có WebSocket sẵn nên supabase-js báo lỗi "native WebSocket not found";
      // đưa gói "ws" vào để chạy được trên cả Node 20 lẫn 22+ (ta chỉ dùng Storage, không dùng realtime)
      { realtime: { transport: WebSocket } },
    );
  }
  return client;
}

// ảnh nhỏ (thumbnail) đặt cạnh ảnh gốc: abc.webp -> abc_s.webp (ô hình chỉ hiển thị ~70-90px)
const thumbPath = (path) => String(path).replace(/\.webp$/, "_s.webp");

async function uploadImage(file) {
  // thu nhỏ về tối đa 800px, đổi sang WEBP (ảnh điện thoại 3MB thường còn ~50-100KB), tự xoay đúng chiều
  const buffer = await sharp(file.buffer)
    .rotate()
    .resize({
      width: 800,
      height: 800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
  const thumb = await makeThumb(file.buffer);
  const path = `${crypto.randomUUID()}.webp`;
  const opts = { contentType: "image/webp", cacheControl: "31536000" };
  // tên file là UUID (không bao giờ đổi nội dung) nên cho trình duyệt giữ 1 năm
  const [big, small] = await Promise.all([
    supabase().storage.from(BUCKET).upload(path, buffer, opts),
    supabase().storage.from(BUCKET).upload(thumbPath(path), thumb, opts),
  ]);
  if (big.error) throw big.error;
  if (small.error) throw small.error;
  const { data } = supabase().storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

// thumbnail vuông 240px (đủ nét cho ô 88px trên màn hình 2x)
const makeThumb = (buf) =>
  sharp(buf)
    .rotate()
    .resize({ width: 240, height: 240, fit: "cover" })
    .webp({ quality: 75 })
    .toBuffer();

// Ảnh đại diện: cắt vuông 512px (cover), WEBP, bỏ metadata (EXIF/GPS). Lưu cùng bucket, thư mục avatars/<userId>/.
// Chỉ nhận JPEG/PNG/WEBP đọc được thật sự (kiểm theo nội dung ảnh, không tin mimetype client gửi) và giới hạn số điểm ảnh
// để ảnh "bom giải nén" không làm sập server.
const AVATAR_SIZE = 512;
const AVATAR_FORMATS = ["jpeg", "png", "webp"];
const AVATAR_MAX_PIXELS = 25e6;

async function processAvatar(inputBuffer) {
  let meta;
  try {
    meta = await sharp(inputBuffer, { limitInputPixels: AVATAR_MAX_PIXELS }).metadata();
  } catch (e) {
    return { error: "Không đọc được ảnh, vui lòng chọn file ảnh khác" };
  }
  if (!AVATAR_FORMATS.includes(meta.format)) return { error: "Chỉ nhận ảnh JPG, PNG hoặc WEBP" };
  if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32)
    return { error: "Ảnh quá nhỏ (tối thiểu 32×32 điểm ảnh)" };
  try {
    const buffer = await sharp(inputBuffer, { limitInputPixels: AVATAR_MAX_PIXELS })
      .rotate()
      .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    return { buffer };
  } catch (e) {
    return { error: "Không đọc được ảnh, vui lòng chọn file ảnh khác" };
  }
}

async function uploadAvatar(buffer, userId) {
  const path = `avatars/${Number(userId)}/${crypto.randomUUID()}.webp`; // tên UUID: nội dung không đổi nên cache 1 năm
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, buffer, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) throw error;
  const { data } = supabase().storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

// xóa một file đơn lẻ (không có thumbnail đi kèm như ảnh món)
async function removeFile(path) {
  if (path) await supabase().storage.from(BUCKET).remove([path]);
}

async function removeImage(path) {
  if (path) await supabase().storage.from(BUCKET).remove([path, thumbPath(path)]);
}

module.exports = { uploadImage, removeImage, processAvatar, uploadAvatar, removeFile, makeThumb, thumbPath, supabase, BUCKET, EXT };
