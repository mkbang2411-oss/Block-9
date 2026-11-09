// Danh sách dạng lưới + khung chi tiết bên phải. Dùng cho:
//   /dishes            khách xem và tìm món (chỉ đọc)
//   /admin/:resource   quản trị: thêm / sửa / xóa
// Dữ liệu: GET /api/<resource>?q=&sort=&<bộ lọc>&page=  ->  { data: [...], meta: { page, totalPages, total, sort } }
//
// Ai làm gì:
//   - SẮP XẾP + LỌC + PHÂN TRANG: BACKEND, chạy trên TOÀN BỘ dữ liệu rồi mới cắt trang (frontend chỉ gửi tham số).
//   - LỌC TỨC THÌ: gõ tới đâu CLIENT lọc ngay trên dữ liệu đang có (không chờ mạng, không phân biệt hoa/thường/dấu,
//     khớp chữ đầu / giữa / cuối); ~300ms sau khi ngừng gõ mới hỏi server để phủ toàn bộ dữ liệu và có đúng số trang.
//   - TRẠNG THÁI nằm hết trên URL (?q=&sort=&page=&sel=&view=...): F5, bookmark, gửi link, nút Back đều ra đúng màn hình.
//   - CHẾ ĐỘ HIỂN THỊ (view): phân trang / load more / cuộn vô hạn, đổi bằng dây kéo (js/day-keo.js). Cả ba gọi CÙNG API
//     với CÙNG sắp xếp + lọc; khác nhau chỉ ở client: phân trang thay danh sách, hai chế độ còn lại NỐI thêm trang vào cuối.
//     Ở hai chế độ nối trang, ?page=N nghĩa là "đã tải trang 1..N" nên F5 / bookmark / quay lại từ chi tiết ra đúng danh sách.
import { api, ApiError } from "../api.js";
import { getMe } from "../state.js";
import { duocThem, duocSua, duocXoa, lyDoKhongSua, lyDoKhongXoa } from "../quyen.js";
import { navigate } from "../router.js";
import { RES, adminTabs, giaDong } from "../resources.js";
import {
  $,
  $$,
  esc,
  bao,
  dishThumb,
  thanhTren,
  phanTrang,
  nhoAnhLoi,
} from "../utils.js";
import {
  LIST,
  DIRS,
  MODES,
  MODE_MAC_DINH,
  coLienQuan,
  BY_MAC_DINH,
  DIR_MAC_DINH,
  byMacDinh,
  cacPair,
  layOptions,
  docTrang,
  toSearch,
  apiQuery,
  matchRow,
  coLoc,
  nhoDanhSach,
  nhieuTrang,
  luuView,
  luuCuon,
  layCuon,
  MAX_TRANG_TICH_LUY,
} from "../list-config.js";
import { ganDayKeo, htmlCheDo } from "../day-keo.js";
import { htmlChon, ganChon, datChon } from "../chon.js";
import { htmlGia, ganGia } from "../gia-keo.js";

const the = (d) =>
  `<span class="the ${d.available ? "ok" : "het"}">${d.available ? "Còn bán" : "Hết món"}</span>`;
const dauBepStr = (c) =>
  c ? c.name + (c.specialty ? " (" + c.specialty + ")" : "") : "—";

// ---------- ô trên lưới ----------
function oCongKhai(d, i, href, chon) {
  return `<a class="o${chon ? " chon" : ""}" data-id="${esc(d.id)}" href="${esc(href)}" title="Bấm để xem chi tiết">
    <span class="bieu">${dishThumb(d, i < 6, i < 3)}</span>
    <b>${esc(d.name)}</b>
    <small>${giaDong(d.price)} · ${esc(d.category)}</small>
    <small>${d.chef ? "Đầu bếp " + esc(d.chef.name) : ""}</small>
    ${the(d)}
  </a>`;
}
function oQuanTri(r, row, i, href, chon) {
  // t.icon là HTML do resources.js dựng (emoji cố định hoặc dishThumb() - đã esc từng thuộc tính), nên KHÔNG esc lại ở đây
  const t = r.tile(row, i);
  return `<a class="o${chon ? " chon" : ""}" data-id="${esc(row.id)}" href="${esc(href)}" title="Bấm để xem chi tiết">
    <span class="bieu">${t.icon}</span><b>${esc(t.title)}</b><small>${esc(t.sub)}</small>
  </a>`;
}

// ---------- khung chi tiết ----------
function panelCongKhai(d, chon) {
  return `<section class="ct hop" data-id="${esc(d.id)}"${chon ? "" : " hidden"}>
    <button type="button" class="dong-ct" data-a="dong" aria-label="Đóng">×</button>
    <div class="ct-xem">
      <div class="ct-dau"><span class="bieu">${dishThumb(d)}</span><h2>${esc(d.name)}</h2></div>
      <dl class="ct-ds">
        <dt>Giá</dt><dd>${giaDong(d.price)}</dd>
        <dt>Mô tả</dt><dd>${esc(d.description || "—")}</dd>
        <dt>Danh mục</dt><dd>${esc(d.category || "—")}</dd>
        <dt>Tình trạng</dt><dd>${the(d)}</dd>
        <dt>Đầu bếp</dt><dd>${esc(dauBepStr(d.chef))}</dd>
      </dl>
      <div class="nut-hang ct-thao-tac"><a class="nut" href="/dishes/${esc(d.id)}">Trang chi tiết</a></div>
    </div>
  </section>`;
}
function panelQuanTri(env, row, chon) {
  const { r, me } = env;
  const t = r.tile(row);
  // F10: chỉ vẽ nút mà người này làm được (server vẫn kiểm lại). Không có nút nào thì nói rõ lý do thay vì để trống.
  const nutXoa = duocXoa(me)
    ? `<a class="nut nut-phu" href="/admin/${esc(r.key)}/${esc(row.id)}/delete">Xóa</a>`
    : "";
  const nutSua = duocSua(me, r.key, row)
    ? `<a class="nut" href="/admin/${esc(r.key)}/${esc(row.id)}/edit">Sửa</a>`
    : "";
  const lyDo = nutXoa || nutSua ? "" : lyDoKhongSua(me, r.key, row) || lyDoKhongXoa(me);
  return `<section class="ct hop" data-id="${esc(row.id)}"${chon ? "" : " hidden"}>
    <button type="button" class="dong-ct" data-a="dong" aria-label="Đóng">×</button>
    <div class="ct-xem">
      <div class="ct-dau"><span class="bieu">${t.icon}</span><h2>${esc(r.label(row))}</h2></div>
      <dl class="ct-ds">
        ${r.columns
          .slice(1)
          .map((c) => `<dt>${esc(c.label)}</dt><dd>${esc(c.value(row))}</dd>`)
          .join("")}
      </dl>
      ${nutXoa || nutSua ? `<div class="nut-hang ct-thao-tac">${nutXoa}${nutSua}</div>` : ""}
      ${lyDo ? `<p class="phu-chu-nho ct-khong-sua">${esc(lyDo)}</p>` : ""}
    </div>
  </section>`;
}

// ---------- thanh sắp xếp + bộ lọc ----------
// ô lọc: select -> ô chọn tự vẽ (js/chon.js, có mục "Tất cả"), text -> ô nhập
function oLoc(f, S, opts) {
  const id = "loc-" + f.name;
  const v = S.f[f.name];
  const ctl =
    f.type === "select"
      ? htmlChon({
          id,
          ten: f.name,
          gia: v,
          ds: [["", f.blank || "Tất cả"], ...cacPair(f, opts)],
        })
      : `<input id="${id}" data-loc="${f.name}" type="text" value="${esc(v)}" placeholder="${esc(f.placeholder || "")}" autocomplete="off">`;
  return `<div class="loc-o"><label for="${id}">${esc(f.label)}</label>${ctl}</div>`;
}
const nutThuTu = (S) =>
  DIRS.map(
    ([k, lb]) =>
      `<button type="button" class="doan-nut${S.dir === k && S.by !== "relevance" ? " on" : ""}" data-dir="${k}" aria-pressed="${S.dir === k && S.by !== "relevance"}"${S.by === "relevance" ? " disabled" : ""}>${lb}</button>`,
  ).join("");
// Kiểu tìm: 4 nút bấm (Thường / Nâng cao / Toàn văn / Gần đúng), cùng kiểu với nút A → Z / Z → A
const nutMode = (S) =>
  MODES.map(
    ([k, lb, goiY]) =>
      `<button type="button" class="doan-nut${S.mode === k ? " on" : ""}" data-mode="${k}" aria-pressed="${S.mode === k}" title="${esc(goiY)}">${lb}</button>`,
  ).join("");
// Sidebar giấy ghi món (mở bằng dây rèm, xem js/day-keo.js): sắp xếp + bộ lọc + khoảng giá + cách hiển thị danh sách.
// Các ô giữ nguyên id / data-* như trước nên logic lọc ở mount() không đổi, chỉ đổi chỗ hiển thị.
function benLoc(resKey, S, opts) {
  const cfg = LIST[resKey];
  // "Độ liên quan" chỉ chọn được khi đang có từ khóa
  const truong = cfg.fields.map(([k, lb]) => [
    k,
    lb,
    k === "relevance" && !coLienQuan(S),
  ]);
  const locs = cfg.filters.filter((f) => !f.an);
  const coLocMuc = locs.length > 0 || cfg.gia;
  return `<div class="ben-lop" data-ben-lop></div>
<aside class="ben" id="ben" aria-label="Sắp xếp, bộ lọc và cách hiển thị danh sách" inert>
  <span class="ben-bang" aria-hidden="true"></span>
  <header class="ben-dau">
    <div>
      <h3>Phiếu lọc</h3>
      <p>Ghi lại thứ bạn muốn tìm</p>
    </div>
    <button type="button" class="ben-dong" data-a="dong-ben" aria-label="Đóng bảng lọc">×</button>
  </header>
  <div class="ben-than">
    <section class="ben-muc">
      <h4><i>1</i>Kiểu tìm</h4>
      <div class="doan doan-luoi" role="group" aria-label="Kiểu tìm" data-mode-nhom>${nutMode(S)}</div>
      <p class="ben-goi-y" data-mode-goi-y>${esc(MODES.find(([k]) => k === S.mode)[2])}</p>
    </section>
    <section class="ben-muc">
      <h4><i>2</i>Sắp xếp</h4>
      <div class="ben-luoi">
        <div class="loc-o"><label for="loc-by">Sắp xếp theo</label>${htmlChon({ id: "loc-by", ten: "by", gia: S.by, ds: truong })}</div>
        <div class="loc-o"><span class="loc-nhan" id="loc-dir-nhan">Thứ tự</span><div class="doan" role="group" aria-labelledby="loc-dir-nhan" data-dir-nhom>${nutThuTu(S)}</div></div>
      </div>
    </section>
    ${
      coLocMuc
        ? `<section class="ben-muc">
      <h4><i>3</i>Bộ lọc</h4>
      ${locs.length ? `<div class="ben-luoi">${locs.map((f) => oLoc(f, S, opts)).join("")}</div>` : ""}
      ${cfg.gia ? htmlGia(S.f.minPrice, S.f.maxPrice) : ""}
    </section>`
        : ""
    }
    <section class="ben-muc">
      <h4><i>${coLocMuc ? 4 : 3}</i>Cách hiển thị danh sách</h4>
      ${htmlCheDo(S.view)}
    </section>
  </div>
  <footer class="ben-chan">
    <button type="button" class="nut nut-phu" data-a="xoa-loc"${coLoc(S) ? "" : " hidden"}>Xóa bộ lọc</button>
    <button type="button" class="nut" data-a="dong-ben">Xong</button>
  </footer>
</aside>`;
}

// ---------- vẽ lưới / khung chi tiết từ danh sách rows ----------
// env = { resKey, r, admin, action }
function htmlLuoi(env, S, rows, page, cho) {
  const { r, admin, action, resKey } = env;
  if (!rows.length) {
    const msg = cho
      ? "Đang tìm trên toàn bộ dữ liệu…"
      : admin
        ? coLoc(S)
          ? `Không có ${r.singular} nào khớp với bộ lọc.`
          : duocThem(env.me, resKey)
            ? `Chưa có ${r.singular} nào. Bấm “Thêm” để tạo mới.`
            : `Chưa có ${r.singular} nào.`
        : coLoc(S)
          ? "Không có món nào khớp với bộ lọc."
          : "Không có món nào.";
    return `<p class="trong-lop" data-vung="luoi">${esc(msg)}</p>`;
  }
  return `<div class="luoi${nhieuTrang(S) ? " nhieu" : ""}" data-vung="luoi">${htmlCacO(env, S, rows, page, 0)}</div>`;
}
// các ô của lưới; dau = vị trí của ô đầu tiên trong cả danh sách (để chỉ ưu tiên tải ảnh cho vài ô đầu)
function htmlCacO(env, S, rows, page, dau) {
  const { r, admin, action, resKey } = env;
  return rows
    .map((row, k) => {
      const i = dau + k;
      // href đầy đủ trạng thái: mở tab mới / sao chép link vẫn đúng trang + đúng món
      const href = action + toSearch(resKey, { ...S, page, sel: row.id });
      return admin
        ? oQuanTri(r, row, i, href, row.id === S.sel)
        : oCongKhai(row, i, href, row.id === S.sel);
    })
    .join("");
}
const htmlPanels = (env, S, rows) =>
  rows
    .map((row) =>
      env.admin
        ? panelQuanTri(env, row, row.id === S.sel)
        : panelCongKhai(row, row.id === S.sel),
    )
    .join("");
// Số kết quả + trang: 2 nút kính mờ ở góc phải dưới (đối xứng với nút loa ở góc trái), dùng chung cho khách và bếp
const htmlKetQua = (env, S, meta, soHien, cho) => {
  const nut = (t) => `<span class="nut-kq">${esc(t)}</span>`;
  if (cho) return nut("Đang lọc…");
  const dau = nut(`${meta.total} ${env.r.singular}`);
  if (nhieuTrang(S))
    return meta.total > soHien ? dau + nut(`đang hiển thị ${soHien}`) : dau;
  return meta.totalPages > 1
    ? dau + nut(`trang ${meta.page}/${meta.totalPages}`)
    : dau;
};

// Chân danh sách (tùy chế độ): thanh phân trang | nút "Xem thêm" | vùng canh (sentinel) của cuộn vô hạn
// st = { cho: đang chờ server (ẩn chân), dang: đang tải thêm, loi: lần tải thêm vừa lỗi, soHien: số mục đang có }
const COIO = typeof IntersectionObserver !== "undefined";
function htmlChan(env, S, meta, st) {
  const goi = (inner) =>
    `<div class="chan" data-vung="chan" data-view="${esc(S.view)}">${inner}</div>`;
  if (st.cho) return goi("");
  if (!nhieuTrang(S))
    return `<div class="chan" data-vung="chan" data-view="pagination">${phanTrang({ page: meta.page, totalPages: meta.totalPages, lk: st.lk })}</div>`;
  if (!st.soHien) return goi("");
  if (meta.page >= meta.totalPages)
    return goi(
      meta.totalPages > 1
        ? `<p class="chan-het">Đã hiển thị hết ${esc(meta.total)} ${esc(env.r.singular)}.</p>`
        : "",
    );
  if (st.loi)
    return goi(
      `<p class="chan-loi">Không tải được trang tiếp theo.</p><button type="button" class="nut" data-a="them">Thử lại</button>`,
    );
  if (st.dang)
    return goi(
      `<button type="button" class="nut" disabled aria-busy="true">Đang tải…</button>`,
    );
  const con = meta.total - st.soHien;
  if (S.view === "infinite" && COIO)
    return goi(
      `<div class="sentinel" data-sentinel aria-hidden="true"></div><p class="chan-goi-y">Cuộn xuống để xem thêm (còn ${con})</p>`,
    );
  return goi(
    `<button type="button" class="nut" data-a="them">Xem thêm (còn ${con})</button>`,
  );
}

// Tải danh sách theo chế độ hiện tại.
//   Phân trang: đúng 1 request (trang S.page).
//   Load more / cuộn vô hạn: S.page = số trang đã tải, nên tải trang 1..S.page rồi nối lại (tối đa MAX_TRANG_TICH_LUY).
//   focus: có ?sel mà không có ?page -> server trả trang chứa mục đó, rồi nối thêm các trang phía trước.
// Trả { data, meta }; meta là của trang CUỐI đã tải.
async function taiDanhSach(resKey, S, { focus = false, signal } = {}) {
  const opt = { signal };
  const hai = nhieuTrang(S);
  const hoi =
    hai && !focus ? { ...S, page: Math.min(S.page, MAX_TRANG_TICH_LUY) } : S;
  const dau = await api.list(resKey, apiQuery(resKey, hoi, { focus }), opt);
  // Server KHÔNG kẹp trang: page vượt tổng số trang -> items rỗng (ok:true). Đó là hành vi của API;
  // còn ở giao diện thì ta chủ động đưa người dùng về trang cuối thay vì hiện danh sách trống.
  const tp = dau.meta.totalPages;
  const veTrang = (r) => ({
    ...r,
    meta: { ...r.meta, page: Math.min(r.meta.page, r.meta.totalPages) },
  });
  if (!hai) {
    if (!dau.data.length && dau.meta.total > 0 && dau.meta.page > tp)
      return veTrang(
        await api.list(resKey, apiQuery(resKey, { ...S, page: tp }), opt),
      );
    return veTrang(dau);
  }
  const den = Math.min(dau.meta.page, tp, MAX_TRANG_TICH_LUY);
  if (den <= 1) return veTrang(dau);
  const cac = await Promise.all(
    Array.from({ length: den }, (_, i) =>
      i + 1 === dau.meta.page
        ? dau
        : api.list(resKey, apiQuery(resKey, { ...S, page: i + 1 }), opt),
    ),
  );
  const co = new Set();
  const data = [];
  for (const rs of cac)
    for (const x of rs.data) if (!co.has(x.id)) (co.add(x.id), data.push(x));
  return veTrang({ data, meta: cac[cac.length - 1].meta });
}

// admin = true: /admin/:resource ; false: /dishes
export async function load(ctx, resKey, admin) {
  const r = RES[resKey];
  const [opts, me] = await Promise.all([layOptions(), getMe()]);
  const role = me ? me.role : null; // thanhTren chỉ cần biết đã đăng nhập chưa
  // F10: nút "+ Thêm" chỉ hiện khi làm được; quyền thật do server quyết định
  const S = docTrang(resKey, ctx.query, opts);
  // có ?sel mà không có ?page (vào bằng bookmark): nhờ server trả đúng trang đang chứa món đó
  const res = await taiDanhSach(resKey, S, { focus: !!S.sel && !S.hasPage });
  S.page = res.meta.page;
  if (!res.data.some((x) => x.id === S.sel)) S.sel = null;

  const env = {
    resKey,
    r,
    admin,
    me,
    action: admin ? "/admin/" + resKey : "/dishes",
  };
  const thanh = admin
    ? thanhTren({
        tabs: adminTabs(resKey),
        themHref: duocThem(me, resKey) ? `/admin/${resKey}/new` : undefined,
        themLabel: "+ Thêm " + r.singular,
        role,
      })
    : thanhTren({ themHref: "/khach", themLabel: "Bàn chọn món", role });
  const placeholder = admin
    ? `Tìm tên ${r.singular} bạn nghĩ tới`
    : "Tìm tên món ăn bạn nghĩ tới";
  const lk = (extra) => toSearch(resKey, { ...S, ...extra, sel: null });

  return {
    title: admin ? "Quản trị " + r.title : "Danh sách món ăn",
    am: admin ? "bep" : "quan",
    html: `<div class="nen nen-kinh"></div><div class="mo"></div>
<main class="man bep ds cuon">
  ${thanh}
  <div class="chia${S.sel ? " co-chon" : ""}" id="chia">
    <div class="cot-luoi">
      <div class="dau-khach">
        ${admin ? "" : "<h2>Danh sách món ăn</h2>"}
        <form class="tim" data-tim>
          <input type="text" name="q" value="${esc(S.q)}" placeholder="${esc(placeholder)}" autocomplete="off" aria-label="Tìm theo tên">
        </form>
      </div>
      ${htmlLuoi(env, S, res.data, S.page, false)}
      ${htmlChan(env, S, res.meta, { lk, soHien: res.data.length })}
    </div>
    <aside class="chi-tiet" aria-label="Chi tiết">${htmlPanels(env, S, res.data)}</aside>
  </div>
</main>
<div class="goc-kq" id="kq" aria-live="polite">${htmlKetQua(env, S, res.meta, res.data.length, false)}</div>
${benLoc(resKey, S, opts)}`,
    mount: (root, c) => mount(root, c, env, S, res),
  };
}

function mount(root, ctx, env, S, first) {
  const { signal } = ctx;
  const { resKey, action } = env;
  const chia = $("#chia", root);
  const cot = $(".cot-luoi", root);
  const aside = $(".chi-tiet", root);
  const kq = $("#kq", root);
  const nutXoa = $('[data-a="xoa-loc"]', root);
  let rows = first.data;
  let meta = first.meta;
  let seq = 0; // số thứ tự lần tải mới (đổi từ khóa / bộ lọc / sắp xếp / chế độ / trang): kết quả của lần cũ bị bỏ
  let ac = null;
  let timer = null;
  let cho = false; // đang chờ server (chân danh sách tạm ẩn)
  let dangThem = false; // load more / cuộn vô hạn: đang tải trang kế (chặn gọi trùng)
  let loiThem = false;
  let acThem = null;
  let io = null; // IntersectionObserver của cuộn vô hạn
  nhoAnhLoi(root, signal);
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    if (ac) ac.abort();
    if (acThem) acThem.abort();
    if (io) io.disconnect();
  });

  // ghi trạng thái lên thanh địa chỉ (push: thêm vào lịch sử, dùng khi đổi trang; còn lại thay thế, không làm đầy nút Back)
  const ghiUrl = (push) => {
    const u = action + toSearch(resKey, S).replace(/^\?$/, "");
    if (u === location.pathname + location.search) return;
    if (push) history.pushState(null, "", u);
    else history.replaceState(null, "", u);
    nhoDanhSach();
  };
  const lk = (extra) => toSearch(resKey, { ...S, ...extra, sel: null });

  // ---------- chân danh sách + cuộn vô hạn ----------
  const chanHtml = () =>
    htmlChan(env, S, meta, {
      cho,
      lk,
      dang: dangThem,
      loi: loiThem,
      soHien: rows.length,
    });
  function chanLai() {
    $('[data-vung="chan"]', cot).outerHTML = chanHtml();
    quanSat();
  }
  // gần nhất có cuộn (để IntersectionObserver tính đúng khi trang cuộn bên trong một khung)
  function khungCuon(el) {
    for (
      let p = el.parentElement;
      p && p !== document.body;
      p = p.parentElement
    ) {
      const o = getComputedStyle(p).overflowY;
      if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight)
        return p;
    }
    return null;
  }
  // Vùng canh luôn được vẽ lại sau mỗi lần tải: nếu nó vẫn còn trong tầm nhìn (danh sách ngắn) thì lại tự tải tiếp.
  // taiThem() vẫn tự kiểm tra đang tải / đã hết, nên observer bắn dồn cũng không gọi trùng.
  function quanSat() {
    if (io) io.disconnect();
    io = null;
    const sentinel = $("[data-sentinel]", cot);
    if (!sentinel) return;
    io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && taiThem(),
      { root: khungCuon(sentinel), rootMargin: "0px 0px 320px 0px" },
    );
    io.observe(sentinel);
  }

  // cho = true: đang chờ server -> hiện tạm kết quả lọc tức thì từ dữ liệu đang có
  function ve(chua) {
    cho = chua;
    const hien = cho ? rows.filter((x) => matchRow(resKey, x, S)) : rows;
    const moSel = !!S.sel && hien.some((x) => x.id === S.sel);
    $('[data-vung="luoi"]', cot).outerHTML = htmlLuoi(
      env,
      S,
      hien,
      meta.page,
      cho,
    );
    aside.innerHTML = htmlPanels(env, S, hien);
    chia.classList.toggle("co-chon", moSel);
    cot.classList.toggle("dang-loc", cho);
    kq.innerHTML = htmlKetQua(env, S, meta, hien.length, cho);
    nutXoa.hidden = !coLoc(S);
    $('[data-vung="chan"]', cot).outerHTML = htmlChan(env, S, meta, {
      cho,
      lk,
      dang: dangThem,
      loi: loiThem,
      soHien: hien.length,
    });
    quanSat();
  }

  // hỏi server: sắp xếp + lọc + phân trang trên toàn bộ dữ liệu (làm lại từ đầu; ở chế độ nối trang là tải lại trang 1..S.page)
  async function tai({ push = false } = {}) {
    clearTimeout(timer);
    if (ac) ac.abort();
    if (acThem) acThem.abort();
    dangThem = false;
    loiThem = false;
    ac = new AbortController();
    const my = ++seq;
    ve(true);
    ghiUrl(push);
    try {
      const res = await taiDanhSach(resKey, S, { signal: ac.signal });
      if (my !== seq) return;
      rows = res.data;
      meta = res.meta;
      S.page = meta.page; // taiDanhSach đã đưa trang về khoảng hợp lệ (server không kẹp)
      if (!rows.some((x) => x.id === S.sel)) S.sel = null;
      ve(false);
      ghiUrl(false);
    } catch (e) {
      if ((e && e.name === "AbortError") || my !== seq) return;
      cot.classList.remove("dang-loc");
      // hết phiên / sai quyền: để router xử lý như khi mở trang
      if (
        e instanceof ApiError &&
        (e.code === "UNAUTHENTICATED" || e.code === "TOKEN_EXPIRED" || e.code === "FORBIDDEN")
      )
        return navigate(location.pathname + location.search, { replace: true });
      cho = false;
      kq.innerHTML = '<span class="nut-kq">Không tải được dữ liệu</span>';
      bao(e.message || "Có lỗi xảy ra, vui lòng thử lại.");
    }
  }

  // Load more / cuộn vô hạn: tải trang kế tiếp rồi NỐI vào cuối (không vẽ lại cả lưới, không nhảy vị trí cuộn)
  async function taiThem() {
    if (!nhieuTrang(S) || cho || dangThem || meta.page >= meta.totalPages)
      return;
    dangThem = true;
    loiThem = false;
    chanLai();
    const my = seq; // nếu trong lúc chờ người dùng đổi từ khóa / bộ lọc / sắp xếp thì my !== seq -> bỏ kết quả này
    acThem = new AbortController();
    try {
      const res = await api.list(
        resKey,
        apiQuery(resKey, { ...S, page: meta.page + 1 }),
        { signal: acThem.signal },
      );
      if (my !== seq) return;
      const co = new Set(rows.map((x) => x.id));
      const moi = res.data.filter((x) => !co.has(x.id)); // không bao giờ lặp mục giữa các lần tải
      const dau = rows.length;
      rows = rows.concat(moi);
      meta = res.meta;
      S.page = meta.page;
      $('[data-vung="luoi"]', cot).insertAdjacentHTML(
        "beforeend",
        htmlCacO(env, S, moi, meta.page, dau),
      );
      aside.insertAdjacentHTML("beforeend", htmlPanels(env, S, moi));
      kq.innerHTML = htmlKetQua(env, S, meta, rows.length, false);
      ghiUrl(false);
    } catch (e) {
      if ((e && e.name === "AbortError") || my !== seq) return;
      loiThem = true; // dừng tại đây, không tự thử lại (tránh vòng lặp khi server lỗi); người dùng bấm "Thử lại"
      bao(e.message || "Không tải được trang tiếp theo.");
    } finally {
      if (my === seq) {
        dangThem = false;
        chanLai();
      }
    }
  }

  // đổi chế độ hiển thị (từ dây kéo): giữ nguyên q / bộ lọc / sắp xếp, luôn bắt đầu lại từ trang 1 của tập kết quả
  function doiCheDo(v) {
    if (v === S.view) return;
    S.view = v;
    luuView(v);
    S.page = 1;
    S.sel = null;
    tai();
    $(".dau-khach", root).scrollIntoView({ block: "start" });
  }
  ganDayKeo({
    view: S.view,
    onChange: doiCheDo,
    signal,
    ben: $("#ben", root),
    lop: $("[data-ben-lop]", root),
  });

  ghiUrl(false); // chuẩn hóa URL (vd. ?sel=5 -> ?page=2&sel=5 sau khi server tìm trang)
  quanSat();

  // Vị trí cuộn (khung cuộn là <main class="cuon">):
  //   - URL có ?sel (mở chi tiết rồi quay lại / bookmark): cuộn tới ĐÚNG Ô món đang chọn. Không dùng scrollTop đã lưu vì mở khung
  //     chi tiết làm đổi bố cục lưới nên scrollTop không còn so sánh được.
  //   - Không có ?sel (F5 / Back khi không mở chi tiết): khôi phục scrollTop đã lưu cho đúng URL danh sách này.
  // Chỉ lưu scrollTop lúc KHÔNG mở khung chi tiết; lưu ngay khi bấm (URL còn là danh sách), không lưu lúc rời màn hình vì khi đó URL đã đổi.
  const khung = root.querySelector("main.cuon");
  if (khung) {
    const top = layCuon();
    requestAnimationFrame(() => {
      const o = S.sel ? $(".o.chon", cot) : null;
      if (o) o.scrollIntoView({ block: "center" });
      else if (top) khung.scrollTop = top;
    });
    let tCuon = null;
    khung.addEventListener(
      "scroll",
      () => {
        clearTimeout(tCuon);
        tCuon = setTimeout(() => !S.sel && luuCuon(khung.scrollTop), 120);
      },
      { signal, passive: true },
    );
    khung.addEventListener("click", () => !S.sel && luuCuon(khung.scrollTop), {
      signal,
      capture: true,
    });
    signal.addEventListener("abort", () => clearTimeout(tCuon));
  }

  // ---------- sắp xếp / lọc ----------
  // byTay: người dùng đã tự chọn trường sắp xếp (nếu chưa thì có từ khóa -> tự xếp theo độ liên quan, xóa từ khóa -> về theo tên)
  let byTay = ctx.query.has("sortBy") || ctx.query.has("sort");
  const cfg = LIST[resKey];
  const dongBoSapXep = () => {
    datChon(root, "by", { gia: S.by, tat: coLienQuan(S) ? [] : ["relevance"] });
    const nhom = $("[data-dir-nhom]", root);
    if (nhom) nhom.innerHTML = nutThuTu(S);
  };
  // sau khi đổi điều kiện: select / nút bấm -> hỏi server ngay; gõ chữ / kéo giá -> lọc tạm ngay rồi 300ms sau mới hỏi server
  const sauDoi = (ngay) => {
    S.page = 1;
    if (ngay) return tai();
    seq++; // kết quả của lần tải đang bay (nếu có) đã cũ
    ve(true); // hiện kết quả lọc ngay, không chờ mạng
    clearTimeout(timer);
    timer = setTimeout(() => tai(), 300);
  };
  const doiTuKhoa = (v) => {
    S.q = v;
    if (!byTay) S.by = byMacDinh(S.q, S.mode);
    else if (S.by === "relevance" && !coLienQuan(S)) S.by = BY_MAC_DINH;
    dongBoSapXep();
  };

  // hai vùng chứa ô nhập / nút lọc: ô tìm ở đầu danh sách, và sidebar giấy ghi món (bên trái)
  const vungLoc = [$(".dau-khach", root), $("#ben", root)];
  // ô tìm (tên món) + ô nhập chữ (tên đầu bếp, chuyên môn)
  const khiGo = (e) => {
    const el = e.target;
    if (el.name === "q") doiTuKhoa(el.value.trim());
    else if (el.dataset.loc) S.f[el.dataset.loc] = el.value.trim();
    else return;
    sauDoi(false);
  };
  // thứ tự A → Z / Z → A
  const khiBam = (e) => {
    const n = e.target.closest("[data-dir]");
    if (!n || n.disabled || S.dir === n.dataset.dir) return;
    S.dir = n.dataset.dir;
    dongBoSapXep();
    sauDoi(true);
  };
  // kiểu tìm: đổi mode -> bắt đầu lại từ trang 1 (không trộn kết quả hai kiểu tìm); chưa có từ khóa thì chỉ ghi nhớ lựa chọn
  const dongBoMode = () => {
    const nhom = $("[data-mode-nhom]", root);
    if (nhom) nhom.innerHTML = nutMode(S);
    const gy = $("[data-mode-goi-y]", root);
    if (gy) gy.textContent = MODES.find(([k]) => k === S.mode)[2];
  };
  const khiChonMode = (e) => {
    const n = e.target.closest("[data-mode]");
    if (!n || S.mode === n.dataset.mode) return;
    S.mode = n.dataset.mode;
    // mode không có điểm mà đang xếp theo độ liên quan -> về theo tên; chưa tự chọn sắp xếp thì lấy mặc định của mode mới
    if (!byTay) S.by = byMacDinh(S.q, S.mode);
    else if (S.by === "relevance" && !coLienQuan(S)) S.by = BY_MAC_DINH;
    dongBoMode();
    dongBoSapXep();
    S.page = 1;
    S.sel = null;
    if (S.q) tai();
    else ghiUrl(false);
  };
  vungLoc.forEach((v) => {
    v.addEventListener("input", khiGo, { signal });
    v.addEventListener("click", khiBam, { signal });
    v.addEventListener("click", khiChonMode, { signal });
  });
  // ô chọn tự vẽ: trường sắp xếp, danh mục, tình trạng, đơn vị
  ganChon(root, signal, (ten, v) => {
    if (ten === "by") {
      S.by = v;
      byTay = true;
      dongBoSapXep();
    } else S.f[ten] = v;
    sauDoi(true);
  });
  // thanh kéo khoảng giá
  const gia = ganGia(root, signal, ({ min, max }) => {
    S.f.minPrice = min;
    S.f.maxPrice = max;
    sauDoi(false);
  });

  $("[data-tim]", root).addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      tai();
    },
    { signal },
  );

  nutXoa.addEventListener(
    "click",
    () => {
      S.q = "";
      S.mode = MODE_MAC_DINH;
      S.by = BY_MAC_DINH;
      S.dir = DIR_MAC_DINH;
      byTay = false;
      Object.keys(S.f).forEach((k) => (S.f[k] = ""));
      S.page = 1;
      $('input[name="q"]', root).value = "";
      for (const f of cfg.filters) {
        if (f.an) continue;
        if (f.type === "select") datChon(root, f.name, { gia: "" });
        else {
          const i = $(`[data-loc="${f.name}"]`, root);
          if (i) i.value = "";
        }
      }
      gia.dat("", "");
      dongBoMode();
      dongBoSapXep();
      tai();
    },
    { signal },
  );

  chia.addEventListener(
    "click",
    (e) => {
      // đổi trang: không tải lại màn hình, không mất ô tìm / bộ lọc
      const pt = e.target.closest(".phan-trang a");
      if (pt && chia.contains(pt)) {
        e.preventDefault();
        S.page = Number(new URL(pt.href).searchParams.get("page")) || 1;
        S.sel = null;
        tai({ push: true });
        $(".dau-khach", root).scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
        return;
      }
      // nút "Xem thêm" / "Thử lại"
      if (e.target.closest('[data-a="them"]')) return taiThem();
      // bấm một ô -> mở khung chi tiết của ô đó (không đổi màn hình, URL ghi thêm sel)
      const o = e.target.closest(".o");
      if (o && chia.contains(o)) {
        e.preventDefault();
        const id = o.dataset.id;
        S.sel = Number(id);
        $$(".o", chia).forEach((x) => x.classList.toggle("chon", x === o));
        $$(".ct", chia).forEach((s) => (s.hidden = s.dataset.id !== id));
        chia.classList.add("co-chon");
        ghiUrl(false);
        return;
      }
      // nút đóng (×) của khung chi tiết
      if (e.target.closest('[data-a="dong"]')) {
        chia.classList.remove("co-chon");
        $$(".o.chon", chia).forEach((x) => x.classList.remove("chon"));
        // chờ khung thu lại xong mới ẩn nội dung cho mượt
        setTimeout(() => {
          if (chia.classList.contains("co-chon")) return;
          $$(".ct", chia).forEach((s) => (s.hidden = true));
        }, 600);
        S.sel = null;
        ghiUrl(false);
      }
    },
    { signal },
  );
}
