
# 📡 API Endpoints - Integração Backend PGEI

## 📋 Overview

O firmware ESP32 envia requisições para dois endpoints principais:
- `POST /api/sensor/pulse` - Receber pulsos de sensores
- `POST /api/sensor/heartbeat` - Monitorar saúde dos sensores

---

## 1️⃣ Endpoint: `/api/sensor/pulse`

### 📤 Requisição

**Method:** `POST`  
**Content-Type:** `application/json`  
**Timeout esperado:** 10 segundos

### Request Body

```json
{
  "machine_id": "INJETORA_01",
  "esp32_id": "ESP32_INJETORA_01",
  "token": "abc123def456xyz",
  "pulse_count": 1,
  "timestamp": "2026-05-21 14:32:45",
  "event_id": "ESP32_INJETORA_01_abc123_1"
}
```

### Parâmetros

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `machine_id` | string | ID da máquina no sistema | `"INJETORA_01"` |
| `esp32_id` | string | ID único do ESP32 | `"ESP32_INJETORA_01"` |
| `token` | string | Token de autenticação | `"abc123def456xyz"` |
| `pulse_count` | number | Número sequencial do pulso | `1, 2, 3...` |
| `timestamp` | string | Data/hora do pulso (ISO 8601) | `"2026-05-21 14:32:45"` |
| `event_id` | string | ID único do evento | `"ESP32_INJETORA_01_abc123_1"` |

### ✅ Resposta de Sucesso (200/201)

```json
{
  "success": true,
  "event_id": "ESP32_INJETORA_01_abc123_1",
  "received_at": "2026-05-21T14:32:45Z",
  "message": "Pulso registrado com sucesso"
}
```

### ❌ Resposta de Erro (400/401/500)

```json
{
  "success": false,
  "error": "Token inválido",
  "event_id": "ESP32_INJETORA_01_abc123_1"
}
```

### Validações Obrigatórias

1. ✓ Token deve estar registrado e ativo no banco de dados
2. ✓ `machine_id` deve existir no sistema
3. ✓ `timestamp` deve ser válido
4. ✓ `event_id` deve ser único (evitar duplicatas)
5. ✓ Registrar no banco de dados com:
   - `id` (auto-gerado)
   - `machine_id`
   - `esp32_id`
   - `pulse_count`
   - `event_id`
   - `timestamp_original` (do ESP32)
   - `timestamp_received` (servidor)
   - `status` = 'received'

### Lógica Recomendada

```javascript
// Pseudocódigo Node.js/Express
app.post('/api/sensor/pulse', async (req, res) => {
  try {
    const { machine_id, esp32_id, token, pulse_count, timestamp, event_id } = req.body;
    
    // 1. Validar token
    const sensor = await validateToken(token);
    if (!sensor) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }
    
    // 2. Validar machine_id
    const machine = await getMachine(machine_id);
    if (!machine) {
      return res.status(400).json({ success: false, error: 'Máquina não encontrada' });
    }
    
    // 3. Evitar duplicatas
    const existingEvent = await getEventById(event_id);
    if (existingEvent) {
      return res.status(200).json({ success: true, message: 'Evento já foi recebido' });
    }
    
    // 4. Salvar no banco de dados
    const sensorEvent = await saveSensorEvent({
      machine_id,
      esp32_id,
      pulse_count,
      event_id,
      timestamp_original: timestamp,
      timestamp_received: new Date().toISOString(),
      status: 'received'
    });
    
    // 5. Responder ao ESP32
    res.json({
      success: true,
      event_id: sensorEvent.event_id,
      received_at: sensorEvent.timestamp_received
    });
    
  } catch (error) {
    console.error('Erro ao processar pulso:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});
```

---

## 2️⃣ Endpoint: `/api/sensor/heartbeat`

### 📤 Requisição

**Method:** `POST`  
**Content-Type:** `application/json`  
**Frequência:** A cada 30 segundos

### Request Body

```json
{
  "esp32_id": "ESP32_INJETORA_01",
  "machine_id": "INJETORA_01",
  "uptime": 3600,
  "wifi_signal": -52,
  "status": "online",
  "pulses_total": 1245,
  "timestamp": "2026-05-21 14:32:45"
}
```

### Parâmetros

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `esp32_id` | string | ID único do ESP32 | `"ESP32_INJETORA_01"` |
| `machine_id` | string | ID da máquina | `"INJETORA_01"` |
| `uptime` | number | Tempo ligado em segundos | `3600` (1 hora) |
| `wifi_signal` | number | Força do sinal Wi-Fi (dBm) | `-52` (bom) a `-80` (ruim) |
| `status` | string | Status do sensor | `"online"` ou `"offline"` |
| `pulses_total` | number | Total de pulsos desde boot | `1245` |
| `timestamp` | string | Data/hora do heartbeat | `"2026-05-21 14:32:45"` |

### ✅ Resposta de Sucesso (200/201)

```json
{
  "success": true,
  "message": "Heartbeat recebido",
  "sensor_status": "healthy"
}
```

### Escala de Qualidade de Sinal Wi-Fi

```
dBm    | Qualidade | Status
-------|-----------|----------
-30   | Excelente | ✓✓✓
-50   | Muito bom | ✓✓
-60   | Bom       | ✓
-70   | Fraco     | ⚠️
-80   | Muito fraco| ❌
```

### Lógica Recomendada

```javascript
// Pseudocódigo Node.js/Express
app.post('/api/sensor/heartbeat', async (req, res) => {
  try {
    const { esp32_id, machine_id, uptime, wifi_signal, status, pulses_total, timestamp } = req.body;
    
    // 1. Atualizar status do sensor no banco
    const sensorStatus = await updateSensorStatus({
      esp32_id,
      machine_id,
      last_heartbeat: new Date().toISOString(),
      uptime,
      wifi_signal,
      status: 'online',
      pulses_total
    });
    
    // 2. Alertar se sinal fraco
    if (wifi_signal < -70) {
      console.warn(`⚠️  Sinal fraco para ${esp32_id}: ${wifi_signal} dBm`);
      // Opcional: notificar admin
    }
    
    // 3. Verificar inatividade (heartbeat perdido)
    // Se não receber por 2 minutos → marcar como offline
    
    res.json({
      success: true,
      message: 'Heartbeat recebido',
      sensor_status: 'healthy'
    });
    
  } catch (error) {
    console.error('Erro ao processar heartbeat:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});
```

---

## 🗄️ Schema do Banco de Dados

### Tabela: `sensor_events`

```sql
CREATE TABLE sensor_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  machine_id VARCHAR(50) NOT NULL,
  esp32_id VARCHAR(100) NOT NULL,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  pulse_count INT NOT NULL,
  timestamp_original DATETIME NOT NULL,
  timestamp_received DATETIME DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'received',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_machine_id (machine_id),
  INDEX idx_esp32_id (esp32_id),
  INDEX idx_timestamp (timestamp_original),
  INDEX idx_status (status)
);
```

### Tabela: `sensor_status`

```sql
CREATE TABLE sensor_status (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  esp32_id VARCHAR(100) UNIQUE NOT NULL,
  machine_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'online',
  uptime INT DEFAULT 0,
  wifi_signal INT DEFAULT 0,
  pulses_total INT DEFAULT 0,
  last_heartbeat DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_esp32_id (esp32_id),
  INDEX idx_machine_id (machine_id),
  INDEX idx_last_heartbeat (last_heartbeat)
);
```

### Tabela: `sensor_tokens`

```sql
CREATE TABLE sensor_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  token VARCHAR(255) UNIQUE NOT NULL,
  esp32_id VARCHAR(100) NOT NULL,
  machine_id VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_token (token),
  INDEX idx_esp32_id (esp32_id)
);
```

---

## 🔐 Autenticação via Token

### Gerar Token

```javascript
const crypto = require('crypto');

function generateSensorToken() {
  return crypto.randomBytes(32).toString('hex');
  // Exemplo: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"
}
```

### Validar Token

```javascript
async function validateToken(token) {
  const sensorToken = await db.query(
    'SELECT * FROM sensor_tokens WHERE token = ? AND is_active = TRUE',
    [token]
  );
  
  return sensorToken.length > 0 ? sensorToken[0] : null;
}
```

---

## 🔄 Fluxo Completo

```
┌──────────────────────┐
│   ESP32 inicia       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────┐
│ A cada pulso:           │
│ - Tenta POST /pulse     │
│ - Se falha, salva local │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Backend:                 │
│ 1. Valida token          │
│ 2. Valida machine_id     │
│ 3. Evita duplicatas      │
│ 4. Salva no DB           │
│ 5. Responde sucesso      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ A cada 30s:              │
│ - Envia POST /heartbeat  │
│ - Backend atualiza status│
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Se Wi-Fi cai:            │
│ - Salva pulsos local     │
│ - Tenta reconectar       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Quando Wi-Fi volta:      │
│ - Reenviar pulsos salvos │
│ - Manter timestamps      │
│ - Limpar storage local   │
└──────────────────────────┘
```

---

## 📊 Exemplo de Resposta Persistida no Backend

Após receber 10 pulsos, o banco teria:

```
ID | machine_id   | esp32_id           | pulse_count | event_id                    | timestamp_original      | status
---|--------------|--------------------|-----------|-----------------------------|-------------------------|---------
1  | INJETORA_01  | ESP32_INJETORA_01  | 1         | ESP32_INJETORA_01_xxx_1    | 2026-05-21 14:32:45    | received
2  | INJETORA_01  | ESP32_INJETORA_01  | 2         | ESP32_INJETORA_01_xxx_2    | 2026-05-21 14:32:47    | received
3  | INJETORA_01  | ESP32_INJETORA_01  | 3         | ESP32_INJETORA_01_xxx_3    | 2026-05-21 14:32:49    | received
4  | INJETORA_01  | ESP32_INJETORA_01  | 4         | ESP32_INJETORA_01_xxx_4    | 2026-05-21 14:33:51    | received
...
10 | INJETORA_01  | ESP32_INJETORA_01  | 10        | ESP32_INJETORA_01_xxx_10   | 2026-05-21 14:34:15    | received
```

---

## 🚀 Deployment

### Para Iniciar Backend com estes Endpoints

```bash
# Node.js + Express (exemplo)
npm install express dotenv
node server.js

# Porta padrão: 3001
# URL: http://localhost:3001/api/sensor/pulse
#      http://localhost:3001/api/sensor/heartbeat
```

### Variáveis de Ambiente

```env
PORT=3001
DATABASE_URL=mysql://user:password@localhost:3306/pgei_db
NODE_ENV=production
```

---

## ✅ Checklist de Implementação Backend

- [ ] Criar endpoints `/api/sensor/pulse` e `/api/sensor/heartbeat`
- [ ] Implementar validação de token
- [ ] Criar tabelas no banco de dados
- [ ] Implementar verificação de duplicatas
- [ ] Adicionar logs de eventos
- [ ] Testar com Postman/curl
- [ ] Configurar timeout (10s)
- [ ] Adicionar monitoramento de saúde
- [ ] Implementar alertas de desconexão
- [ ] Documentar em Swagger/OpenAPI

---

## 📞 Testes com Curl

### Teste de Pulso

```bash
curl -X POST http://localhost:3001/api/sensor/pulse \
  -H "Content-Type: application/json" \
  -d '{
    "machine_id": "INJETORA_01",
    "esp32_id": "ESP32_INJETORA_01",
    "token": "abc123def456xyz",
    "pulse_count": 1,
    "timestamp": "2026-05-21 14:32:45",
    "event_id": "ESP32_INJETORA_01_abc123_1"
  }'
```

### Teste de Heartbeat

```bash
curl -X POST http://localhost:3001/api/sensor/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "esp32_id": "ESP32_INJETORA_01",
    "machine_id": "INJETORA_01",
    "uptime": 3600,
    "wifi_signal": -52,
    "status": "online",
    "pulses_total": 1245,
    "timestamp": "2026-05-21 14:32:45"
  }'
```

---

**Versão:** 1.0  
**Data:** 2026-05-21  
**Status:** ✓ Pronto para Implementação

