// Tìm theo tên dùng chung cho trang khách và trang đầu bếp.
// Không phân biệt hoa/thường và dấu tiếng Việt: gõ "pho bo", "phở bò" hay "PHO" đều ra "Phở bò".
// Nhiều từ -> tên phải chứa đủ các từ (không cần đúng thứ tự).
const boDau = (s) =>
  String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();

const khop = (ten, q) => {
  const tu = boDau(q).split(" ").filter(Boolean);
  if (!tu.length) return true;
  const n = boDau(ten);
  return tu.every((t) => n.includes(t));
};

// q lấy từ ?q=..., luôn trả về chuỗi đã trim
const layQ = (req) =>
  typeof req.query.q === "string" ? req.query.q.trim() : "";

module.exports = { khop, layQ };
