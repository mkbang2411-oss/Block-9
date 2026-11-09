// Màn hình lỗi dùng chung (404, 403, 500, mất kết nối)
import { esc } from "../utils.js";

export function errorView(status, message, thuLai = false) {
  const tieuDe = status ? String(status) : "Mất kết nối";
  return {
    title: tieuDe,
    am: "quan",
    html: `<main class="man trang cuon">
  <div class="thanh"><a class="nut nut-phu" href="/">Ra phố</a></div>
  <div class="hop hop-giua">
    <h2>${esc(tieuDe)}</h2>
    <p>${esc(message)}</p>
    <div class="nut-hang">
      ${thuLai ? `<button class="nut nut-phu" id="thu-lai">Thử lại</button>` : ""}
      <a class="nut" href="/khach">Về thực đơn</a>
    </div>
  </div>
</main>`,
    mount(root) {
      const b = root.querySelector("#thu-lai");
      if (b) b.onclick = () => location.reload();
    },
  };
}
