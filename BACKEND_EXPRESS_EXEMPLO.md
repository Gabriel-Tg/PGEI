
# 🚀 Backend Express.js - Endpoints para ESP32 PGEI

## 📋 Arquivo: `routes/sensorRoutes.js`

```javascript
/*
================================================================================
  Rotas para Sensores ESP32
  - POST /api/sensor/pulse     → Receber pulsos
  - POST /api/sensor/heartbeat → Receber heartbeat
  
  Compatível com: Node.js 14+, Express 4.x
================================================================================
*/

const express = require('express');
const router = express.Router();
const db = require('../lib/database'); // Sua conexão com o banco

// ================================================================================
//  MIDDLEWARE DE AUTENTICAÇÃO
// ================================================================================

async function validateSensorToken(token) {
  try {
    const query = `
      SELECT * FROM sensor_tokens 
      WHERE token = ? AND is_active = TRUE
      LIMIT 1
    `;
    const [result] = await db.query(query, [token]);
    return result ? result[0] : null;
  } catch (error) {
    console.error('Erro ao validar token:', error);
    return null;
  }
}

// ================================================================================
//  POST /api/sensor/pulse
//  Receber pulso de um sensor ESP32
// ================================================================================

router.post('/pulse', async (req, res) => {
  try {
    const { machine_id, esp32_id, token, pulse_count, timestamp, event_id } = req.body;

    // 1️⃣ Validar campos obrigatórios
    if (!machine_id || !esp32_id || !token || pulse_count === undefined || !timestamp || !event_id) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios faltando',
        required: ['machine_id', 'esp32_id', 'token', 'pulse_count', 'timestamp', 'event_id']
      });
    }

    // 2️⃣ Validar token
    const sensorToken = await validateSensorToken(token);
    if (!sensorToken) {
      console.warn(`⚠️  Tentativa com token inválido: ${token}`);
      return res.status(401).json({
        success: false,
        error: 'Token inválido ou inativo',
        event_id
      });
    }

    // 3️⃣ Validar machine_id
    const machineQuery = 'SELECT id FROM machines WHERE id = ? LIMIT 1';
    const [machineResult] = await db.query(machineQuery, [machine_id]);
    if (!machineResult || machineResult.length === 0) {
      console.warn(`⚠️  Machine não encontrada: ${machine_id}`);
      return res.status(400).json({
        success: false,
        error: 'Máquina não encontrada',
        event_id
      });
    }

    // 4️⃣ Verificar duplicata
    const duplicateQuery = 'SELECT id FROM sensor_events WHERE event_id = ? LIMIT 1';
    const [duplicateResult] = await db.query(duplicateQuery, [event_id]);
    if (duplicateResult && duplicateResult.length > 0) {
      console.log(`ℹ️  Evento duplicado recebido: ${event_id}`);
      return res.status(200).json({
        success: true,
        message: 'Evento já foi recebido anteriormente',
        event_id,
        received_at: new Date().toISOString()
      });
    }

    // 5️⃣ Salvar evento no banco
    const insertQuery = `
      INSERT INTO sensor_events 
      (machine_id, esp32_id, event_id, pulse_count, timestamp_original, timestamp_received, status)
      VALUES (?, ?, ?, ?, ?, NOW(), 'received')
    `;

    await db.query(insertQuery, [
      machine_id,
      esp32_id,
      event_id,
      pulse_count,
      new Date(timestamp)
    ]);

    // 6️⃣ Log de sucesso
    console.log(`✓ Pulso recebido: Machine=${machine_id}, Pulso=${pulse_count}, EventID=${event_id}`);

    // 7️⃣ Responder ao ESP32
    res.status(201).json({
      success: true,
      event_id,
      received_at: new Date().toISOString(),
      message: 'Pulso registrado com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao processar pulso:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao processar pulso',
      event_id: req.body?.event_id || 'unknown'
    });
  }
});

// ================================================================================
//  POST /api/sensor/heartbeat
//  Receber heartbeat de um sensor ESP32 (a cada 30 segundos)
// ================================================================================

router.post('/heartbeat', async (req, res) => {
  try {
    const { esp32_id, machine_id, uptime, wifi_signal, status, pulses_total, timestamp } = req.body;

    // 1️⃣ Validar campos obrigatórios
    if (!esp32_id || !machine_id) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios faltando: esp32_id, machine_id'
      });
    }

    // 2️⃣ Atualizar ou inserir status do sensor
    const checkQuery = 'SELECT id FROM sensor_status WHERE esp32_id = ? LIMIT 1';
    const [checkResult] = await db.query(checkQuery, [esp32_id]);

    if (checkResult && checkResult.length > 0) {
      // Sensor já existe → Atualizar
      const updateQuery = `
        UPDATE sensor_status 
        SET 
          status = ?,
          uptime = ?,
          wifi_signal = ?,
          pulses_total = ?,
          last_heartbeat = NOW(),
          updated_at = NOW()
        WHERE esp32_id = ?
      `;

      await db.query(updateQuery, [
        status || 'online',
        uptime || 0,
        wifi_signal || 0,
        pulses_total || 0,
        esp32_id
      ]);
    } else {
      // Sensor novo → Inserir
      const insertQuery = `
        INSERT INTO sensor_status 
        (esp32_id, machine_id, status, uptime, wifi_signal, pulses_total, last_heartbeat)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      await db.query(insertQuery, [
        esp32_id,
        machine_id,
        status || 'online',
        uptime || 0,
        wifi_signal || 0,
        pulses_total || 0
      ]);
    }

    // 3️⃣ Alertar se sinal fraco
    if (wifi_signal && wifi_signal < -70) {
      console.warn(`⚠️  SINAL FRACO: ${esp32_id} | ${wifi_signal} dBm`);
      // Opcional: enviar notificação para admin
    }

    // 4️⃣ Log de heartbeat
    console.log(`💓 Heartbeat: ${esp32_id} | Uptime: ${uptime}s | Sinal: ${wifi_signal}dBm | Pulsos: ${pulses_total}`);

    // 5️⃣ Responder ao ESP32
    res.status(200).json({
      success: true,
      message: 'Heartbeat recebido',
      sensor_status: 'healthy',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao processar heartbeat:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao processar heartbeat'
    });
  }
});

// ================================================================================
//  GET /api/sensor/status
//  Obter status de todos os sensores (monitoramento)
// ================================================================================

router.get('/status', async (req, res) => {
  try {
    const query = `
      SELECT 
        esp32_id,
        machine_id,
        status,
        uptime,
        wifi_signal,
        pulses_total,
        last_heartbeat,
        TIMEDIFF(NOW(), last_heartbeat) as tempo_sem_heartbeat,
        updated_at
      FROM sensor_status
      ORDER BY last_heartbeat DESC
    `;

    const [sensors] = await db.query(query);

    res.json({
      success: true,
      total: sensors.length,
      sensors: sensors.map(s => ({
        esp32_id: s.esp32_id,
        machine_id: s.machine_id,
        status: s.status,
        uptime_seconds: s.uptime,
        wifi_signal_dbm: s.wifi_signal,
        pulses_total: s.pulses_total,
        last_heartbeat: s.last_heartbeat,
        online: s.status === 'online',
        signal_quality: getSignalQuality(s.wifi_signal)
      }))
    });

  } catch (error) {
    console.error('❌ Erro ao obter status dos sensores:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter status dos sensores'
    });
  }
});

// ================================================================================
//  GET /api/sensor/events/:machine_id
//  Obter eventos de uma máquina (últimas 24h)
// ================================================================================

router.get('/events/:machine_id', async (req, res) => {
  try {
    const { machine_id } = req.params;
    const hours = req.query.hours || 24;

    const query = `
      SELECT 
        id,
        machine_id,
        esp32_id,
        event_id,
        pulse_count,
        timestamp_original,
        timestamp_received,
        status,
        created_at
      FROM sensor_events
      WHERE machine_id = ? 
        AND timestamp_original >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY timestamp_original DESC
      LIMIT 1000
    `;

    const [events] = await db.query(query, [machine_id, hours]);

    res.json({
      success: true,
      machine_id,
      total_events: events.length,
      period_hours: hours,
      events: events
    });

  } catch (error) {
    console.error('❌ Erro ao obter eventos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter eventos'
    });
  }
});

// ================================================================================
//  GET /api/sensor/stats/:machine_id
//  Obter estatísticas de uma máquina
// ================================================================================

router.get('/stats/:machine_id', async (req, res) => {
  try {
    const { machine_id } = req.params;

    const query = `
      SELECT 
        COUNT(*) as total_pulsos,
        MAX(pulse_count) as ultima_contagem,
        DATE_FORMAT(MAX(timestamp_original), '%Y-%m-%d %H:%i:%s') as ultimo_pulso,
        DATE_FORMAT(MIN(timestamp_original), '%Y-%m-%d %H:%i:%s') as primeiro_pulso,
        COUNT(DISTINCT DATE(timestamp_original)) as dias_com_eventos
      FROM sensor_events
      WHERE machine_id = ? AND timestamp_original >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `;

    const [stats] = await db.query(query, [machine_id]);

    res.json({
      success: true,
      machine_id,
      stats: stats[0] || {
        total_pulsos: 0,
        ultima_contagem: 0,
        ultimo_pulso: null,
        primeiro_pulso: null,
        dias_com_eventos: 0
      }
    });

  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter estatísticas'
    });
  }
});

// ================================================================================
//  UTILITÁRIOS
// ================================================================================

function getSignalQuality(dbm) {
  if (!dbm) return 'unknown';
  if (dbm > -50) return 'excellent';
  if (dbm > -60) return 'very_good';
  if (dbm > -70) return 'good';
  if (dbm > -80) return 'fair';
  return 'poor';
}

// ================================================================================
//  EXPORTAR
// ================================================================================

module.exports = router;
```

---

## 📋 Arquivo: `app.js` (Integração com Express)

```javascript
const express = require('express');
const sensorRoutes = require('./routes/sensorRoutes');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ================================================================================
//  ROTAS DE SENSORES
// ================================================================================

app.use('/api/sensor', sensorRoutes);

// ================================================================================
//  HEALTH CHECK
// ================================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ================================================================================
//  404
// ================================================================================

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ================================================================================
//  INICIAR SERVIDOR
// ================================================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor iniciado na porta ${PORT}`);
  console.log(`📡 Endpoints de sensores disponíveis:`);
  console.log(`   POST /api/sensor/pulse      → Receber pulsos`);
  console.log(`   POST /api/sensor/heartbeat  → Receber heartbeat`);
  console.log(`   GET  /api/sensor/status     → Status dos sensores`);
  console.log(`   GET  /api/sensor/events/:machine_id  → Eventos`);
  console.log(`   GET  /api/sensor/stats/:machine_id   → Estatísticas\n`);
});

module.exports = app;
```

---

## 🗄️ Arquivo: `lib/database.js` (Conexão MySQL)

```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pgei_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testar conexão
pool.getConnection()
  .then(connection => {
    console.log('✓ Conectado ao banco de dados MySQL');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao banco de dados:', err);
    process.exit(1);
  });

module.exports = pool;
```

---

## 📦 Arquivo: `package.json`

```json
{
  "name": "pgei-sensor-backend",
  "version": "1.0.0",
  "description": "Backend para receber dados de sensores ESP32",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["pgei", "sensor", "esp32"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## ⚙️ Arquivo: `.env`

```env
# Servidor
PORT=3001
NODE_ENV=production

# Banco de Dados MySQL
DB_HOST=localhost
DB_USER=pgei_user
DB_PASSWORD=senha_segura_123
DB_NAME=pgei_db

# CORS
CORS_ORIGIN=*
```

---

## 🚀 Como Instalar e Rodar

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar banco de dados

```bash
mysql -u root -p < setup_database.sql
```

### 3. Configurar .env

```bash
# Copiar template
cp .env.example .env

# Editar com suas credenciais
nano .env
```

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

### 5. Rodar em produção

```bash
npm start
```

---

## 📊 Criar Tabelas SQL

Criar arquivo: `setup_database.sql`

```sql
-- ============================================================
-- TABELAS PARA SISTEMA DE SENSORES ESP32
-- ============================================================

USE pgei_db;

-- ============================================================
-- 1. Tabela de Tokens de Sensores
-- ============================================================

CREATE TABLE IF NOT EXISTS sensor_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  token VARCHAR(255) UNIQUE NOT NULL,
  esp32_id VARCHAR(100) NOT NULL,
  machine_id VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_token (token),
  INDEX idx_esp32_id (esp32_id),
  INDEX idx_machine_id (machine_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. Tabela de Eventos de Sensores
-- ============================================================

CREATE TABLE IF NOT EXISTS sensor_events (
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
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Tabela de Status de Sensores
-- ============================================================

CREATE TABLE IF NOT EXISTS sensor_status (
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
  INDEX idx_last_heartbeat (last_heartbeat),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Inserir Tokens de Exemplo
-- ============================================================

INSERT INTO sensor_tokens (token, esp32_id, machine_id, is_active)
VALUES 
  ('abc123def456xyz789', 'ESP32_INJETORA_01', 'INJETORA_01', TRUE),
  ('token_maquina_2_xyz', 'ESP32_INJETORA_02', 'INJETORA_02', TRUE),
  ('token_maquina_3_xyz', 'ESP32_EXTRUSORA_01', 'EXTRUSORA_01', TRUE)
ON DUPLICATE KEY UPDATE is_active = TRUE;

-- ============================================================
-- 5. Verificar Dados Inseridos
-- ============================================================

-- Visualizar tokens
SELECT * FROM sensor_tokens;

-- Contar eventos
SELECT 
  machine_id,
  COUNT(*) as total_eventos,
  MAX(timestamp_original) as ultimo_evento
FROM sensor_events
GROUP BY machine_id;

-- Ver status dos sensores
SELECT * FROM sensor_status ORDER BY last_heartbeat DESC;
```

---

## 🧪 Testar Endpoints

### Via curl

```bash
# Teste de pulso
curl -X POST http://localhost:3001/api/sensor/pulse \
  -H "Content-Type: application/json" \
  -d '{
    "machine_id": "INJETORA_01",
    "esp32_id": "ESP32_INJETORA_01",
    "token": "abc123def456xyz789",
    "pulse_count": 1,
    "timestamp": "2026-05-21 14:32:45",
    "event_id": "ESP32_INJETORA_01_abc123_1"
  }'

# Teste de heartbeat
curl -X POST http://localhost:3001/api/sensor/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "esp32_id": "ESP32_INJETORA_01",
    "machine_id": "INJETORA_01",
    "uptime": 3600,
    "wifi_signal": -52,
    "status": "online",
    "pulses_total": 100,
    "timestamp": "2026-05-21 14:32:45"
  }'

# Obter status
curl http://localhost:3001/api/sensor/status

# Obter eventos
curl http://localhost:3001/api/sensor/events/INJETORA_01

# Obter estatísticas
curl http://localhost:3001/api/sensor/stats/INJETORA_01
```

---

## ✅ Checklist de Implementação

- [ ] Instalar dependências (`npm install`)
- [ ] Criar banco de dados e tabelas
- [ ] Configurar .env com credenciais
- [ ] Testar endpoints com curl
- [ ] Integrar rotas no App.js
- [ ] Implementar autenticação
- [ ] Adicionar logging
- [ ] Fazer deploy em produção
- [ ] Testar com ESP32 real
- [ ] Monitorar dados chegando

---

**Versão:** 1.0  
**Data:** 2026-05-21  
**Status:** ✓ Pronto para Implementação

