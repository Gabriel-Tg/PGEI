
# 📋 Guia de Instalação e Configuração - Firmware ESP32 PGEI

## 🚀 Instalação Rápida

### 1. Preparar Arduino IDE

#### 1.1 Adicionar URL da Placa ESP32
1. Abra Arduino IDE → **Arquivo** → **Preferências**
2. Em "URLs Adicionais de Gerenciadores de Placa", cole:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Clique OK

#### 1.2 Instalar Placa ESP32
1. **Ferramentas** → **Placa** → **Gerenciador de Placas**
2. Procure por "esp32"
3. Instale "ESP32 by Espressif Systems"

#### 1.3 Selecionar Placa Correta
1. **Ferramentas** → **Placa** → Selecione **"ESP32 Dev Module"**
2. **Ferramentas** → **Porta** → Selecione a porta COM do ESP32

---

### 2. Instalar Bibliotecas Necessárias

Na Arduino IDE, vá em **Sketch** → **Incluir biblioteca** → **Gerenciar bibliotecas** e instale:

| Biblioteca | Versão Recomendada |
|------------|------------------|
| **ArduinoJson** | 6.21.2 ou superior |
| (WiFi, HTTPClient, LittleFS já vêm com ESP32) | - |

**Passos:**
1. Abra **Gerenciador de Bibliotecas**
2. Procure "ArduinoJson"
3. Instale a versão mais recente de Benoit Blanchon

---

### 3. Configurar Campos Obrigatórios

Abra o arquivo `firmware_esp32_sensor.ino` e altere estes campos no topo:

```cpp
// ⚠️  CONFIGURAÇÕES OBRIGATÓRIAS - ALTERE ANTES DE USAR

// Wi-Fi
const char* WIFI_SSID = "SEU_WIFI_AQUI";
const char* WIFI_PASSWORD = "SENHA_WIFI_AQUI";

// API
const char* API_URL = "http://192.168.1.100:3001/api/sensor/pulse";
const char* HEARTBEAT_URL = "http://192.168.1.100:3001/api/sensor/heartbeat";
const char* SENSOR_TOKEN = "TOKEN_GERADO_NA_API";

// Máquina e Identificação
const char* MACHINE_ID = "MAQUINA_001";
const char* ESP32_ID = "ESP32_MAQUINA_001";
```

**Exemplo preenchido:**
```cpp
const char* WIFI_SSID = "Producao_2G";
const char* WIFI_PASSWORD = "senha123456";
const char* API_URL = "http://192.168.1.50:3001/api/sensor/pulse";
const char* HEARTBEAT_URL = "http://192.168.1.50:3001/api/sensor/heartbeat";
const char* SENSOR_TOKEN = "abc123def456xyz";
const char* MACHINE_ID = "INJETORA_01";
const char* ESP32_ID = "ESP32_INJETORA_01";
```

---

### 4. Fazer Upload do Firmware

1. Copie todo o conteúdo de `firmware_esp32_sensor.ino`
2. Cole na Arduino IDE
3. Clique **Verificar** (✓) para compilar
4. Clique **Upload** (→) para enviar ao ESP32
5. Aguarde mensagem "Hard resetting via RTS pin..."

---

### 5. Testar no Serial Monitor

1. **Ferramentas** → **Monitor Serial**
2. Selecione **115200 baud** (canto inferior direito)
3. Você verá logs como:

```
================================================================================
  FIRMWARE ESP32 - SISTEMA INDUSTRIAL PGEI v1.0
================================================================================
  Machine ID: INJETORA_01
  ESP32 ID: ESP32_INJETORA_01
================================================================================

✓ LittleFS inicializado
✓ Sensor configurado (GPIO32 - Interrupt)
✓ Sincronizando hora com NTP...
🌐 Conectando ao Wi-Fi SSID: Producao_2G
...... ✓
✓ WiFi conectado! | IP: 192.168.1.105
✓ Sinal Wi-Fi: -52 dBm

✓ Sistema pronto!
```

---

## 🔧 Configuração de Hardware

### Conexões Básicas (ESP32 ↔ Sensor)

```
┌─────────────────────────────────────────────────────────┐
│                      ESP32 Dev Module                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  GPIO32 ─────────────┐                                   │
│                      │                                   │
│                      ├──[Optoacoplador PC817]            │
│                      │                                   │
│  GND ────────────────┼─────[Sensor Indutivo]            │
│                      │                                   │
│  5V (ou conforme)────┴─────[Sensor Indutivo]            │
│                                                           │
│  GND ───────────────── GND                              │
│  5V  ───────────────── 5V (fonte principal)             │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

**Detalhes:**
- **Sensor GPIO**: GPIO32 (entrada com debounce de 100ms)
- **Optoacoplador PC817**: Isola sensor da placa (recomendado)
- **Debounce**: Já implementado no firmware (DEBOUNCE_DELAY_MS = 100ms)

---

## 📡 Estrutura de Requisições API

### 1. Envio de Pulso

**Endpoint:** `POST /api/sensor/pulse`

**JSON enviado:**
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

**Resposta esperada (200/201):**
```json
{
  "success": true,
  "event_id": "ESP32_INJETORA_01_abc123_1"
}
```

---

### 2. Heartbeat (A cada 30 segundos)

**Endpoint:** `POST /api/sensor/heartbeat`

**JSON enviado:**
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

---

## 💾 Modo Offline - Como Funciona

### Fluxo Automático

```
┌─────────────────────────────────────────────────┐
│   Sensor detecta pulso                          │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
     ┌──────────────────────┐
     │ Wi-Fi conectado?     │
     └──────────┬───────────┘
                │
     ┌──────────┴──────────┐
     │                     │
    SIM                    NÃO
     │                     │
     ▼                     ▼
  Enviar API        Salvar Localmente
     │              em LittleFS
     │              (/events_*.json)
     │                     │
     └──────────┬──────────┘
                │
        ┌───────▼────────┐
        │ API Respondeu? │
        └───────┬────────┘
                │
     ┌──────────┴──────────┐
     │                     │
    SIM                    NÃO
     │                     │
     ▼                     ▼
  Sucesso           Salvar Offline
                   (tentará reenviar)
```

### Sincronização Automática

- Quando Wi-Fi retorna → Reprocessa fila automaticamente a cada 5 segundos
- Mantém ordem original dos eventos
- Respeita timestamps corretos
- Limpa armazenamento após sucesso

**Logs de exemplo:**
```
⚠️  Wi-Fi desconectado! Modo OFFLINE ativado.
💾 Evento salvo offline: ESP32_INJETORA_01_abc123_2 | Arquivo: /events_123456.json
💾 Evento salvo offline: ESP32_INJETORA_01_abc123_3 | Arquivo: /events_123457.json

🔄 Reconectando Wi-Fi...
✓ WiFi restaurado! | IP: 192.168.1.105

📤 Reenviando evento offline... ✓
📤 Reenviando evento offline... ✓

✓ Sincronização concluída! 2 eventos reprocessados.
```

---

## 🔍 Monitoramento em Tempo Real

### Log Serial Típico (1 minuto)

```
📊 Pulso detectado #1 | Timestamp: 1000
📤 Enviando pulso #1 para API... ✓
   Resposta: {"success":true,"event_id":"ESP32_INJETORA_01_abc123_1"}

📊 Pulso detectado #2 | Timestamp: 3500
📤 Enviando pulso #2 para API... ✓
   Resposta: {"success":true,"event_id":"ESP32_INJETORA_01_abc123_2"}

💓 Heartbeat enviado | Pulsos totais: 2 | Sinal Wi-Fi: -52 dBm | Uptime: 0min ✓

📊 Pulso detectado #3 | Timestamp: 8200
📤 Enviando pulso #3 para API... ✓
   Resposta: {"success":true,"event_id":"ESP32_INJETORA_01_abc123_3"}
```

### Comando de Diagnóstico

Para verificar status completo do sistema, você pode adicionar no Serial Monitor:

```cpp
// Descomente em teste/debug e coloque no loop():
// if (Serial.available()) {
//   char cmd = Serial.read();
//   if (cmd == 'd') diagnosticSystem();
// }
```

Ao digitar `d` no Serial Monitor:

```
================================================================================
  DIAGNÓSTICO DO SISTEMA
================================================================================
WiFi Status: ✓ CONECTADO
WiFi SSID: Producao_2G
IP Address: 192.168.1.105
Sinal Wi-Fi: -52 dBm
Pulsos Detectados: 42
Uptime: 2h 15m 33s

📋 Arquivos offline armazenados:
  (Nenhum evento pendente)

================================================================================
```

---

## ⚙️ Ajustes Avançados

No topo do arquivo, você pode alterar:

```cpp
#define DEBOUNCE_DELAY_MS 100        // Debounce do sensor (aumentar se tiver ruído)
#define HTTP_TIMEOUT_MS 10000        // Timeout HTTP (aumentar para redes lentas)
#define HEARTBEAT_INTERVAL_S 30      // Frequência do heartbeat
#define WIFI_RECONNECT_INTERVAL_S 10 // Frequência de reconexão
#define PROCESS_QUEUE_INTERVAL_S 5   // Frequência de sincronização offline
```

---

## 🐛 Troubleshooting

| Problema | Solução |
|----------|---------|
| Não conecta Wi-Fi | Verifique SSID/Password; Teste Wi-Fi com outro dispositivo |
| Não envia pulsos | Verifique GPIO32; Teste com `digitalWrite(LED, !LED)` |
| Pulsos duplicados | Aumente DEBOUNCE_DELAY_MS para 150-200ms |
| Erro na API | Verifique URL; Teste endpoint com Postman/curl |
| Travamentos | Redefinir ESP32; Checar alimentation |
| LittleFS cheio | `LittleFS.format()` no setup (apaga tudo) |

---

## 📊 Especificações Técnicas

| Aspecto | Detalhes |
|--------|----------|
| **Chip** | ESP32 (Dual-core) |
| **Memória RAM** | 160 KB + 4MB PSRAM |
| **Armazenamento** | 4MB (LittleFS para offline queue) |
| **Frequência CPU** | 80-240 MHz |
| **Wi-Fi** | 802.11 b/g/n |
| **Sensor GPIO** | GPIO32 com interrupção |
| **Taxa Serial** | 115200 baud |
| **Tempo Debounce** | 100ms |
| **Reconexão Wi-Fi** | A cada 10s |
| **Heartbeat** | A cada 30s |

---

## 🔒 Segurança

- ✓ Token de API armazenado no firmware
- ✓ Timeout HTTP contra ataques
- ✓ Identificação única por ESP32_ID
- ✓ Isolamento do sensor com optoacoplador
- ✓ Proteção contra duplicação de eventos (event_id único)

---

## 📝 Checklist de Implementação

- [ ] Arduino IDE instalada
- [ ] Placa ESP32 configurada
- [ ] Bibliotecas instaladas (ArduinoJson)
- [ ] WiFi SSID/Password configurados
- [ ] API URL configurada
- [ ] Token gerado e configurado
- [ ] MACHINE_ID definido
- [ ] ESP32_ID definido
- [ ] Hardware montado (sensor → GPIO32)
- [ ] Upload feito com sucesso
- [ ] Serial Monitor mostra logs
- [ ] Pulsos sendo detectados
- [ ] API recebendo eventos
- [ ] Modo offline testado

---

## 📞 Suporte

Se tiver dúvidas, verifique:
1. Serial Monitor em 115200 baud
2. Logs de erro ou reconexão
3. Conectividade de rede
4. Credenciais de Wi-Fi
5. Token e URL da API

---

**Versão:** 1.0  
**Data:** 2026-05-21  
**Compatibilidade:** Arduino IDE 1.8.13+, ESP32 Dev Module  
**Status:** ✓ Pronto para Produção

