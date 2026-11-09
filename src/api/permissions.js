// ===== RBAC: bảng quyền role -> hành động =====
// Quyền theo VAI (viewer/editor/admin). Quyền theo THUỘC TÍNH (ABAC: chefId, status) nằm ở routes/api.js (canModifyDish).
const PERMISSIONS = {
  viewer: ["dish:read", "chef:read", "ingredient:read"],
  editor: [
    "dish:read", "dish:create", "dish:update",
    "chef:read", "ingredient:read",
  ],
  admin: [
    "dish:read", "dish:create", "dish:update", "dish:delete",
    "chef:read", "chef:create", "chef:update", "chef:delete",
    "ingredient:read", "ingredient:create", "ingredient:update", "ingredient:delete",
  ],
};

const can = (role, action) => !!role && (PERMISSIONS[role] || []).includes(action);

// resource ("dishes") + verb ("read") -> "dish:read"
const SINGULAR = { dishes: "dish", chefs: "chef", ingredients: "ingredient" };
const actionOf = (resourceKey, verb) => `${SINGULAR[resourceKey]}:${verb}`;

module.exports = { PERMISSIONS, can, actionOf };
