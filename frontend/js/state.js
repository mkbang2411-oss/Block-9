// Trạng thái dùng chung giữa các màn hình (F2).
// getMe() thay cho getRole() cũ: trả { id, name, email, role, chefId, mfaEnabled, avatarUrl } hoặc null (chưa đăng nhập).
// Chỉ là bản sao để vẽ giao diện: quyền thật luôn do server quyết định theo token (RBAC/ABAC).
// Vai đang chọn ở trang phố (Khách / Đầu bếp) chỉ là lựa chọn giao diện, KHÔNG gửi lên server.
import { api } from "./api.js";
import { cachedMe, clearSession, getToken, setMe } from "./session.js";

export {
  getToken, setSession, replaceToken, clearSession, takeNotice, setNotice,
  setChallenge, getChallenge, clearChallenge,
} from "./session.js";

let dangHoi = null; // gộp nhiều lời gọi /auth/me đồng thời thành một

export async function getMe() {
  if (!getToken()) return null;
  const c = cachedMe();
  if (c) return c;
  if (!dangHoi) {
    dangHoi = api.auth
      .me()
      .then((u) => (setMe(u), u))
      .catch((e) => {
        // 401: api.js đã xóa token -> coi như chưa đăng nhập (trang công khai vẫn dùng được).
        // Mất mạng / 500: ném tiếp, KHÔNG đăng xuất.
        if (e && e.status === 401) return null;
        throw e;
      })
      .finally(() => (dangHoi = null));
  }
  return dangHoi;
}

// tương thích các trang chưa sửa (listing, dish-detail): chỉ cần biết "đã đăng nhập chưa" và role
export async function getRole() {
  const m = await getMe();
  return m ? m.role : null;
}

// nơi đến mặc định sau khi đăng nhập: viewer xem thực đơn; editor / admin vào khu quản trị
export const dichMacDinh = (me) => (me && me.role === "viewer" ? "/khach" : "/admin/dishes");

export async function dangXuat() {
  try {
    await api.auth.logout(); // server chỉ trả ok; token do client xóa
  } catch (e) {
    /* mất mạng vẫn đăng xuất phía client */
  }
  clearSession();
}
