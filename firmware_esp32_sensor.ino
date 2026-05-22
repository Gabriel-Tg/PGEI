/*
================================================================================
  FIRMWARE ESP32 - SISTEMA INDUSTRIAL PGEI
  Leitura de Sensor Indutivo com Fila Offline e Sincronização Automática
  
  Versão: 1.0
  Data: 2026-05-21
  Compatibilidade: ESP32 Dev Module com Arduino IDE
================================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <time.h>

// ================================================================================
//  ⚠️  CONFIGURAÇÕES OBRIGATÓRIAS - ALTERE ANTES DE USAR
// ================================================================================

// Wi-Fi
const char* WIFI_SSID = "ALTERAR_AQUI_NOME_WIFI";
const char* WIFI_PASSWORD = "ALTERAR_AQUI_SENHA_WIFI";

// API
const char* API_URL = "https://app.techargos.com.br/api/sensor/pulse";
const char* HEARTBEAT_URL = "https://app.techargos.com.br/api/sensor/heartbeat";
const char* SENSOR_TOKEN = "ALTERAR_AQUI_TOKEN_SENSOR";

// Máquina e Identificação
const char* MACHINE_ID = "ALTERAR_AQUI_MAQUINA_ID";  // Ex: "MAQUINA_001"
const char* ESP32_ID = "ALTERAR_AQUI_ESP32_ID";      // Ex: "ESP32_01"

// ================================================================================
//  CONFIGURAÇÕES DE HARDWARE
// ================================================================================

#define SENSOR_PIN 32           // GPIO32 - entrada do sensor indutivo
#define BAUD_RATE 115200        // Serial Monitor
#define DEBOUNCE_DELAY_MS 30    // Debounce do sensor (reduzido para não perder ciclos rápidos)

// ================================================================================
//  CONFIGURAÇÕES DE REDE E API
// ================================================================================

#define HTTP_TIMEOUT_MS 10000           // Timeout para requisições HTTP
#define MAX_RETRIES 3                   // Tentativas de reenvio
#define HEARTBEAT_INTERVAL_S 30         // Heartbeat a cada 30 segundos
#define WIFI_RECONNECT_INTERVAL_S 10    // Tentar reconectar a cada 10 segundos
#define PROCESS_QUEUE_INTERVAL_S 5      // Processar fila offline a cada 5 segundos

// ================================================================================
//  VARIÁVEIS GLOBAIS
// ================================================================================

// ISR - Apenas variáveis críticas
volatile unsigned long lastPulseTime = 0;
volatile uint32_t pulseQueue = 0;  // Fila de pulsos pendentes
volatile bool pulseDetected = false;

// Loop principal
unsigned long lastHeartbeatTime = 0;
unsigned long lastWifiCheckTime = 0;
unsigned long lastQueueProcessTime = 0;
unsigned long lastSendTime = 0;
unsigned long pulseCount = 0;  // Contador total de pulsos processados
bool wifiConnected = false;
bool systemInitialized = false;

// ================================================================================
//  ESTRUTURAS DE DADOS
// ================================================================================

struct OfflineEvent {
  unsigned long timestamp;
  uint32_t pulseCount;
  String eventId;
};

// ================================================================================
//  SETUP - EXECUTA UMA VEZ NA INICIALIZAÇÃO
// ================================================================================

void setup() {
  // Serial Monitor
  Serial.begin(BAUD_RATE);
  delay(1000);
  
  Serial.println("\n\n================================================================================");
  Serial.println("  FIRMWARE ESP32 - SISTEMA INDUSTRIAL PGEI v1.0");
  Serial.println("================================================================================");
  Serial.print("  Machine ID: "); Serial.println(MACHINE_ID);
  Serial.print("  ESP32 ID: "); Serial.println(ESP32_ID);
  Serial.println("================================================================================\n");
  
  // Inicializar LittleFS
  if (!LittleFS.begin(true)) {
    Serial.println("❌ ERRO: Falha ao inicializar LittleFS!");
    return;
  }
  Serial.println("✓ LittleFS inicializado");
  
  // Configurar pino do sensor com PULLUP (compatível com NPN/PC817)
  pinMode(SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), handleSensorPulse, FALLING);
  Serial.println("✓ Sensor configurado (GPIO32 - PULLUP - FALLING edge)");
  
  // Sincronizar hora com NTP
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("✓ Sincronizando hora com NTP...");
  
  // Conectar Wi-Fi
  connectWifi();
  
  systemInitialized = true;
  Serial.println("\n✓ Sistema pronto!\n");
}

// ================================================================================
//  LOOP PRINCIPAL
// ================================================================================

void loop() {
  unsigned long currentTime = millis() / 1000;  // Tempo em segundos
  
  // Verificar e reconectar Wi-Fi
  if (currentTime - lastWifiCheckTime >= WIFI_RECONNECT_INTERVAL_S) {
    lastWifiCheckTime = currentTime;
    checkWifiConnection();
  }
  
  // Processar fila de pulsos (PRIORIDADE ALTA)
  if (pulseDetected || pulseQueue > 0) {
    pulseDetected = false;  // Limpar flag
    if (wifiConnected) {
      processPulseQueue();
    }
  }
  
  // Enviar heartbeat periodicamente
  if (wifiConnected && (currentTime - lastHeartbeatTime >= HEARTBEAT_INTERVAL_S)) {
    lastHeartbeatTime = currentTime;
    sendHeartbeat();
  }
  
  // Processar fila offline (sincronizar eventos que falharam)
  if (wifiConnected && (currentTime - lastQueueProcessTime >= PROCESS_QUEUE_INTERVAL_S)) {
    lastQueueProcessTime = currentTime;
    processOfflineQueue();
  }
  
  delay(50);  // Pausa reduzida para responsividade melhor
}

// ================================================================================
//  INTERRUPÇÃO DO SENSOR - ISR OTIMIZADA (apenas incrementa fila)
// ================================================================================

void IRAM_ATTR handleSensorPulse() {
  unsigned long currentTime = millis();
  
  // Debounce simples
  if (currentTime - lastPulseTime < DEBOUNCE_DELAY_MS) {
    return;
  }
  
  lastPulseTime = currentTime;
  
  // APENAS incrementar fila - nada mais!
  pulseQueue++;  // Contar pulsos neste evento
  pulseDetected = true;  // Sinalizar que há pulsos para processar
  
  // NÃO faça aqui:
  // - Serial.print / Serial.println
  // - HTTP requests
  // - LittleFS operations
  // - String concatenation
  // - Qualquer operação pesada
}

// ================================================================================
//  CONECTAR Wi-Fi
// ================================================================================

void connectWifi() {
  Serial.print("\n🌐 Conectando ao Wi-Fi");
  Serial.print(" SSID: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  int maxAttempts = 20;
  
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    Serial.print(".");
    delay(500);
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println(" ✓");
    Serial.print("✓ WiFi conectado!");
    Serial.print(" | IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("✓ Sinal Wi-Fi: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm\n");
    
    // Sincronizar hora quando conectado
    time_t now = time(nullptr);
    while (now < 24 * 3600 * 2) {
      delay(100);
      now = time(nullptr);
    }
  } else {
    wifiConnected = false;
    Serial.println(" ❌");
    Serial.println("❌ Falha ao conectar Wi-Fi. Funcionando modo OFFLINE.\n");
  }
}

// ================================================================================
//  VERIFICAR E RECONECTAR Wi-Fi
// ================================================================================

void checkWifiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      Serial.println("\n⚠️  Wi-Fi desconectado! Modo OFFLINE ativado.");
      wifiConnected = false;
    }
    
    // Tentar reconectar
    Serial.print("🔄 Reconectando Wi-Fi...");
    WiFi.reconnect();
    delay(2000);
    
    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      Serial.println(" ✓");
      Serial.print("✓ WiFi restaurado!");
      Serial.print(" | IP: ");
      Serial.println(WiFi.localIP());
      Serial.print("✓ Sinal Wi-Fi: ");
      Serial.print(WiFi.RSSI());
      Serial.println(" dBm\n");
    }
  }
}

// ================================================================================
//  PROCESSAR FILA DE PULSOS (chamado do loop principal)
// ================================================================================

void processPulseQueue() {
  if (pulseQueue == 0) return;
  
  uint32_t pulsesToSend = pulseQueue;
  pulseQueue = 0;  // Limpar fila
  
  Serial.print("📊 Processando pulsos: #");
  Serial.println(pulsesToSend);
  
  // Enviar pulsos para API
  if (!sendPulse(pulsesToSend)) {
    // Se falhar, salvar offline
    saveOfflineEvent(pulsesToSend);
  } else {
    // Incrementar contador de sucesso
    pulseCount += pulsesToSend;
  }
}

// ================================================================================
//  ENVIAR PULSO PARA API (fora da ISR)
// ================================================================================

bool sendPulse(uint32_t pulse) {
  if (!wifiConnected) {
    return false;  // Deixar para a fila offline
  }
  
  // Gerar event_id único
  String eventId = generateEventId();
  
  // Criar JSON
  DynamicJsonDocument doc(256);
  doc["machine_id"] = MACHINE_ID;
  doc["esp32_id"] = ESP32_ID;
  doc["pulse_count"] = pulse;
  doc["timestamp"] = getFormattedTimestamp(millis());
  doc["event_id"] = eventId;
  
  // Serializar JSON
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Enviar para API com SSL seguro
  WiFiClientSecure client;
  client.setInsecure();  // ESP32: aceitar certificados auto-assinados
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  
  if (!http.begin(client, API_URL)) {
    Serial.println("❌ Erro ao inicializar HTTPClient");
    return false;
  }
  
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-token", SENSOR_TOKEN);
  
  Serial.print("📤 Enviando pulso #");
  Serial.print(pulse);
  Serial.print(" para API...");
  
  int httpCode = http.POST(jsonString);
  
  if (httpCode == 200 || httpCode == 201) {
    Serial.println(" ✓");
    Serial.print("   Resposta: ");
    Serial.println(http.getString());
    http.end();
    return true;
  } else {
    Serial.println(" ❌");
    Serial.print("   Erro HTTP: ");
    Serial.print(httpCode);
    Serial.print(" - ");
    Serial.println(http.getString());
    http.end();
    return false;
  }
}

// ================================================================================
//  SALVAR EVENTO OFFLINE
// ================================================================================

void saveOfflineEvent(uint32_t pulse) {
  String eventId = generateEventId();
  String filename = "/events_" + String(millis() % 1000000) + ".json";
  
  DynamicJsonDocument doc(256);
  doc["machine_id"] = MACHINE_ID;
  doc["esp32_id"] = ESP32_ID;
  doc["pulse_count"] = pulse;
  doc["timestamp"] = getFormattedTimestamp(millis());
  doc["event_id"] = eventId;
  doc["saved_at"] = millis();
  
  // Salvar em arquivo
  File file = LittleFS.open(filename, "w");
  if (file) {
    serializeJson(doc, file);
    file.close();
    
    Serial.print("💾 Evento salvo offline: ");
    Serial.print(eventId);
    Serial.print(" | Arquivo: ");
    Serial.println(filename);
  } else {
    Serial.println("❌ Erro ao salvar evento offline!");
  }
}

// ================================================================================
//  PROCESSAR FILA OFFLINE
// ================================================================================

void processOfflineQueue() {
  Dir dir = LittleFS.openDir("/");
  int processedCount = 0;
  
  while (dir.next()) {
    String filename = dir.fileName();
    
    // Procurar arquivos de eventos
    if (filename.startsWith("/events_") && filename.endsWith(".json")) {
      File file = LittleFS.open(filename, "r");
      if (file) {
        String content = file.readString();
        file.close();
        
        // Tentar reenviar
        if (retrySendEvent(content)) {
          LittleFS.remove(filename);
          processedCount++;
          Serial.print("✓ Evento offline sincronizado e removido: ");
          Serial.println(filename);
        }
      }
    }
  }
  
  if (processedCount > 0) {
    Serial.print("\n✓ Sincronização concluída! ");
    Serial.print(processedCount);
    Serial.println(" eventos reprocessados.\n");
  }
}

// ================================================================================
//  REENVIAR EVENTO OFFLINE
// ================================================================================

bool retrySendEvent(String jsonString) {
  WiFiClientSecure client;
  client.setInsecure();  // ESP32: aceitar certificados auto-assinados
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  
  if (!http.begin(client, API_URL)) {
    Serial.println("❌ Erro ao inicializar HTTPClient para retry");
    return false;
  }
  
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-token", SENSOR_TOKEN);
  
  Serial.print("📤 Reenviando evento offline...");
  
  int httpCode = http.POST(jsonString);
  
  if (httpCode == 200 || httpCode == 201) {
    Serial.println(" ✓");
    http.end();
    return true;
  } else {
    Serial.println(" ❌");
    Serial.print("   Erro HTTP: ");
    Serial.println(httpCode);
    http.end();
    return false;
  }
}

// ================================================================================
//  ENVIAR HEARTBEAT
// ================================================================================

void sendHeartbeat() {
  if (!wifiConnected) {
    return;
  }
  
  DynamicJsonDocument doc(256);
  doc["esp32_id"] = ESP32_ID;
  doc["machine_id"] = MACHINE_ID;
  doc["uptime"] = millis() / 1000;  // Uptime em segundos
  doc["wifi_signal"] = WiFi.RSSI();
  doc["status"] = "online";
  doc["pulses_total"] = pulseCount;
  doc["timestamp"] = getFormattedTimestamp(millis());
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  WiFiClientSecure client;
  client.setInsecure();  // ESP32: aceitar certificados auto-assinados
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  
  if (!http.begin(client, HEARTBEAT_URL)) {
    Serial.println("❌ Erro ao inicializar HTTPClient para heartbeat");
    return;
  }
  
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-token", SENSOR_TOKEN);
  
  Serial.print("💓 Heartbeat enviado | Pulsos totais: ");
  Serial.print(pulseCount);
  Serial.print(" | Sinal Wi-Fi: ");
  Serial.print(WiFi.RSSI());
  Serial.print(" dBm | Uptime: ");
  Serial.print(millis() / 1000 / 60);
  Serial.print("min");
  
  int httpCode = http.POST(jsonString);
  
  if (httpCode == 200 || httpCode == 201) {
    Serial.println(" ✓");
  } else {
    Serial.println(" ❌");
  }
  
  http.end();
}

// ================================================================================
//  UTILITÁRIOS - GERADOR DE EVENT_ID
// ================================================================================

String generateEventId() {
  static uint32_t counter = 0;
  counter++;
  
  String id = String(ESP32_ID) + "_";
  id += String(millis(), HEX) + "_";
  id += String(counter, HEX);
  
  return id;
}

// ================================================================================
//  UTILITÁRIOS - TIMESTAMP FORMATADO
// ================================================================================

String getFormattedTimestamp(unsigned long ms) {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", timeinfo);
  
  return String(buffer);
}

// ================================================================================
//  UTILITÁRIOS - LISTAR ARQUIVOS NO LITTLEFS
// ================================================================================

void listOfflineEvents() {
  Serial.println("\n📋 Arquivos offline armazenados:");
  
  Dir dir = LittleFS.openDir("/");
  int count = 0;
  
  while (dir.next()) {
    String filename = dir.fileName();
    if (filename.startsWith("/events_")) {
      Serial.print("  - ");
      Serial.println(filename);
      count++;
    }
  }
  
  if (count == 0) {
    Serial.println("  (Nenhum evento pendente)");
  }
  
  Serial.println();
}

// ================================================================================
//  DIAGNOSTICAR SISTEMA
// ================================================================================

void diagnosticSystem() {
  Serial.println("\n================================================================================");
  Serial.println("  DIAGNÓSTICO DO SISTEMA");
  Serial.println("================================================================================");
  
  Serial.print("WiFi Status: ");
  Serial.println(wifiConnected ? "✓ CONECTADO" : "❌ DESCONECTADO");
  
  if (wifiConnected) {
    Serial.print("WiFi SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Sinal Wi-Fi: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  }
  
  Serial.print("Pulsos Detectados: ");
  Serial.println(pulseCount);
  
  Serial.print("Uptime: ");
  unsigned long uptime = millis() / 1000;
  Serial.print(uptime / 3600);
  Serial.print("h ");
  Serial.print((uptime % 3600) / 60);
  Serial.print("m ");
  Serial.print(uptime % 60);
  Serial.println("s");
  
  listOfflineEvents();
  
  Serial.println("================================================================================\n");
}

/*
================================================================================
  OBSERVAÇÕES IMPORTANTES
================================================================================

1. CONFIGURAÇÃO INICIAL:
   - Altere WIFI_SSID e WIFI_PASSWORD
   - Altere API_URL (IP ou domínio do seu servidor)
   - Altere SENSOR_TOKEN
   - Altere MACHINE_ID (identificador da máquina)
   - Altere ESP32_ID (identificador único do módulo)

2. HARDWARE:
   - Sensor indutivo → GPIO32 (com optoacoplador PC817)
   - GND → GND
   - 5V → 5V (ou conforme seu sensor)

3. MONITORAMENTO:
   - Abra Serial Monitor a 115200 baud
   - Todos os eventos são registrados
   - Use diagnosticSystem() para debug

4. MODO OFFLINE:
   - Eventos são salvos automaticamente em LittleFS
   - Reconexão automática a cada 10 segundos
   - Sincronização automática assim que Wi-Fi retorna

5. TROUBLESHOOTING:
   - Verifique logs no Serial Monitor
   - Confirme token e credenciais Wi-Fi
   - Teste conectividade API: POST /api/sensor/pulse
   - Limpe LittleFS se necessário: LittleFS.format()

================================================================================
*/
