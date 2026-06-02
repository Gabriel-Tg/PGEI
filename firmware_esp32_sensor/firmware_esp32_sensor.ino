/*
================================================================================
  ESP32 - ARGOS / PGEI DEBUG VERSION
  Produção + Parada de Máquina + Status em Tempo Real
================================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

// ================================================================================
// CONFIGURAÇÕES
// ================================================================================

const char* WIFI_SSID = "Unifique 2930";
const char* WIFI_PASSWORD = "Savanti077";

const char* API_URL = "https://app.techargos.com.br/api/sensor/pulse";
const char* HEARTBEAT_URL = "https://app.techargos.com.br/api/sensor/heartbeat";
const char* STATUS_URL = "https://app.techargos.com.br/api/sensor/status";

const char* SENSOR_TOKEN = "token123";

const char* MACHINE_ID = "P3";
const char* ESP32_ID = "argos_box_1";

// ================================================================================
// HARDWARE
// ================================================================================

#define SENSOR_PIN 32
#define STOP_PIN 26

#define BAUD_RATE 115200
#define PRODUCTION_LOCK_MS 3000

// ================================================================================
// CONTROLE
// ================================================================================

volatile unsigned long lastPulse = 0;
volatile uint32_t pulseQueue = 0;
volatile bool pulseFlag = false;
volatile bool machineRunningISR = true;

bool wifiOK = false;
bool machineStopped = false;
bool lastMachineStopped = false;

unsigned long lastHeartbeat = 0;
unsigned long lastStatusChange = 0;

// ================================================================================
// PROTÓTIPOS
// ================================================================================

void connectWifi();
void processPulse();
void sendHeartbeat();
void sendMachineStatus(const char* status);

// ================================================================================
// ISR SENSOR
// ================================================================================

void IRAM_ATTR handleSensorPulse() {

  if (!machineRunningISR)
    return;

  unsigned long now = millis();

  if (now - lastPulse < PRODUCTION_LOCK_MS)
    return;

  lastPulse = now;

  pulseQueue = 1;
  pulseFlag = true;
}

// ================================================================================
// SETUP
// ================================================================================

void setup() {

  Serial.begin(BAUD_RATE);
  delay(1000);

  Serial.println("\n==============================");
  Serial.println(" ARGOS ESP32 DEBUG START ");
  Serial.println("==============================");

  pinMode(SENSOR_PIN, INPUT_PULLUP);
  pinMode(STOP_PIN, INPUT_PULLUP);

  attachInterrupt(
    digitalPinToInterrupt(SENSOR_PIN),
    handleSensorPulse,
    FALLING
  );

  machineStopped = (digitalRead(STOP_PIN) == LOW);
  lastMachineStopped = machineStopped;
  machineRunningISR = !machineStopped;

  connectWifi();

  Serial.println("Sistema pronto!\n");
}

// ================================================================================
// LOOP
// ================================================================================

void loop() {

  static unsigned long lastDebug = 0;
  unsigned long now = millis();

  machineStopped = (digitalRead(STOP_PIN) == LOW);
  machineRunningISR = !machineStopped;

  if (
      machineStopped != lastMachineStopped &&
      millis() - lastStatusChange > 500
     ) {

    if (machineStopped) {

      Serial.println("🛑 MÁQUINA PARADA");
      sendMachineStatus("stopped");

      noInterrupts();
      pulseQueue = 0;
      pulseFlag = false;
      interrupts();

    } else {

      Serial.println("▶ MÁQUINA OPERANDO");
      sendMachineStatus("running");
    }

    lastStatusChange = millis();
    lastMachineStopped = machineStopped;
  }

  if (now - lastDebug > 1000) {

    lastDebug = now;

    Serial.print("⏱ RUNNING | ");
    Serial.print("WiFi: ");
    Serial.print(WiFi.status() == WL_CONNECTED ? "ON" : "OFF");

    Serial.print(" | RSSI: ");
    Serial.print(WiFi.RSSI());

    Serial.print(" | Status: ");
    Serial.print(machineStopped ? "PARADA" : "RODANDO");

    Serial.print(" | Fila: ");
    Serial.println(pulseQueue);
  }

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("⚠ WiFi caiu, reconectando...");

    WiFi.reconnect();

    delay(1000);
    return;
  }

  if (!machineStopped && (pulseFlag || pulseQueue > 0)) {

    pulseFlag = false;

    Serial.println("📥 Pulso detectado!");
    processPulse();
  }

  if (millis() - lastHeartbeat > 10000) {

    lastHeartbeat = millis();

    Serial.println("💓 Enviando heartbeat...");
    sendHeartbeat();
  }

  delay(50);
}

// ================================================================================
// WIFI
// ================================================================================

void connectWifi() {

  Serial.print("Conectando WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int count = 0;

  while (WiFi.status() != WL_CONNECTED && count < 20) {

    Serial.print(".");
    delay(500);
    count++;
  }

  if (WiFi.status() == WL_CONNECTED) {

    wifiOK = true;

    Serial.println("\n✓ WiFi OK");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

  } else {

    wifiOK = false;
    Serial.println("\n❌ WiFi falhou");
  }
}

// ================================================================================
// PROCESSAR PULSOS
// ================================================================================

void processPulse() {

  noInterrupts();

  uint32_t pulses = pulseQueue;
  pulseQueue = 0;

  interrupts();

  if (pulses == 0)
    return;

  Serial.print("📤 Enviando pulso: ");
  Serial.println(pulses);

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(5000);

  if (!http.begin(client, API_URL)) {

    Serial.println("❌ HTTP begin falhou");
    return;
  }

  StaticJsonDocument<256> doc;

  doc["machine_id"] = MACHINE_ID;
  doc["esp32_id"] = ESP32_ID;
  doc["pulse_count"] = pulses;

  String json;
  serializeJson(doc, json);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-token", SENSOR_TOKEN);

  int code = http.POST(json);

  if (code > 0) {

    Serial.print("✓ HTTP ");
    Serial.println(code);

  } else {

    Serial.print("❌ Erro HTTP: ");
    Serial.println(code);
  }

  http.end();
}

// ================================================================================
// STATUS IMEDIATO
// ================================================================================

void sendMachineStatus(const char* status) {

  if (WiFi.status() != WL_CONNECTED)
    return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(5000);

  if (!http.begin(client, STATUS_URL)) {

    Serial.println("❌ Status HTTP begin falhou");
    return;
  }

  StaticJsonDocument<256> doc;

  doc["machine_id"] = MACHINE_ID;
  doc["esp32_id"] = ESP32_ID;
  doc["status"] = status;

  String json;
  serializeJson(doc, json);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-token", SENSOR_TOKEN);

  int code = http.POST(json);

  if (code > 0) {

    Serial.print("✓ Status HTTP ");
    Serial.println(code);

  } else {

    Serial.print("❌ Status erro: ");
    Serial.println(code);
  }

  http.end();
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

    Serial.println("❌ Heartbeat fail");
    return;
  }

  StaticJsonDocument<256> doc;

  doc["esp32_id"] = ESP32_ID;
  doc["machine_id"] = MACHINE_ID;
  doc["status"] = "online";
  doc["machine_status"] = machineStopped ? "stopped" : "running";
  doc["wifi"] = WiFi.RSSI();
  doc["pulses"] = pulseQueue;

  String json;
  serializeJson(doc, json);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-sensor-token", SENSOR_TOKEN);

  int code = http.POST(json);

  if (code > 0) {

    Serial.println("💓 Heartbeat OK");

  } else {

    Serial.print("❌ Heartbeat erro: ");
    Serial.println(code);
  }

  http.end();
}
