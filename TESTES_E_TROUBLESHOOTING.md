
# 🧪 Testes e Troubleshooting - Firmware ESP32 PGEI

## 🧪 Teste 1: Verificar Conexão Wi-Fi

### O que fazer:
1. Abra Serial Monitor (115200 baud)
2. Reinicie o ESP32
3. Observe os logs

### Resultado esperado:

```
✓ LittleFS inicializado
✓ Sensor configurado (GPIO32 - Interrupt)
🌐 Conectando ao Wi-Fi SSID: Producao_2G
...... ✓
✓ WiFi conectado! | IP: 192.168.1.105
✓ Sinal Wi-Fi: -52 dBm
✓ Sistema pronto!
```

### Se não conectar:
- ❌ `WiFi conectado! | IP: 192.168.0.0`
- ❌ `❌ Falha ao conectar Wi-Fi. Funcionando modo OFFLINE.`

**Soluções:**
```
1. Verifique WIFI_SSID e WIFI_PASSWORD no código
2. Teste se a senha tem caracteres especiais (evitar: @, #, $, etc)
3. Verifique se o ESP32 está a 3 metros do roteador
4. Tente conectar outro dispositivo ao mesmo Wi-Fi
5. Reinicie o roteador (desplug 30 segundos)
6. Compile e upload novamente
```

---

## 🧪 Teste 2: Simular Pulso do Sensor

### O que fazer:
1. Conecte um fio do GND do ESP32 ao GND do sensor
2. Conecte um fio do GPIO32 ao pino de sinal do sensor (via optoacoplador)
3. Simule um pulso conectando GPIO32 a 3.3V brevemente (< 100ms)
4. Observe Serial Monitor

### Resultado esperado:

```
📊 Pulso detectado #1 | Timestamp: 5432
📤 Enviando pulso #1 para API... ✓
   Resposta: {"success":true,"event_id":"ESP32_INJETORA_01_abc123_1"}
```

### Se não detectar:
- ❌ Nenhuma mensagem de pulso

**Soluções:**
```
1. Verifique conexão GPIO32 (multímetro)
2. Aumente DEBOUNCE_DELAY_MS se tiver ruído
3. Teste com LED: digitalWrite(LED, !LED) em setup()
4. Verifique alimentação do sensor (5V)
5. Teste com pushbutton simples em GPIO32
```

---

## 🧪 Teste 3: Testar Envio para API

### Pré-requisitos:
- Servidor local rodando em `http://192.168.1.50:3001`
- Endpoint `/api/sensor/pulse` implementado

### Como testar com Postman:

#### 1. Criar requisição

```
Method: POST
URL: http://192.168.1.50:3001/api/sensor/pulse
```

#### 2. Headers

```
Content-Type: application/json
```

#### 3. Body (raw → JSON)

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

#### 4. Clicar "Send"

#### Resultado esperado (200 OK):

```json
{
  "success": true,
  "event_id": "ESP32_INJETORA_01_abc123_1",
  "received_at": "2026-05-21T14:32:45Z"
}
```

### Se falhar:

| Erro | Causa Provável | Solução |
|------|---|---|
| `Connection refused` | Servidor não está rodando | `npm start` no servidor |
| `Network timeout` | Servidor fora da rede | Verificar IP/firewall |
| `401 Unauthorized` | Token inválido | Gerar novo token |
| `400 Bad Request` | JSON malformado | Validar JSON no https://jsonlint.com |

---

## 🧪 Teste 4: Modo Offline

### O que fazer:

1. Desconecte o Wi-Fi do roteador
2. Deixe o ESP32 ligado
3. Simule alguns pulsos (conecte GPIO32 a 3.3V)
4. Observe Serial Monitor

### Resultado esperado:

```
⚠️  Wi-Fi desconectado! Modo OFFLINE ativado.

📊 Pulso detectado #1 | Timestamp: 5432
💾 Evento salvo offline: ESP32_INJETORA_01_abc123_1 | Arquivo: /events_123456.json

📊 Pulso detectado #2 | Timestamp: 7890
💾 Evento salvo offline: ESP32_INJETORA_01_abc123_2 | Arquivo: /events_123457.json
```

### Agora reconecte Wi-Fi:

1. Ligue o Wi-Fi novamente
2. Aguarde reconexão automática

### Resultado esperado:

```
🔄 Reconectando Wi-Fi...
✓ WiFi restaurado! | IP: 192.168.1.105

📤 Reenviando evento offline... ✓
📤 Reenviando evento offline... ✓

✓ Sincronização concluída! 2 eventos reprocessados.
```

### Se não sincronizar:

**Soluções:**
```
1. Aguarde 5 segundos (intervalo de processamento)
2. Verifique logs de erro da API
3. Confirme conectividade entre ESP32 e servidor
4. Teste manualmente com Postman
5. Verifique tokens
```

---

## 🧪 Teste 5: Heartbeat

### O que fazer:

1. Deixe o ESP32 ligado por 30 segundos
2. Observe Serial Monitor

### Resultado esperado (a cada 30s):

```
💓 Heartbeat enviado | Pulsos totais: 0 | Sinal Wi-Fi: -52 dBm | Uptime: 0min ✓
```

Após 1 minuto:

```
💓 Heartbeat enviado | Pulsos totais: 0 | Sinal Wi-Fi: -52 dBm | Uptime: 1min ✓
```

### Se não enviar:

**Soluções:**
```
1. Verifique se Wi-Fi está conectado
2. Confirme URL de heartbeat em HEARTBEAT_URL
3. Verifique logs do servidor
4. Teste endpoint com Postman
```

---

## 🔧 Troubleshooting Avançado

### Problema: Pulsos Duplicados

**Sintomas:**
```
📊 Pulso detectado #1
📊 Pulso detectado #1  ← Repetido imediatamente
```

**Causa:** Ruído no sensor ou debounce insuficiente

**Solução:**
```cpp
// Aumentar debounce de 100ms para 150ms
#define DEBOUNCE_DELAY_MS 150
```

Ou adicionar capacitor de 100nF entre GPIO32 e GND.

---

### Problema: Perdendo Pulsos

**Sintomas:**
```
📊 Pulso detectado #1
📊 Pulso detectado #3  ← Pulso #2 desapareceu!
```

**Causa:** 
- Interrupção não ativada corretamente
- GPIO32 com conflito com outro componente
- Código travando em alguma função

**Solução:**
```cpp
// 1. Verificar GPIO32 está livre (não usar para outra coisa)
// 2. Adicionar debug na interrupção
void IRAM_ATTR handleSensorPulse() {
  Serial.println("INT FIRED!");  // Debug
  // ...
}

// 3. Usar GPIO diferente se necessário (ex: GPIO14)
#define SENSOR_PIN 14
```

---

### Problema: Travamentos Aleatórios

**Sintomas:**
```
✓ Sistema pronto!
📊 Pulso detectado #1
📤 Enviando pulso #1...
[TELA CONGELA]
```

**Causa:** Falta de RAM ou deadlock em HTTPClient

**Solução:**
```cpp
// 1. Adicionar watchdog
#include <esp_task_wdt.h>

void setup() {
  esp_task_wdt_init(10, true);  // 10 segundos de timeout
  esp_task_wdt_add(NULL);
}

void loop() {
  esp_task_wdt_reset();  // Resetar watchdog
  // ...
}

// 2. Limitar tamanho de buffers JSON
#define JSON_BUFFER_SIZE 256
```

---

### Problema: Não Reconecta Wi-Fi

**Sintomas:**
```
⚠️  Wi-Fi desconectado! Modo OFFLINE ativado.
🔄 Reconectando Wi-Fi...
[ESPERA INFINITA]
```

**Causa:** Roteador desligado ou fora de alcance

**Solução:**
```cpp
// Ajustar timeout de reconexão
#define WIFI_RECONNECT_INTERVAL_S 5  // Tentar a cada 5 segundos

// Adicionar log de tentativas
void checkWifiConnection() {
  static int attempts = 0;
  if (WiFi.status() != WL_CONNECTED) {
    attempts++;
    Serial.print("Tentativa #");
    Serial.println(attempts);
    WiFi.reconnect();
  }
}
```

---

### Problema: LittleFS Cheio

**Sintomas:**
```
💾 Evento salvo offline... 
[SEM RESPOSTA]
❌ Erro ao salvar evento offline!
```

**Causa:** Fila offline cresceu muito (sem reconexão)

**Solução:**
1. Reconectar Wi-Fi para sincronizar
2. Limpar manualmente via Serial:

```cpp
// Adicionar em setup()
if (Serial.available()) {
  char cmd = Serial.read();
  if (cmd == 'f') {
    LittleFS.format();
    Serial.println("LittleFS formatado!");
  }
}

// No Serial Monitor, digitar: f
```

---

## 📊 Exemplo de Teste Completo (30 minutos)

```
00:00 - Inicializar sistema
        ✓ Wi-Fi conectado
        ✓ Sensor pronto
        ✓ API respondendo

00:05 - Gerar 5 pulsos
        ✓ 5 eventos enviados
        ✓ Heartbeat OK

00:10 - Desconectar Wi-Fi
        ⚠️  Modo offline
        Gerar 5 pulsos
        ✓ 5 eventos salvos em LittleFS

00:20 - Reconectar Wi-Fi
        ✓ Sincronização automática
        ✓ 5 eventos reprocessados

00:25 - Verificar banco de dados
        SELECT COUNT(*) FROM sensor_events;
        → Resultado: 10 (5 + 5 do offline)

00:30 - Status final
        ✓ Sistema estável
        ✓ Todos os eventos registrados
        ✓ Pronto para produção
```

---

## 🔍 Debug com Serial Monitor

### Comando: Listar eventos offline

Adicione ao loop():
```cpp
if (Serial.available()) {
  char cmd = Serial.read();
  if (cmd == 'l') listOfflineEvents();
  if (cmd == 'd') diagnosticSystem();
  if (cmd == 'f') LittleFS.format();
}
```

Comandos:
- `l` → Listar eventos
- `d` → Diagnóstico
- `f` → Formatar LittleFS

---

## 📈 Monitoramento em Produção

### Criar dashboard para:

1. **Pulsos por hora**
```sql
SELECT 
  DATE_FORMAT(timestamp_original, '%Y-%m-%d %H:00:00') as hora,
  COUNT(*) as total_pulsos
FROM sensor_events
GROUP BY hora
ORDER BY hora DESC
LIMIT 24;
```

2. **Status de sensores**
```sql
SELECT 
  esp32_id,
  machine_id,
  status,
  wifi_signal,
  uptime,
  last_heartbeat,
  TIMEDIFF(NOW(), last_heartbeat) as tempo_sem_heartbeat
FROM sensor_status
ORDER BY last_heartbeat DESC;
```

3. **Alertas**
```sql
-- Sensores offline
SELECT * FROM sensor_status 
WHERE TIMEDIFF(NOW(), last_heartbeat) > '00:02:00'
AND status = 'offline';

-- Sinal fraco
SELECT * FROM sensor_status 
WHERE wifi_signal < -70;
```

---

## ✅ Checklist Final

- [ ] Teste 1: Wi-Fi conecta
- [ ] Teste 2: Pulso detecta
- [ ] Teste 3: API recebe
- [ ] Teste 4: Modo offline funciona
- [ ] Teste 5: Heartbeat envia
- [ ] Serial Monitor mostra logs claros
- [ ] LittleFS funciona
- [ ] Reconexão automática OK
- [ ] Sem travamentos
- [ ] Sem pulsos perdidos
- [ ] Pronto para produção ✓

---

**Versão:** 1.0  
**Data:** 2026-05-21  
**Status:** ✓ Validado

