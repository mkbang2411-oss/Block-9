// Cấu hình + hàm dùng chung cho màn hình danh sách (món ăn / đầu bếp / nguyên liệu):
//   - LIST: các kiểu sắp xếp và bộ lọc của từng tài nguyên (giao diện; server có whitelist riêng, xem src/utils/list-query.js)
//   - trạng thái danh sách <-> địa chỉ URL:  ?q=&sort=&category=...&page=&sel=   (bookmark / F5 / Back đều giữ đúng)
//   - matchRow: lọc tức thì ở client trên dữ liệu đang có (cùng thuật toán với server)
//   - nhoDanhSach / quayLai: nhớ URL danh sách gần nhất để từ trang chi tiết / form quay lại đúng trang, đúng bộ lọc
import { api } from "./api.js";

// bỏ dấu + hạ chữ thường (giống src/utils/tim-kiem.js): "PHỞ Bò" -> "pho bo"
export const boDau = (s) =>
  String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();

// nhiều từ -> tên phải chứa đủ các từ, ở bất kỳ vị trí nào (đầu / giữa / cuối)
const khopTen = (ten, q) => {
  const tu = boDau(q).split(" ").filter(Boolean);
  if (!tu.length) return true;
  const n = boDau(ten);
  return tu.every((t) => n.includes(t));
};

// ---------- kiểu tìm (mode gửi lên server) ----------
// Chọn bằng nút bấm trong phiếu lọc (giống A → Z / Z → A). Mặc định giữ "Gần đúng" như trước.
//   basic    tên chứa từ khóa              advanced  từ khóa + các bộ lọc ghép AND
//   fulltext tên + mô tả (to_tsvector)     fuzzy     tên gần giống (pg_trgm, ngưỡng 0.3)
export const MODES = [
  ["basic", "Thường", "Tìm món có tên chứa chữ bạn gõ"],
  [
    "advanced",
    "Nâng cao",
    "Tìm theo tên, kèm các bộ lọc bên dưới (danh mục, giá, tình trạng)",
  ],
  ["fulltext", "Toàn văn", "Tìm cả trong tên lẫn phần mô tả món"],
  ["fuzzy", "Gần đúng", "Gõ sai chính tả một chút vẫn tìm ra"],
];
export const MODE_MAC_DINH = "fuzzy";
export const hopLeMode = (m) => MODES.some(([k]) => k === m);
// chỉ fulltext / fuzzy có điểm -> mới có "Độ liên quan"
export const coDiem = (mode) => mode === "fulltext" || mode === "fuzzy";
export const coLienQuan = (S) => !!S.q && coDiem(S.mode);

// ---------- sắp xếp: chia 2 khu ----------
//   khu 1: TRƯỜNG sắp xếp (Tên, Giá, ...)      khu 2: THỨ TỰ (A → Z / Z → A)
// "Độ liên quan" chỉ có nghĩa khi đang có từ khóa (luôn xếp từ giống nhất xuống), nên khu thứ tự bị khóa khi chọn nó.
export const DIRS = [
  ["asc", "A → Z"],
  ["desc", "Z → A"],
];
const F_TEN = ["name", "Tên"];
const F_MOI = ["newest", "Mới thêm"];
const F_REL = ["relevance", "Độ liên quan"];
export const BY_MAC_DINH = "name";
export const DIR_MAC_DINH = "asc";
// có từ khóa + mode có điểm (fulltext / fuzzy) thì mặc định xếp theo độ liên quan, không thì theo tên
export const byMacDinh = (q, mode = MODE_MAC_DINH) =>
  q && coDiem(mode) ? "relevance" : BY_MAC_DINH;

// ---------- khoảng giá: thanh kéo 7 nấc ----------
// Thanh kéo có 2 núm (giá từ / giá đến) và 7 mốc; núm trái ở đầu thanh (0đ) = không giới hạn dưới,
// núm phải ở mốc cuối = "Trên 10.000.000" = không giới hạn trên. Giá trị lưu là số đầy đủ (100000, không phải 100).
export const MOC_GIA = [
  100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000,
];

// options: hàm nhận { categories, units } từ GET /api/options, trả danh sách giá trị (hoặc [giá trị, nhãn])
export const LIST = {
  dishes: {
    fields: [F_TEN, ["price", "Giá"], F_MOI, F_REL],
    gia: true, // có thanh kéo khoảng giá (minPrice / maxPrice)
    filters: [
      {
        name: "category",
        type: "select",
        label: "Danh mục",
        options: (o) => o.categories,
        test: (r, v) => r.category === v,
      },
      {
        name: "available",
        type: "select",
        label: "Tình trạng",
        options: () => [
          ["true", "Còn bán"],
          ["false", "Hết món"],
        ],
        test: (r, v) => String(!!r.available) === v,
      },
      // hai bộ lọc giá do thanh kéo (js/gia-keo.js) điều khiển, nên không vẽ ô nhập (an: true)
      {
        name: "minPrice",
        type: "number",
        an: true,
        test: (r, v) => Number(r.price) >= Number(v),
      },
      {
        name: "maxPrice",
        type: "number",
        an: true,
        test: (r, v) => Number(r.price) <= Number(v),
      },
      {
        name: "chef",
        type: "text",
        label: "Tên đầu bếp",
        placeholder: "vd: lan, nguyen van",
        test: (r, v) => khopTen(r.chef ? r.chef.name : "", v),
      },
    ],
  },
  chefs: {
    fields: [F_TEN, F_MOI, F_REL],
    filters: [
      {
        name: "specialty",
        type: "text",
        label: "Chuyên môn",
        placeholder: "vd: phở, nướng",
        test: (r, v) => khopTen(r.specialty || "", v),
      },
    ],
  },
  ingredients: {
    fields: [F_TEN, F_MOI, F_REL],
    filters: [
      {
        name: "unit",
        type: "select",
        label: "Đơn vị",
        options: (o) => o.units,
        test: (r, v) => r.unit === v,
      },
    ],
  },
};

export const cacPair = (f, opts) =>
  f.options(opts).map((x) => (Array.isArray(x) ? x : [x, x]));

// /api/options ít đổi: lấy một lần rồi nhớ
let optP = null;
export const layOptions = () =>
  (optP ||= api.options().catch((e) => ((optP = null), Promise.reject(e))));

// ---------- chế độ hiển thị: phân trang / load more / cuộn vô hạn ----------
// Cả 3 chế độ gọi CÙNG một API (page + sắp xếp + lọc), chỉ khác cách client nối các trang lại.
// Lưu lựa chọn vào localStorage để 3 tab (món / đầu bếp / nguyên liệu) và trang khách luôn đồng bộ chế độ;
// ?view= trên URL (bookmark, gửi link) luôn được ưu tiên hơn lựa chọn đã lưu.
export const VIEWS = [
  ["pagination", "Phân trang", "Chọn từng trang số"],
  ["more", "Load more", "Bấm “Xem thêm” để nối tiếp"],
  ["infinite", "Cuộn vô hạn", "Cuộn xuống là tự tải thêm"],
];
export const VIEW_MAC_DINH = "pagination";
export const MAX_TRANG_TICH_LUY = 30; // khôi phục nhiều nhất 30 trang (270 mục) khi mở lại URL ở chế độ nối trang
const hopLeView = (v) => VIEWS.some(([k]) => k === v);
export function layViewDaLuu() {
  try {
    const v = localStorage.getItem("ds-view");
    return hopLeView(v) ? v : VIEW_MAC_DINH;
  } catch (e) {
    return VIEW_MAC_DINH; // trình duyệt chặn storage
  }
}
export function luuView(v) {
  try {
    localStorage.setItem("ds-view", v);
  } catch (e) {
    /* bỏ qua */
  }
}
export const nhieuTrang = (S) => S.view !== "pagination"; // load more / infinite: danh sách tích lũy nhiều trang

// ---------- trạng thái <-> URL ----------
// S = { q, mode, by, dir, f: { tênBộLọc: giáTrị }, page, hasPage, sel, view }   (by = trường sắp xếp, dir = asc | desc)
const LEGACY_SORT = {
  name_asc: ["name", "asc"],
  name_desc: ["name", "desc"],
  price_asc: ["price", "asc"],
  price_desc: ["price", "desc"],
  newest: ["newest", "desc"],
  relevance: ["relevance", "desc"],
};
export function docTrang(resKey, query, opts) {
  const cfg = LIST[resKey];
  const v = query.get("view");
  const S = {
    q: (query.get("q") || "").trim(),
    mode: hopLeMode(query.get("mode")) ? query.get("mode") : MODE_MAC_DINH,
    by: BY_MAC_DINH,
    dir: DIR_MAC_DINH,
    f: {},
    page: 1,
    hasPage: query.has("page"),
    sel: null,
    view: hopLeView(v) ? v : layViewDaLuu(),
  };
  S.by = byMacDinh(S.q, S.mode);
  const hopBy = (k) => cfg.fields.some(([x]) => x === k);
  // link kiểu cũ ?sort=price_asc vẫn mở được
  const cu = LEGACY_SORT[query.get("sort")];
  if (cu && hopBy(cu[0])) [S.by, S.dir] = cu;
  if (hopBy(query.get("sortBy"))) S.by = query.get("sortBy");
  const dir = query.get("sortOrder");
  if (dir === "asc" || dir === "desc") S.dir = dir;
  if (S.by === "relevance" && !coLienQuan(S)) S.by = BY_MAC_DINH; // không có từ khóa / mode không có điểm thì không có độ liên quan
  for (const f of cfg.filters) {
    const v = (query.get(f.name) || "").trim();
    let ok = "";
    if (f.type === "select")
      ok = cacPair(f, opts).some(([k]) => k === v) ? v : "";
    else if (f.type === "number") ok = /^\d{1,12}$/.test(v) ? v : "";
    else ok = v.slice(0, 120);
    S.f[f.name] = ok;
  }
  S.page = Math.max(1, parseInt(query.get("page"), 10) || 1);
  S.sel = Number(query.get("sel")) > 0 ? Number(query.get("sel")) : null;
  return S;
}

// Trả chuỗi "?..." (luôn có dấu ?; chỉ ghi những giá trị khác mặc định để URL gọn)
// Ở chế độ load more / cuộn vô hạn, page = số trang đã tải (mở lại URL sẽ tải lại trang 1..page)
export function toSearch(resKey, S) {
  const cfg = LIST[resKey];
  const p = new URLSearchParams();
  if (S.q) p.set("q", S.q);
  if (S.mode !== MODE_MAC_DINH) p.set("mode", S.mode);
  if (S.by !== byMacDinh(S.q, S.mode)) p.set("sortBy", S.by);
  if (S.by !== "relevance" && S.dir !== DIR_MAC_DINH) p.set("sortOrder", S.dir);
  for (const f of cfg.filters) if (S.f[f.name]) p.set(f.name, S.f[f.name]);
  // chế độ mặc định chỉ được bỏ khỏi URL khi cũng là chế độ đang lưu, để link gửi cho người khác không bị đổi chế độ
  if (S.view !== VIEW_MAC_DINH || layViewDaLuu() !== VIEW_MAC_DINH)
    p.set("view", S.view);
  if (S.page > 1) p.set("page", S.page);
  if (S.sel) p.set("sel", S.sel);
  return "?" + p.toString();
}

// Tham số gửi lên API. focus: có ?sel mà không có ?page (bookmark) -> nhờ server tìm đúng trang chứa mục đó
export function apiQuery(resKey, S, { focus = false } = {}) {
  const o = { q: S.q, sortBy: S.by, ...S.f };
  if (S.by !== "relevance") o.sortOrder = S.dir;
  if (S.q) o.mode = S.mode;
  if (focus && S.sel) o.focus = S.sel;
  else o.page = S.page;
  return o;
}

export const coLoc = (S) => !!S.q || Object.values(S.f).some(Boolean);

// Lọc tức thì ở client (cùng luật với server: không phân biệt hoa/thường/dấu, khớp đầu/giữa/cuối)
export function matchRow(resKey, row, S) {
  // tạm thời chỉ khớp "chứa từ khóa"; món gõ sai chính tả chỉ server mới biết (kết quả server về sau sẽ thay thế)
  if (!khopTen(row.name, S.q)) return false;
  return LIST[resKey].filters.every(
    (f) => !S.f[f.name] || f.test(row, S.f[f.name]),
  );
}

// ---------- nhớ danh sách gần nhất ----------
export function nhoDanhSach() {
  try {
    sessionStorage.setItem(
      "ds:" + location.pathname,
      location.pathname + location.search,
    );
  } catch (e) {
    /* trình duyệt chặn storage: bỏ qua */
  }
}
// base: "/dishes" | "/admin/chefs"...   giu: có URL đã nhớ thì dùng nguyên (đúng trang, đúng bộ lọc, đúng mục đang mở)
//                                       sel: mở mục này (bỏ page để server tự tìm trang chứa mục đó)
export function quayLai(base, { sel = null, giu = false } = {}) {
  let saved = null;
  try {
    saved = sessionStorage.getItem("ds:" + base);
  } catch (e) {
    /* bỏ qua */
  }
  if (saved && giu) return saved;
  const u = new URL(saved || base, location.origin);
  if (sel) {
    u.searchParams.set("sel", sel);
    u.searchParams.delete("page");
  }
  return u.pathname + u.search;
}

// ---------- nhớ vị trí cuộn của danh sách ----------
// Lưu theo URL danh sách (bỏ ?sel vì mở/đóng khung chi tiết không đổi danh sách). Quay lại từ trang chi tiết / Back / F5
// thì cuộn về đúng chỗ. Chỉ khôi phục khi URL còn khớp: đổi từ khóa / bộ lọc / sắp xếp / trang thì URL khác nên không áp dụng.
const khoaCuon = () => {
  const u = new URL(location.href);
  u.searchParams.delete("sel");
  return "sc:" + u.pathname + u.search;
};
export function luuCuon(top) {
  try {
    sessionStorage.setItem(khoaCuon(), String(Math.max(0, Math.round(top))));
  } catch (e) {
    /* bỏ qua */
  }
}
export function layCuon() {
  try {
    const v = Number(sessionStorage.getItem(khoaCuon()));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}
