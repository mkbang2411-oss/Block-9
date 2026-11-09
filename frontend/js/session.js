// Phiên đăng nhập phía trình duyệt (F2). File này KHÔNG import file nào khác để api.js và state.js cùng dùng được
// mà không bị import vòng.
//  - accessToken: localStorage (mọi lời gọi đều bọc try/catch vì có thể bị chặn: chế độ riêng tư, hết dung lượng...).
//    Nếu localStorage không dùng được thì token chỉ sống trong bộ nhớ của tab (F5 là mất, phải đăng nhập lại).
//    Rủi ro: có lỗ hổng XSS thì script lạ đọc được token -> mọi dữ liệu người dùng khi render innerHTML phải qua esc().
//  - challenge MFA: CHỈ trong bộ nhớ (không bao giờ ghi localStorage); F5 ở trang /mfa là phải đăng nhập lại.
//  - me / notice: bộ nhớ.
const KEY = "cqa-token";

let memToken = null; // dự phòng khi localStorage hỏng
let me = null;
let meToken = null; // token mà `me` được lấy bằng; token đổi thì `me` cũ không còn đúng
let notice = null;
let challenge = null;

export function getToken() {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v;
  } catch (e) {
    /* localStorage bị chặn: dùng bản trong bộ nhớ */
  }
  return memToken;
}

function luuToken(t) {
  memToken = t || null;
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch (e) {
    /* bỏ qua: vẫn còn memToken */
  }
}

// data của /auth/login (không MFA), /auth/mfa/verify, /mfa/enable, /mfa/disable: { accessToken, user, ... }
export function setSession({ accessToken, user } = {}) {
  luuToken(accessToken);
  me = user || null;
  meToken = accessToken || null;
  challenge = null;
}

// enable / disable MFA tăng tokenVersion nên server trả token mới: thay token mà không mất `me`
export function replaceToken(accessToken, user) {
  luuToken(accessToken);
  meToken = accessToken;
  if (user) me = user;
}

export function clearSession() {
  luuToken(null);
  me = null;
  meToken = null;
  challenge = null;
}

export const cachedMe = () => (me && meToken === getToken() ? me : null);
export function setMe(u) {
  me = u;
  meToken = getToken();
}

// thông báo "phiên hết hạn..." để trang đăng nhập hiện đúng một lần
export const setNotice = (m) => (notice = m);
export function takeNotice() {
  const n = notice;
  notice = null;
  return n;
}

export const setChallenge = (c) => (challenge = c || null);
export const getChallenge = () => challenge;
export const clearChallenge = () => (challenge = null);
