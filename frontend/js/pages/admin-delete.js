// Trang xác nhận xóa. Bấm "Xóa luôn" mới gọi DELETE /api/<resource>/:id
//   { ok:true, data:null } = đã xóa | RESOURCE_IN_USE = không được xóa (vd. đầu bếp còn phụ trách món), message do backend viết sẵn
import { api, ApiError } from "../api.js";
import { navigate } from "../router.js";
import { RES, adminTabs } from "../resources.js";
import { getMe } from "../state.js";
import { lyDoKhongXoa } from "../quyen.js";
import { errorView } from "./error.js";
import { $, esc, thanhTren } from "../utils.js";
import { quayLai } from "../list-config.js";

export async function load(ctx, resKey) {
  const r = RES[resKey];
  const id = ctx.params.id;
  // F10: chỉ admin được xóa. Chặn từ đầu để editor / viewer gõ thẳng URL không thấy câu hỏi xóa (server vẫn trả 403 nếu cố gửi)
  const me = await getMe();
  const chan = lyDoKhongXoa(me);
  if (chan) return errorView(403, chan);
  const record = await api.get(resKey, id); // NOT_FOUND nếu không có -> màn hình "không tìm thấy"
  // Không xóa / Quay lại: về danh sách cũ (giữ sắp xếp, bộ lọc) và mở lại mục này
  const veDs = quayLai("/admin/" + resKey, { sel: record.id });
  return {
    title: "Xóa " + r.singular,
    am: "bep",
    html: `<div class="nen"></div><div class="mo"></div>
<main class="man bep cuon">
  ${thanhTren({ tabs: adminTabs(resKey), role: me.role })}
  <div class="hop hop-giua rong" id="khung">
    <h2>Xác nhận xóa ${esc(r.singular)}</h2>
    <div class="bao-loi" id="loi" hidden></div>
    <div id="hoi">
      <p>Bạn có chắc chắn muốn xóa ${esc(r.singular)} <b>${esc(r.label(record))}</b> không?</p>
      <p class="phu-chu-nho">Hành động này không thể hoàn tác.</p>
      <div class="nut-hang">
        <a class="nut nut-phu" href="${esc(veDs)}">Không xóa</a>
        <button class="nut" id="xoa">Xóa luôn</button>
      </div>
    </div>
    <div class="nut-hang" id="quay" hidden><a class="nut" href="${esc(veDs)}">Quay lại</a></div>
  </div>
</main>`,
    mount(root, c) {
      const nut = $("#xoa", root),
        loi = $("#loi", root);
      nut.addEventListener(
        "click",
        async () => {
          nut.disabled = true;
          loi.hidden = true;
          try {
            await api.remove(resKey, id);
            navigate(quayLai("/admin/" + resKey, { giu: true }), { flash: "Xóa thành công." });
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            if (err.status === 401) // api.js đã xóa token; về đăng nhập rồi quay lại trang này
                return navigate("/login?next=" + encodeURIComponent(location.pathname + location.search));
            if (err.code === "NOT_FOUND")
              return navigate(quayLai("/admin/" + resKey, { giu: true }), {
                flash: "Mục này đã bị xóa trước đó.",
              });
            loi.textContent = err.message;
            loi.hidden = false;
            if (err.code === "RESOURCE_IN_USE") {
              // bị chặn xóa: bỏ câu hỏi và nút xóa, chỉ còn nút quay lại
              $("#hoi", root).hidden = true;
              $("#quay", root).hidden = false;
            } else nut.disabled = false;
          }
        },
        { signal: c.signal },
      );
    },
  };
}
