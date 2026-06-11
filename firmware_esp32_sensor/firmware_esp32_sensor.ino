/*
================================================================================
  ESP32 - ARGOS / PGEI PRODUÇÃO | COLETOR DE EVENTOS
  Apenas pulso de produção INDIVIDUAL com timestamp UTC enviado
  Lógica de parada, OEE etc. feita NO BACKEND (NÃO mais no firmware)
================================================================================
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <time.h>

// ================================================================================
// CONFIGURAÇÕES
// ================================================================================

#define FIRMWARE_VERSION "2.0.0"

const char* WIFI_SSID     = "Unifique 2930";
const char* WIFI_PASSWORD = "Savanti077";

const char* API_URL        = "https://app.techargos.com.br/api/sensor/pulse";
const char* HEARTBEAT_URL  = "https://app.techargos.com.br/api/sensor/heartbeat";
const char* SENSOR_TOKEN   = "inj04";

const char* MACHINE_ID    = "I4";
const char* ESP32_ID      = "argos_inj_04";

// OTA
const char* OTA_PASSWORD = "otasavanti";

// ================================================================================
// HARDWARE E TEMPOS
// ================================================================================

#define SENSOR_PIN 32
#define BAUD_RATE 115200
#define PRODUCTION_LOCK_MS 3000 // Debounce industrial

#define EVENT_QUEUE_SIZE 500

// ================================================================================
// ESTRUTURAS E FILA CIRCULAR
// ================================================================================

struct PulseEvent {
  uint64_t timestamp;
};
PulseEvent eventQueue[EVENT_QUEUE_SIZE];
volatile uint16_t queueHead = 0;
volatile uint16_t queueTail = 0;
volatile uint16_t queueCount = 0;

// ================================================================================
// PROTÓTIPOS
// ================================================================================

void connectWifi();
void reconnectWifiIfNeeded();
void setupOTA();
void setupTime();
bool isTimeValid();
bool enqueueEvent(uint64_t ts);
bool enqueueEventFromIsr(uint64_t ts);
bool dequeueEvent(PulseEvent &evt);
void handleSensorPulse();
void processEvents();
void sendHeartbeat();
void logQueueState();
long getUnixTimeSafe();
int eventsInQueue();
bool isQueueFull();
bool isQueueEmpty();

// ================================================================================
// TIME/NTP
// ================================================================================

void setupTime() {
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov"); // Fuso horário: Brasilia/UTC-3
  Serial.print("Sincronizando horário NTP... ");
  for (int i = 0; i < 20; i++) {
    time_t now = time(nullptr);
    if (now > 1680000000UL) { // Alguma data razoável em 2023+
      Serial.println("✓ OK");
      struct tm tm;
      localtime_r(&now, &tm);
      Serial.printf("Tempo atual: %04d-%02d-%02d %02d:%02d:%02d\n",
        tm.tm_year+1900, tm.tm_mon+1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);
      return;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println("Falha NTP, prosseguindo mesmo assim.");
}

bool isTimeValid() {
  return time(nullptr) > 1680000000UL;
}

long getUnixTimeSafe() {
  time_t now = time(nullptr);
  if (isTimeValid()) return now;
  return 0;
}

// ================================================================================
// OTA
// ================================================================================

void setupOTA() {
  ArduinoOTA.setHostname(ESP32_ID);
  ArduinoOTA.setPassword(OTA_PASSWORD);

  ArduinoOTA
    .onStart([]() {
      Serial.println("[OTA] Início do upload...");
    })
    .onEnd([]() {
      Serial.println("[OTA] Upload finalizado.");
    })
    .onProgress([](unsigned int progress, unsigned int total) {
      Serial.printf("[OTA] Progresso: %u%%\r", (progress * 100) / total);
    })
    .onError([](ota_error_t error) {
      Serial.printf("[OTA] Erro[%u]: ", error);
      if (error == OTA_AUTH_ERROR) Serial.println("Falha Autenticação");
      else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
      else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
      else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
      else if (error == OTA_END_ERROR) Serial.println("End Failed");
    });

  ArduinoOTA.begin();
  Serial.println("OTA iniciado.");
}

// ================================================================================
// SETUP
// ================================================================================

void setup() {
  Serial.begin(BAUD_RATE);
  delay(1000);

  Serial.println("\n=========================================");
  Serial.println(" ARGOS ESP32 PRODUCAO - VERSAO 2.0.0");
  Serial.println("=========================================");

  pinMode(SENSOR_PIN, INPUT_PULLUP);

  attachInterrupt(
    digitalPinToInterrupt(SENSOR_PIN),
    handleSensorPulse,
    FALLING
  );

  connectWifi();

  setupOTA();
  setupTime();

  Serial.println("Sistema pronto!\n");
}

// ================================================================================
// LOOP
// ================================================================================

void loop() {
  static unsigned long lastHeartbeat = 0;
  static unsigned long lastLog = 0;

  ArduinoOTA.handle();

  reconnectWifiIfNeeded();

  if (WiFi.status() == WL_CONNECTED) {
    processEvents();
  }

  unsigned long now = millis();
  if (now - lastHeartbeat > 10000) {
    lastHeartbeat = now;
    sendHeartbeat();
  }

  if (now - lastLog > 3000) {
    lastLog = now;
    logQueueState();
  }

  delay(20);
}

// ================================================================================
// INTERRUPÇÃO DO SENSOR
// ================================================================================

void IRAM_ATTR handleSensorPulse() {
  static unsigned long lastISR = 0;
  unsigned long now = millis();
  if (now - lastISR < PRODUCTION_LOCK_MS) return;
  lastISR = now;

  uint64_t t = (uint64_t)time(nullptr);
  if (!isTimeValid()) t = 0;

  // Prepara dados na RAM de forma segura para o core principal processar:
  enqueueEventFromIsr(t);
}

// ================================================================================
// FILA CIRCULAR DE EVENTOS
// ================================================================================

bool enqueueEvent(uint64_t ts) {
  bool queued = false;
  noInterrupts();
  if (queueCount < EVENT_QUEUE_SIZE) {
    eventQueue[queueHead].timestamp = ts;
    queueHead = (queueHead+1) % EVENT_QUEUE_SIZE;
    queueCount++;
    queued = true;
  }
  interrupts();
  return queued;
}
bool IRAM_ATTR enqueueEventFromIsr(uint64_t ts) {
  if (queueCount >= EVENT_QUEUE_SIZE) return false;
  eventQueue[queueHead].timestamp = ts;
  queueHead = (queueHead+1) % EVENT_QUEUE_SIZE;
  queueCount++;
  return true;
}
bool isQueueFull() {
  return queueCount >= EVENT_QUEUE_SIZE;
}
bool isQueueEmpty() {
  return queueCount == 0;
}
int eventsInQueue() {
  return queueCount;
}
bool dequeueEvent(PulseEvent &evt) {
  if (isQueueEmpty()) return false;
  evt = eventQueue[queueTail];
  queueTail = (queueTail+1) % EVENT_QUEUE_SIZE;
  noInterrupts(); queueCount--; interrupts();
  return true;
}
void logQueueState() {
  Serial.printf("[Fila] Eventos aguardando envio: %d\n", eventsInQueue());
  if (isQueueFull()) Serial.println("[Fila] ATENÇÃO: Fila cheia! Dados antigos podem ser sobrescritos.");
}

// ================================================================================
// WIFI
// ================================================================================

void connectWifi() {
  Serial.printf("Conectando WiFi (%s)...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500); Serial.print(".");
    retry++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi conectado!");
    Serial.print("IP: "); Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Falha WiFi.");
  }
}
void reconnectWifiIfNeeded() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Desconectado, tentando reconectar...");
    WiFi.disconnect();
    WiFi.reconnect();
    delay(1000);
  }
}

// ================================================================================
// ENVIO E PROCESSO DE EVENTOS
// ================================================================================

void processEvents() {
  PulseEvent evt;
  while (WiFi.status() == WL_CONNECTED && !isQueueEmpty()) {
    if (!dequeueEvent(evt)) break;
    if (evt.timestamp == 0) evt.timestamp = (uint64_t)time(nullptr);
    if (!isTimeValid()) {
      // Falha NTP, re-insere evento na fila
      enqueueEvent(evt.timestamp);
      break;
    }

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    http.setTimeout(8000);

    if (!http.begin(client, API_URL)) {
      Serial.println("❌ [Evento] HTTP begin falhou");
      enqueueEvent(evt.timestamp);
      delay(1000);
      break;
    }

    String eventUid = String(ESP32_ID) + "-" + String((unsigned long)evt.timestamp);

    StaticJsonDocument<384> doc;
    doc["machine_id"] = MACHINE_ID;
    doc["esp32_id"] = ESP32_ID;
    doc["pulse_count"] = 1;
    doc["timestamp"] = (unsigned long)evt.timestamp;
    doc["event_uid"] = eventUid;

    String json;
    serializeJson(doc, json);

    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-sensor-token", SENSOR_TOKEN);

    int code = http.POST(json);

    if (code >= 200 && code < 300) {
      Serial.printf("✓ [Evento] Enviado: ts=%llu | event_uid=%s | code=%d\n", evt.timestamp, eventUid.c_str(), code);
    } else {
      String response = http.getString();
      Serial.printf("❌ [Evento] Falha envio | HTTP=%d | Resp=%s | Reinserindo fila\n", code, response.c_str());
      if (!enqueueEvent(evt.timestamp)) {
        Serial.println("❌ [Evento] Fila cheia, não foi possível reinserir evento");
      }
      http.end();
      delay(2000);
      break;
    }

    http.end();
    delay(20); // Ameniza flood em caso de reconexão
  }
}

// ================================================================================
// HEARTBEAT
// ================================================================================

void sendHeartbeat() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(5000);

  if (!http.begin(client, HEARTBEAT_URL)) {
    Serial.println("❌ Heartbeat HTTP begin falhou");
    return;
  }

  StaticJsonDocument<256> doc;
  doc["esp32_id"] = ESP32_ID;
  doc["machine_id"] = MACHINE_ID;
  doc["status"] = "online";
  doc["firmware"] = FIRMWARE_VERSION;
  doc["signal_rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  doc["queued_events"] = eventsInQueue();

  String json;
  serializeJson(doc, json);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-token", SENSOR_TOKEN);

  int code = http.POST(json);
  if (code >= 200 && code < 300) {
    Serial.println("💓 [Heartbeat] OK");
  } else {
    Serial.printf("❌ [Heartbeat] Erro HTTP: %d\n", code);
  }
  http.end();
}