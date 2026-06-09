"use strict";

/**
 * Netlify Function: consulta o status de um pagamento PIX.
 * Rota pública: GET /api/status?id=...  (via redirect no netlify.toml)
 */

const BASE_URL = process.env.ASSETPAY_BASE_URL || "https://api.assetpay.com.br/api/v1";
const SECRET_KEY = process.env.ASSETPAY_SECRET_KEY || "";
const PUBLIC_KEY = process.env.ASSETPAY_PUBLIC_KEY || "";

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(obj)
  };
}

exports.handler = async (event) => {
  const id = (event.queryStringParameters || {}).id;
  if (!id) return json(400, { success: false, error: "id ausente." });

  // ---------- MODO DEMO (paidAt codificado no próprio id) ----------
  if (id.startsWith("DEMO")) {
    const part = id.slice(4).split("X")[0];
    const paidAt = parseInt(part, 36);
    const paid = !isNaN(paidAt) && Date.now() >= paidAt;
    return json(200, { success: true, demo: true, status: paid ? "paid" : "pending", paid: paid });
  }

  if (!SECRET_KEY || !PUBLIC_KEY) {
    return json(200, { success: true, status: "pending", paid: false });
  }

  // ---------- MODO REAL ----------
  try {
    const auth = Buffer.from(SECRET_KEY + ":" + PUBLIC_KEY).toString("base64");
    const r = await fetch(BASE_URL.replace(/\/$/, "") + "/transactions/" + encodeURIComponent(id), {
      headers: { "Authorization": "Basic " + auth, "Accept": "application/json" }
    });
    const body = await r.json().catch(() => ({}));
    const status = (body && body.status) || "unknown";
    return json(200, { success: true, status: status, paid: status === "paid" });
  } catch (e) {
    return json(502, { success: false, error: "Falha ao consultar pagamento." });
  }
};
