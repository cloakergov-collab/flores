"use strict";

/**
 * Netlify Function: consulta o status de um pagamento PIX na BlackCat Pay.
 * Rota pública: GET /api/status?id=...  (via redirect no netlify.toml)
 */

const BASE_URL = process.env.BLACKCAT_BASE_URL || "https://api.blackcatpay.com.br/api";
const API_KEY = process.env.BLACKCAT_API_KEY || "";

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

  if (!API_KEY) {
    return json(200, { success: true, status: "pending", paid: false });
  }

  // ---------- MODO REAL (BlackCat Pay) ----------
  try {
    const r = await fetch(BASE_URL.replace(/\/$/, "") + "/sales/" + encodeURIComponent(id) + "/status", {
      headers: { "X-API-Key": API_KEY, "Accept": "application/json" }
    });
    const body = await r.json().catch(() => ({}));
    const status = (body && body.data && body.data.status) || "UNKNOWN";
    return json(200, { success: true, status: status, paid: status === "PAID" });
  } catch (e) {
    return json(502, { success: false, error: "Falha ao consultar pagamento." });
  }
};
