# Paraíso das Flores — mirror + checkout PIX

Espelho estático do site `flores-namorados.com` (em [`site/`](site/)) com um pequeno
servidor Node que serve as páginas e integra o pagamento **PIX via BlackCat Pay**.

## Como rodar

```bash
node server.js
# abra http://localhost:8099
```

Sem dependências externas (usa só os módulos nativos do Node ≥ 18).

## Pagamento PIX

O navegador **nunca** vê a API Key: ele chama o seu servidor, que faz o
proxy autenticado para a BlackCat Pay.

| Rota              | Método | O que faz                                              |
| ----------------- | ------ | ------------------------------------------------------ |
| `/api/gerar`      | POST   | Cria a cobrança PIX → retorna `pixCode` (copia e cola) + `qrcodeUrl` |
| `/api/status?id=` | GET    | Consulta o status → quando `paid`, o front confirma e redireciona |

### Modo DEMO (padrão)

Sem chaves configuradas, o PIX roda em modo demo: gera um código copia-e-cola
válido (estrutura EMV real, chave fictícia) e o pagamento **confirma sozinho
~18s** depois — ideal para testar a tela.

### Modo REAL (BlackCat Pay)

Defina a chave e reinicie:

```bash
BLACKCAT_API_KEY="sua_api_key" node server.js
```

(ou copie `.env.example` para `.env` e preencha). A autenticação é o header
`X-API-Key: <api_key>` contra `https://api.blackcatpay.com.br/api`
(`POST /sales/create-sale` e `GET /sales/{id}/status`).

## Deploy no Netlify

O [`netlify.toml`](netlify.toml) publica a pasta `site/` e mapeia a API PIX para
**Netlify Functions** (`netlify/functions/gerar.js` e `status.js`):

| Rota pública      | Função serverless              |
| ----------------- | ------------------------------ |
| `/api/gerar`      | `.netlify/functions/gerar`     |
| `/api/status?id=` | `.netlify/functions/status`    |

Defina as credenciais em **Site settings → Environment variables**:

```
BLACKCAT_API_KEY = sua_api_key
POSTBACK_URL     = https://paraisodaflor.com/api/webhook
```

Sem essas variáveis o site funciona em **modo demo** (PIX confirma sozinho ~18s).
Em serverless o demo é *stateless*: o horário da confirmação vai codificado no
próprio `transactionId`, então `/api/status` não depende de memória compartilhada.

## Fluxo do checkout

1. **Dados** (nome, CPF, telefone)
2. **Endereço** — CEP com autopreenchimento via ViaCEP (rua, bairro, **cidade e estado**)
3. **Entrega + Pagamento** — gera o PIX, mostra QR + copia-e-cola, countdown de
   expiração e confirma o pagamento automaticamente por polling.
