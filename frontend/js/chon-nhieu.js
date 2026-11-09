// Bộ chọn NHIỀU nguyên liệu cho form món ăn:
//   - bấm 1 lần vào dòng = thêm vào món (dòng xanh lá + dấu tích), bấm lần 2 = bỏ chọn (không cần giữ Ctrl)
//   - ô tìm kiếm gần đúng (không phân biệt dấu / hoa thường, gõ sai chính tả vẫn ra), xếp kết quả khớp nhất lên đầu
//   - xóa ô tìm hoặc đổi từ khóa thì các nguyên liệu đã chọn vẫn được giữ; phía trên có "thẻ" các nguyên liệu đã chọn
//   - giá trị gửi đi nằm trong <input type="hidden" name="..."> dạng "id,id,id" (xem docForm ở pages/admin-form.js)
//
//   htmlNguyenLieu({ id, ten, ds, chon })  -> chuỗi HTML.  ds = [{ value, name, unit }], chon = [id, ...]
//   ganNguyenLieu(root, signal)            -> gắn sự kiện cho MỌI bộ chọn nguyên liệu trong root
import { esc } from "./utils.js";
import { boDau } from "./list-config.js";

const KINH_LUP = `<svg class="nl-lup" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export function htmlNguyenLieu({ id, ten, ds, chon = [] }) {
  const set = new Set(chon.map(String));
  const dong = ds
    .map(
      (x, i) =>
        `<li role="option" tabindex="-1" data-v="${esc(x.value)}" data-i="${i}" data-n="${esc(boDau(x.name))}" aria-selected="${set.has(x.value)}"><span class="nl-tick" aria-hidden="true"></span><span class="nl-ten">${esc(x.name)}</span><small class="nl-dv">${esc(x.unit)}</small></li>`,
    )
    .join("");
  return `<div class="nl" data-nl>
  <input type="hidden" name="${esc(ten)}" value="${esc([...set].join(","))}">
  <div class="nl-tim">${KINH_LUP}<input type="text" class="nl-q" id="${esc(id)}-q" placeholder="Tìm nguyên liệu…" autocomplete="off" aria-label="Tìm nguyên liệu"><button type="button" class="nl-xoa" aria-label="Xóa ô tìm kiếm" hidden>×</button></div>
  <div class="nl-tomtat"><span class="nl-dem"></span><button type="button" class="nl-bo" hidden>Bỏ chọn hết</button></div>
  <div class="nl-chips" hidden></div>
  <ul class="nl-ds" id="${esc(id)}" role="listbox" aria-multiselectable="true" aria-label="Danh sách nguyên liệu">${dong}</ul>
  <p class="nl-trong" hidden>Không có nguyên liệu nào khớp.</p>
</div>`;
}

// ---------- tìm gần đúng ----------
// khoảng cách sửa chữ (Levenshtein), dừng sớm khi vượt quá max
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let truoc = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let min = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        truoc[j] + 1,
        cur[j - 1] + 1,
        truoc[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur[j] = v;
      if (v < min) min = v;
    }
    if (min > max) return max + 1;
    truoc = cur;
  }
  return truoc[b.length];
}

// điểm của 1 từ khóa so với tên (đã bỏ dấu): 0 = không khớp
function diemTu(t, tuTen, ten) {
  if (tuTen.some((w) => w.startsWith(t))) return 4; // đầu từ: "ca" -> "cà chua"
  if (ten.includes(t)) return 3; // nằm trong tên
  if (ten.replace(/ /g, "").includes(t)) return 2.8; // gõ dính / thiếu dấu cách: "banhtrang"
  const cho = t.length <= 2 ? 0 : t.length <= 5 ? 1 : 2; // số lỗi chính tả cho phép theo độ dài từ
  if (!cho) return 0;
  let tot = cho + 1;
  for (const w of tuTen)
    tot = Math.min(tot, lev(t, w, cho), lev(t, w.slice(0, t.length), cho)); // gõ sai, hoặc gõ dở mà sai
  return tot <= cho ? 2 - tot * 0.4 : 0;
}

// nhiều từ khóa: tên phải khớp đủ (mỗi từ chứa / gần đúng); tên bắt đầu bằng từ đầu thì được cộng điểm
function cham(tu, ten) {
  const tuTen = ten.split(/[^a-z0-9]+/).filter(Boolean);
  let tong = 0;
  for (const t of tu) {
    const d = diemTu(t, tuTen, ten);
    if (!d) return 0;
    tong += d;
  }
  return ten.startsWith(tu[0]) ? tong + 1 : tong;
}

// ---------- gắn sự kiện ----------
export function ganNguyenLieu(root, signal) {
  root.querySelectorAll("[data-nl]").forEach((nl) => {
    const an = nl.querySelector('input[type="hidden"]');
    const q = nl.querySelector(".nl-q");
    const xoa = nl.querySelector(".nl-xoa");
    const ul = nl.querySelector(".nl-ds");
    const trong = nl.querySelector(".nl-trong");
    const chips = nl.querySelector(".nl-chips");
    const dem = nl.querySelector(".nl-dem");
    const bo = nl.querySelector(".nl-bo");
    const lis = [...ul.children];
    const theoId = new Map(lis.map((li) => [li.dataset.v, li]));
    // id đã chọn (giữ thứ tự bấm); bỏ id không còn trong danh sách
    const chon = new Set(
      (an.value ? an.value.split(",") : []).filter((v) => theoId.has(v)),
    );

    const capNhat = () => {
      an.value = [...chon].join(",");
      lis.forEach((li) =>
        li.setAttribute("aria-selected", String(chon.has(li.dataset.v))),
      );
      dem.textContent = chon.size
        ? `Đã chọn ${chon.size} nguyên liệu`
        : "Chưa chọn nguyên liệu nào";
      dem.classList.toggle("co", chon.size > 0);
      bo.hidden = chips.hidden = !chon.size;
      chips.innerHTML = [...chon]
        .map(
          (v) =>
            `<button type="button" class="nl-chip" data-v="${esc(v)}" title="Bấm để bỏ chọn">${esc(theoId.get(v).querySelector(".nl-ten").textContent)}<span aria-hidden="true">×</span></button>`,
        )
        .join("");
    };

    const bat = (v) => {
      chon.has(v) ? chon.delete(v) : chon.add(v);
      capNhat();
    };

    // lọc + xếp theo độ khớp; không có từ khóa thì về thứ tự gốc. Danh sách đã chọn KHÔNG bị đụng tới.
    const loc = () => {
      const tu = boDau(q.value).split(" ").filter(Boolean);
      xoa.hidden = !q.value;
      const diem = lis.map((li) => [
        li,
        tu.length ? cham(tu, li.dataset.n) : 1,
      ]);
      const thay = diem
        .filter(([, d]) => d > 0)
        .sort(
          (a, b) =>
            (tu.length ? b[1] - a[1] : 0) || a[0].dataset.i - b[0].dataset.i,
        );
      const kin = diem.filter(([, d]) => d <= 0);
      thay.forEach(([li]) => (li.hidden = false));
      kin.forEach(([li]) => (li.hidden = true));
      ul.append(...thay.map(([li]) => li), ...kin.map(([li]) => li));
      ul.hidden = !thay.length;
      trong.hidden = thay.length > 0;
      ul.scrollTop = 0;
    };

    nl.addEventListener("input", (e) => e.target === q && loc(), { signal });

    nl.addEventListener(
      "click",
      (e) => {
        const li = e.target.closest(".nl-ds li");
        if (li) return bat(li.dataset.v);
        const chip = e.target.closest(".nl-chip");
        if (chip) {
          chon.delete(chip.dataset.v);
          return capNhat();
        }
        if (e.target.closest(".nl-xoa")) {
          q.value = "";
          loc();
          return q.focus();
        }
        if (e.target.closest(".nl-bo")) {
          chon.clear();
          capNhat();
        }
      },
      { signal },
    );

    nl.addEventListener(
      "keydown",
      (e) => {
        const hien = () => lis.filter((li) => !li.hidden);
        if (e.target === q) {
          // Enter ở ô tìm KHÔNG được gửi cả form
          if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            hien()[0]?.focus();
          } else if (e.key === "Escape" && q.value) {
            e.preventDefault();
            e.stopPropagation();
            q.value = "";
            loc();
          }
          return;
        }
        const li = e.target.closest?.(".nl-ds li");
        if (!li) return;
        const ds = hien();
        const i = ds.indexOf(li);
        const toi = (j) => (
          e.preventDefault(),
          ds[Math.max(0, Math.min(ds.length - 1, j))]?.focus()
        );
        if (e.key === "ArrowDown") toi(i + 1);
        else if (e.key === "ArrowUp")
          i <= 0 ? (e.preventDefault(), q.focus()) : toi(i - 1);
        else if (e.key === "Home") toi(0);
        else if (e.key === "End") toi(ds.length - 1);
        else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          bat(li.dataset.v);
        }
      },
      { signal },
    );

    capNhat();
  });
}
