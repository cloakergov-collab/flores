"use strict";

/**
 * Servidor do mirror "Paraíso das Flores" + proxy de pagamento PIX (BlackCat Pay).
 *
 * - Serve os arquivos estáticos da pasta ./site
 * - Expõe /api/gerar  (POST) -> cria uma venda PIX na BlackCat
 * - Expõe /api/status (GET)  -> consulta o status da transação na BlackCat
 *
 * A API Key NUNCA vai para o navegador: ela fica só aqui no servidor.
 * Sem chave configurada, roda em MODO DEMO (gera um PIX fake que "paga"
 * sozinho após alguns segundos) para você testar o fluxo visual.
 *
 * Configuração (variáveis de ambiente):
 *   BLACKCAT_API_KEY      chave da API (header X-API-Key)
 *   BLACKCAT_BASE_URL     opcional (default: https://api.blackcatpay.com.br/api)
 *   POSTBACK_URL          opcional (webhook de mudança de status)
 *   PORT                  opcional (default: 8099)
 *   PIX_EXPIRES_DAYS      opcional (default: 1)
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

// Carrega variáveis de um arquivo .env (parser nativo, sem dependências).
// Não sobrescreve variáveis já definidas no ambiente.
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, ".env");
    const raw = fs.readFileSync(envPath, "utf-8");
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return; // ignora comentários e linhas vazias
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    });
  } catch (e) { /* sem .env: segue só com o ambiente */ }
})();

const PORT = Number(process.env.PORT || 8099);
const SITE_DIR = path.join(__dirname, "site");
const BASE_URL = process.env.BLACKCAT_BASE_URL || "https://api.blackcatpay.com.br/api";
const API_KEY = process.env.BLACKCAT_API_KEY || "";
const PIX_EXPIRES_DAYS = Number(process.env.PIX_EXPIRES_DAYS || 1);
const POSTBACK_URL = process.env.POSTBACK_URL || "";
const DEMO_MODE = !API_KEY;

// Armazena transações do modo demo em memória (id -> { paidAt, amount })
const demoTx = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) return reject(new Error("payload muito grande"));
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error("JSON inválido")); }
    });
    req.on("error", reject);
  });
}

// Faz a chamada HTTPS à BlackCat Pay com header X-API-Key.
function blackcatRequest(method, endpoint, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL.replace(/\/$/, "") + endpoint);
    const body = payload ? JSON.stringify(payload) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        "X-API-Key": API_KEY,
        "Accept": "application/json"
      }
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(body);
    }
    const r = https.request(opts, (resp) => {
      let chunks = "";
      resp.on("data", (c) => (chunks += c));
      resp.on("end", () => {
        let json = null;
        try { json = chunks ? JSON.parse(chunks) : {}; } catch (e) { json = { raw: chunks }; }
        resolve({ status: resp.statusCode, body: json });
      });
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

// Calcula um CRC16-CCITT (necessário para um payload PIX "copia e cola" válido).
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

// Gera um payload PIX EMV de demonstração (estrutura real, chave fictícia).
function buildDemoPixCode(amount, txid) {
  function f(id, value) { return id + String(value.length).padStart(2, "0") + value; }
  const gui = f("00", "br.gov.bcb.pix") + f("01", "demo@flores-namorados.com");
  const mai = f("00", "br.gov.bcb.pix");
  const payload =
    f("00", "01") +
    f("26", gui) +
    f("52", "0000") +
    f("53", "986") +
    f("54", amount.toFixed(2)) +
    f("58", "BR") +
    f("59", "PARAISO DAS FLORES") +
    f("60", "SAO PAULO") +
    f("62", f("05", txid.slice(0, 25))) +
    "6304";
  return payload + crc16(payload);
}

function reaisToCents(v) { return Math.round(Number(v) * 100); }

function onlyDigits(s) { return String(s || "").replace(/\D/g, ""); }

// ---------------------------------------------------------------------------
// Endpoints da API
// ---------------------------------------------------------------------------

async function handleGerar(req, res) {
  let input;
  try { input = await readBody(req); }
  catch (e) { return sendJson(res, 400, { success: false, error: e.message }); }

  const valor = Number(input.valor);
  if (!valor || valor <= 0) {
    return sendJson(res, 400, { success: false, error: "Valor inválido." });
  }

  const cust = input.customer || {};

  // ---------- MODO DEMO ----------
  if (DEMO_MODE) {
    const id = "DEMO" + crypto.randomBytes(5).toString("hex").toUpperCase();
    const pixCode = buildDemoPixCode(valor, id);
    // paga sozinho ~18s depois, simulando a confirmação do banco
    demoTx.set(id, { paidAt: Date.now() + 18000, amount: valor });
    return sendJson(res, 200, {
      success: true,
      demo: true,
      transactionId: id,
      pixCode: pixCode,
      qrcodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" +
        encodeURIComponent(pixCode),
      expiresAt: new Date(Date.now() + PIX_EXPIRES_DAYS * 86400000).toISOString()
    });
  }

  // ---------- MODO REAL (BlackCat Pay) ----------
  const cpf = onlyDigits(cust.cpf);
  const phone = onlyDigits(cust.phone);
  const payload = {
    amount: reaisToCents(valor),
    currency: "BRL",
    paymentMethod: "PIX",
    // Na cobrança o item aparece sempre como "Pagamento PIX" (valor total).
    // Nenhuma informação do pedido vai para o provedor: sem endereço/produtos.
    items: [{
      title: "Pagamento PIX",
      unitPrice: reaisToCents(valor),
      quantity: 1,
      tangible: false
    }],
    customer: {
      name: cust.name || "Cliente",
      email: cust.email || ((cpf || "cliente") + "@flores-namorados.com"),
      phone: phone || "11999999999",
      document: { type: "cpf", number: cpf || "00000000000" }
    },
    pix: { expiresInDays: PIX_EXPIRES_DAYS },
    externalRef: input.externalRef || ("PEDIDO-" + Date.now())
  };
  var postback = input.postbackUrl || POSTBACK_URL;
  if (postback) payload.postbackUrl = postback;

  try {
    const r = await blackcatRequest("POST", "/sales/create-sale", payload);
    const d = r.body && r.body.data;
    if ((r.status === 201 || r.status === 200) && r.body && r.body.success && d && d.paymentData) {
      const pd = d.paymentData;
      const pixCode = pd.copyPaste || pd.qrCode;
      return sendJson(res, 200, {
        success: true,
        transactionId: d.transactionId,
        pixCode: pixCode,
        qrcodeUrl: pd.qrCodeBase64 ||
          ("https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" +
            encodeURIComponent(pixCode || "")),
        expiresAt: pd.expiresAt || null
      });
    }
    // Log de diagnóstico: mostra exatamente o que a BlackCat respondeu.
    console.error("\n[BlackCat] /sales/create-sale falhou");
    console.error("  HTTP status:", r.status);
    console.error("  resposta:", JSON.stringify(r.body));
    console.error("  payload enviado:", JSON.stringify(payload), "\n");
    const msg = (r.body && (r.body.message || r.body.error)) || "Não foi possível gerar o PIX.";
    return sendJson(res, 200, { success: false, error: msg });
  } catch (e) {
    console.error("[BlackCat] erro de conexão:", e.message);
    return sendJson(res, 502, { success: false, error: "Falha ao contatar o provedor de pagamento." });
  }
}

async function handleStatus(req, res, query) {
  const id = query.get("id");
  if (!id) return sendJson(res, 400, { success: false, error: "id ausente." });

  // ---------- MODO DEMO ----------
  if (DEMO_MODE) {
    const tx = demoTx.get(id);
    if (!tx) return sendJson(res, 200, { success: true, status: "pending", paid: false });
    const paid = Date.now() >= tx.paidAt;
    return sendJson(res, 200, {
      success: true,
      demo: true,
      status: paid ? "paid" : "pending",
      paid: paid
    });
  }

  // ---------- MODO REAL (BlackCat Pay) ----------
  try {
    const r = await blackcatRequest("GET", "/sales/" + encodeURIComponent(id) + "/status", null);
    const status = (r.body && r.body.data && r.body.data.status) || "UNKNOWN";
    return sendJson(res, 200, {
      success: true,
      status: status,
      paid: status === "PAID"
    });
  } catch (e) {
    return sendJson(res, 502, { success: false, error: "Falha ao consultar pagamento." });
  }
}

// ---------------------------------------------------------------------------
// Servidor estático + roteamento
// ---------------------------------------------------------------------------

function serveStatic(req, res, pathname) {
  // normaliza e impede path traversal
  let rel = decodeURIComponent(pathname.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const filePath = path.normalize(path.join(SITE_DIR, rel));
  if (!filePath.startsWith(SITE_DIR)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // fallback: tenta /index.html da pasta (rotas tipo /checkout)
      const idx = path.join(filePath, "index.html");
      return fs.readFile(idx, (e2, data) => {
        if (e2) { res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          return res.end("<h1>404</h1>"); }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data);
      });
    }
    const ext = path.extname(filePath).toLowerCase();
    fs.readFile(filePath, (e3, data) => {
      if (e3) { res.writeHead(500); return res.end("Erro"); }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, "http://localhost");
  const pathname = parsed.pathname;

  if (pathname === "/api/gerar" && req.method === "POST") {
    return handleGerar(req, res);
  }
  if (pathname === "/api/status" && req.method === "GET") {
    return handleStatus(req, res, parsed.searchParams);
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res, pathname);
  }
  res.writeHead(405); res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log("\n  🌹 Paraíso das Flores rodando em  http://localhost:" + PORT);
  console.log("  📦 Servindo:  " + SITE_DIR);
  if (DEMO_MODE) {
    console.log("  ⚠️  PIX em MODO DEMO (sem chave BlackCat).");
    console.log("      O pagamento confirma sozinho ~18s após gerar o QR.");
    console.log("      Para usar de verdade, defina BLACKCAT_API_KEY.\n");
  } else {
    console.log("  ✅ PIX em MODO REAL via BlackCat Pay (" + BASE_URL + ").\n");
  }
});
