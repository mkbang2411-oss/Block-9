// ===== QUY ƯỚC TRẢ KẾT QUẢ CỦA /api (theo đề: REST API và SPA) =====
// Thành công          : HTTP 200  { ok:true,  data, meta? }        (xóa thành công: data = null)
// Lỗi NGHIỆP VỤ đã biết: HTTP 200  { ok:false, error:{ code, message, fields? } }
//                         NOT_FOUND, VALIDATION_FAILED (có fields theo từng ô nhập), ALREADY_EXISTS, RESOURCE_IN_USE...
// Lỗi KỸ THUẬT        : HTTP 4xx/5xx { error:{ code, message, requestId } }  -> KHÔNG có "ok", KHÔNG theo shape nghiệp vụ
//                         sai URL /api -> 404, body JSON hỏng -> 400, DB sập / lỗi server -> 500
// Frontend dựa vào error.code (không so sánh câu chữ trong message).

function ok(res, data, { meta } = {}) {
  const body = { ok: true, data };
  if (meta) body.meta = meta;
  return res.status(200).json(body);
}

function fail(res, { status, type, code, message, fields, extra, headers }) {
  if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (type === "business") {
    const error = { code, message };
    if (fields && Object.keys(fields).length) error.fields = fields;
    if (extra && Object.keys(extra).length) error.details = extra;
    return res.status(200).json({ ok: false, error });
  }
  const error = { code, message, requestId: res.req.requestId };
  if (extra && Object.keys(extra).length) error.details = extra;
  return res.status(status).json({ error });
}

module.exports = { ok, fail };
