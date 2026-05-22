# ✅ CORREÇÃO DO ERRO 405 - API SENSOR PULSE

## 🔍 DIAGNÓSTICO

### Problema
- **Erro**: 405 Method Not Allowed
- **Causa**: Rota **não existia** em `app/api/sensor/pulse/route.ts`
- **Local antigo**: `api/sensor/pulse.js` (estrutura desabilitada)
- **Conflito**: `vercel.json` configurado para build antigo

### Por que 405?
A plataforma Vercel estava:
1. ❌ Tentando usar a pasta `api/` antiga (Node.js serverless)
2. ❌ Não reconhecendo POST em rotas do Next.js App Router
3. ❌ Retornando "Method Not Allowed" por padrão

---

## ✅ CORREÇÕES REALIZADAS

### 1. Criação de Nova Rota Next.js (TypeScript)

**Arquivo**: `app/api/sensor/pulse/route.ts`
**O que faz**:
- ✅ Export `async function POST(request: NextRequest)`
- ✅ Aceita JSON do corpo
- ✅ Valida token no header `x-sensor-token`
- ✅ Conecta ao Supabase
- ✅ Valida máquina/ESP32
- ✅ Salva evento em `machine_sensor_events`
- ✅ Atualiza produção em `injection_production_entries`
- ✅ Retorna JSON com `{ ok: true }`

### 2. Criação de Rota Heartbeat

**Arquivo**: `app/api/sensor/heartbeat/route.ts`
- ✅ Mesmo padrão que POST pulse
- ✅ Atualiza `sensor_last_heartbeat_at`

### 3. Desabilitação de Rotas Antigas

**Arquivo**: `api/README_DESABILITADO.md`
- Documenta migrações
- Evita confusão

### 4. Atualização do vercel.json

**Antes**:
```json
{
  "builds": [{"src": "package.json", "use": "@vercel/static-build"}],
  "rewrites": [...]
}
```

**Depois**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next"
}
```

---

## 📋 CHECKLIST DE CONFLITOS

### ✅ Resolvidos
- [ ] Rota antiga desabilitada (`api/` → README criado)
- [ ] Vercel.json atualizado para Next.js
- [ ] TypeScript configurado
- [ ] Headers HTTPS implementados
- [ ] Supabase integrado
- [ ] Rate limiting ativo
- [ ] Logs console implementados

---

## 🧪 COMO TESTAR

### Teste Local

```powershell
# 1. Inicie o servidor Next.js
npm run dev

# 2. Em outro terminal, execute o script de teste
.\test-sensor-api.ps1
```

### Resposta Esperada (Status 200)
```json
{
  "ok": true,
  "machine_id": "P3",
  "company_id": "uuid",
  "order_id": "uuid_ou_null",
  "order_code": "OP001_ou_null",
  "pulse_count": 1,
  "cavities_used": 1,
  "produced_quantity": 1,
  "ignored": false,
  "event_id": "uuid"
}
```

### Teste em Produção

```powershell
$response = Invoke-WebRequest `
  -Uri "https://app.techargos.com.br/api/sensor/pulse" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "x-sensor-token" = "seu_token_real"
  } `
  -Body '{
    "machine_id": "P3",
    "esp32_id": "argos_box_1",
    "pulse_count": 1,
    "event_id": "test_001"
  }'

$response.Content | ConvertFrom-Json | ConvertTo-Json
```

---

## 📦 ESTRUTURA FINAL

```
c:\Users\User\Documents\PGEI-main\
├── app/
│   └── api/
│       └── sensor/
│           ├── pulse/
│           │   └── route.ts          ✅ NOVO (Next.js)
│           └── heartbeat/
│               └── route.ts          ✅ NOVO (Next.js)
├── api/
│   ├── sensor/
│   │   ├── pulse.js                  ❌ DESABILITADO
│   │   └── heartbeat.js              ❌ DESABILITADO
│   └── README_DESABILITADO.md        📝 NOVO
├── vercel.json                       ✅ ATUALIZADO
└── test-sensor-api.ps1               🧪 NOVO
```

---

## 🚀 DEPLOYING NO VERCEL

```bash
# Push para Git
git add .
git commit -m "Migrate sensor API to Next.js App Router"
git push

# Vercel detectará package.json e usará config do vercel.json
# Build: npm run build
# Output: .next
```

---

## 📊 LOGS ESPERADOS

Quando a API recebe um pulso, você verá:

```
📥 Requisição recebida em /api/sensor/pulse
Method: POST
URL: https://app.techargos.com.br/api/sensor/pulse
📨 Body recebido: {machine_id: "P3", esp32_id: "argos_box_1", ...}
✓ Validação básica OK
✓ Máquina autorizada: INJETORA_P3
📦 O.P. ativa: OP001
📊 Produção calculada: {pulseCount: 1, cavitiesUsed: 8, total: 8}
✅ Evento salvo: uuid-evento
✅ Response: {ok: true, produced_quantity: 8, ...}
```

---

## ⚠️ TROUBLESHOOTING

### Status 401 (Token inválido)
```
❌ Token não fornecido
➜ Verifique header: x-sensor-token
```

### Status 403 (Máquina/token não correspondem)
```
❌ Máquina/token inválido
➜ Valide SENSOR_TOKEN no firmware
➜ Valide MACHINE_ID no firmware
➜ Confirme sensor_token_hash no Supabase
```

### Status 404 (Rota não encontrada)
```
❌ AINDA TEM O ERRO 405?
➜ Verifique se build Next.js ocorreu: npm run build
➜ Valide vercel.json está no root
➜ Teste localmente: npm run dev
```

### Status 429 (Rate limit)
```
⚠️ Rate limit excedido
➜ Paule entre requisições
➜ Máximo: 120 pulsos/10s por máquina
```

---

## 📞 SUPORTE

Endpoints:
- **POST** `https://app.techargos.com.br/api/sensor/pulse`
- **POST** `https://app.techargos.com.br/api/sensor/heartbeat`

Headers obrigatórios:
- `Content-Type: application/json`
- `x-sensor-token: TOKEN_AQUI`

Realtime: Supabase Realtime está ativo
Dashboard: Atualiza automaticamente via listeners

---

✅ **API pronta para produção!**
