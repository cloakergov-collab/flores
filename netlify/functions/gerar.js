"use strict";

/**
 * Netlify Function: cria uma venda PIX na BlackCat Pay.
 * Rota pública: POST /api/gerar  (via redirect no netlify.toml)
 *
 * A API Key fica só nas variáveis de ambiente do Netlify
 * (Site settings -> Environment variables). Sem chave -> MODO DEMO.
 */

const crypto = require("crypto");

const BASE_URL = process.env.BLACKCAT_BASE_URL || "https://api.blackcatpay.com.br/api";
const API_KEY = process.env.BLACKCAT_API_KEY || "";
const PIX_EXPIRES_DAYS = Number(process.env.PIX_EXPIRES_DAYS || 1);
const POSTBACK_URL = process.env.POSTBACK_URL || "";
const DEMO_MODE = !API_KEY;

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(obj)
  };
}
function reaisToCents(v) { return Math.round(Number(v) * 100); }
function onlyDigits(s) { return String(s || "").replace(/\D/g, ""); }

// CRC16-CCITT para um payload PIX "copia e cola" válido (modo demo).
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function buildDemoPixCode(amount, txid) {
  function f(id, value) { return id + String(value.length).padStart(2, "0") + value; }
  const gui = f("00", "br.gov.bcb.pix") + f("01", "demo@flores-namorados.com");
  const payload =
    f("00", "01") + f("26", gui) + f("52", "0000") + f("53", "986") +
    f("54", amount.toFixed(2)) + f("58", "BR") + f("59", "PARAISO DAS FLORES") +
    f("60", "SAO PAULO") + f("62", f("05", txid.slice(0, 25))) + "6304";
  return payload + crc16(payload);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { success: false, error: "Method Not Allowed" });

  let input;
  try { input = JSON.parse(event.body || "{}"); }
  catch (e) { return json(400, { success: false, error: "JSON inválido" }); }

  const valor = Number(input.valor);
  if (!valor || valor <= 0) return json(400, { success: false, error: "Valor inválido." });

  const cust = input.customer || {};

  // ---------- MODO DEMO (stateless: paidAt vai codificado no id) ----------
  if (DEMO_MODE) {
    const paidAt = Date.now() + 18000; // confirma sozinho ~18s depois
    const id = "DEMO" + paidAt.toString(36).toUpperCase() + "X" +
      crypto.randomBytes(3).toString("hex").toUpperCase();
    const pixCode = buildDemoPixCode(valor, id);
    return json(200, {
      success: true,
      demo: true,
      transactionId: id,
      pixCode: pixCode,
      qrcodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" +
        encodeURIComponent(pixCode),
      expiresAt: new Date(Date.now() + PIX_EXPIRES_DAYS * 86400000).toISOString()
    });
  }

  // ---------- MODO REAL (BlackCat Pay) — sem dados do pedido ----------
  const cpf = onlyDigits(cust.cpf);
  const phone = onlyDigits(cust.phone);
  const payload = {
    amount: reaisToCents(valor),
    currency: "BRL",
    paymentMethod: "PIX",
    items: [{ title: "Pagamento PIX", unitPrice: reaisToCents(valor), quantity: 1, tangible: false }],
    customer: {
      name: cust.name || "Cliente",
      email: cust.email || ((cpf || "cliente") + "@flores-namorados.com"),
      phone: phone || "11999999999",
      document: { type: "cpf", number: cpf || "00000000000" }
    },
    pix: { expiresInDays: PIX_EXPIRES_DAYS },
    externalRef: input.externalRef || ("PEDIDO-" + Date.now())
  };
  const postback = input.postbackUrl || POSTBACK_URL;
  if (postback) payload.postbackUrl = postback;

  try {
    const r = await fetch(BASE_URL.replace(/\/$/, "") + "/sales/create-sale", {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await r.json().catch(() => ({}));
    const d = body && body.data;
    if ((r.status === 201 || r.status === 200) && body && body.success && d && d.paymentData) {
      const pd = d.paymentData;
      const pixCode = pd.copyPaste || pd.qrCode;
      return json(200, {
        success: true,
        transactionId: d.transactionId,
        pixCode: pixCode,
        qrcodeUrl: pd.qrCodeBase64 ||
          ("https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + encodeURIComponent(pixCode || "")),
        expiresAt: pd.expiresAt || null
      });
    }
    console.error("[BlackCat] create-sale status", r.status, JSON.stringify(body));
    return json(200, { success: false, error: (body && (body.message || body.error)) || "Não foi possível gerar o PIX." });
  } catch (e) {
    console.error("[BlackCat] erro de conexão:", e.message);
    return json(502, { success: false, error: "Falha ao contatar o provedor de pagamento." });
  }
};
