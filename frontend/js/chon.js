// Ô chọn (dropdown) tự vẽ, thay cho <select> của trình duyệt ở thanh sắp xếp / bộ lọc:
// mũi tên nằm vào trong ô (không sát lề) và danh sách xổ xuống có nền, bo góc, màu hợp giao diện.
// Có đủ bàn phím: Enter / Space / ↓ mở, ↑ ↓ Home End di chuyển, Enter chọn, Esc đóng.
//
//   htmlChon({ id, ten, gia, ds })      -> chuỗi HTML.  ds = [[giáTrị, nhãn, tắt?], ...]
//   ganChon(root, signal, onChange)     -> gắn sự kiện cho MỌI ô chọn trong root; onChange(ten, giáTrị)
//   datChon(root, ten, { gia, tat })    -> đổi giá trị (và các giá trị bị khóa) bằng code, KHÔNG gọi onChange
import { esc } from "./utils.js";

const MUI = `<svg class="chon-mui" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function htmlChon({ id, ten, gia, ds }) {
  const hien = ds.find(([k]) => k === gia) || ds[0];
  return `<div class="chon" data-chon="${esc(ten)}" data-gia="${esc(hien[0])}">
  <button type="button" class="chon-nut" id="${esc(id)}" aria-haspopup="listbox" aria-expanded="false"><span class="chon-ten">${esc(hien[1])}</span>${MUI}</button>
  <ul class="chon-ds" role="listbox" hidden>${ds
    .map(
      ([k, lb, tat]) =>
        `<li role="option" tabindex="-1" data-v="${esc(k)}" aria-selected="${k === hien[0]}"${tat ? ' aria-disabled="true"' : ""}>${esc(lb)}</li>`,
    )
    .join("")}</ul>
</div>`;
}

const dsOf = (c) => c.querySelector(".chon-ds");
const nutOf = (c) => c.querySelector(".chon-nut");
const mucDung = (c) => [...dsOf(c).children].filter((li) => li.getAttribute("aria-disabled") !== "true");

function dong(c, { focus = false } = {}) {
  if (dsOf(c).hidden) return;
  dsOf(c).hidden = true;
  c.classList.remove("mo", "len");
  nutOf(c).setAttribute("aria-expanded", "false");
  if (focus) nutOf(c).focus();
}
function mo(c) {
  document.querySelectorAll(".chon.mo").forEach((x) => x !== c && dong(x));
  const ds = dsOf(c);
  ds.hidden = false;
  c.classList.add("mo");
  nutOf(c).setAttribute("aria-expanded", "true");
  // gần mép dưới màn hình mà phía trên còn rộng hơn thì xổ lên
  c.classList.remove("len");
  const r = c.getBoundingClientRect();
  const cao = ds.offsetHeight;
  if (innerHeight - r.bottom < cao + 12 && r.top > innerHeight - r.bottom) c.classList.add("len");
  (ds.querySelector('[aria-selected="true"]') || mucDung(c)[0])?.focus({ preventScroll: false });
}

export function datChon(root, ten, { gia, tat } = {}) {
  const c = root.querySelector(`.chon[data-chon="${ten}"]`);
  if (!c) return;
  const lis = [...dsOf(c).children];
  if (tat)
    lis.forEach((li) =>
      tat.includes(li.dataset.v) ? li.setAttribute("aria-disabled", "true") : li.removeAttribute("aria-disabled"),
    );
  if (gia !== undefined) {
    const hit = lis.find((li) => li.dataset.v === gia) || lis[0];
    c.dataset.gia = hit.dataset.v;
    c.querySelector(".chon-ten").textContent = hit.textContent;
    lis.forEach((li) => li.setAttribute("aria-selected", String(li === hit)));
  }
}

export function ganChon(root, signal, onChange) {
  const chon = (c, li) => {
    if (li.getAttribute("aria-disabled") === "true") return;
    const v = li.dataset.v;
    const doi = c.dataset.gia !== v;
    datChon(root, c.dataset.chon, { gia: v });
    dong(c, { focus: true });
    if (doi) onChange(c.dataset.chon, v);
  };

  root.addEventListener(
    "click",
    (e) => {
      const nut = e.target.closest(".chon-nut");
      if (nut && root.contains(nut)) {
        const c = nut.closest(".chon");
        return dsOf(c).hidden ? mo(c) : dong(c);
      }
      const li = e.target.closest(".chon-ds li");
      if (li) chon(li.closest(".chon"), li);
    },
    { signal },
  );

  root.addEventListener(
    "keydown",
    (e) => {
      const c = e.target.closest(".chon");
      if (!c) return;
      const mu = dsOf(c);
      if (e.target.closest(".chon-nut")) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          if (mu.hidden) mo(c);
        }
        return;
      }
      const ds = mucDung(c);
      const i = ds.indexOf(e.target);
      const toi = (j) => (e.preventDefault(), ds[Math.max(0, Math.min(ds.length - 1, j))]?.focus());
      if (e.key === "ArrowDown") toi(i + 1);
      else if (e.key === "ArrowUp") toi(i - 1);
      else if (e.key === "Home") toi(0);
      else if (e.key === "End") toi(ds.length - 1);
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (i >= 0) chon(c, ds[i]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dong(c, { focus: true });
      } else if (e.key === "Tab") dong(c);
    },
    { signal },
  );

  // bấm ra ngoài thì đóng
  document.addEventListener(
    "pointerdown",
    (e) => document.querySelectorAll(".chon.mo").forEach((c) => !c.contains(e.target) && dong(c)),
    { signal },
  );
}
