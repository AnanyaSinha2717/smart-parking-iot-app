// SMART PARKING SYSTEM - ESP32 + Firebase (app integration)
//
//  * Core 0 runs a cloud task that talks to Firebase Realtime Database over HTTPS,
//    so slow network calls never freeze the LEDs, sensors or the gate servo (core 1).
//  * App bookings are read from the cloud. A booked slot shows a STEADY yellow LED.
//  * Only a driver who tapped "I'm at the gate" in the app gets the BLINKING guide LED.
//  * Walk-ins (no app) get an LCD slot number but no blinking LED, and are never given a booked slot.
//  * Every check-in / check-out is pushed to the cloud (parked/, slots/, sessions/) with a bill.
//
// Libraries: ArduinoJson (v7), LiquidCrystal_I2C, ESP32Servo

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <time.h>

// ---------- CONFIG ----------
const char *ssid = "Nandini";
const char *password = "12345678";

// Firebase Realtime Database URL (no trailing slash) and database secret
// (Project settings > Service accounts > Database secrets)
const char *FB_HOST = "https://smart-parking-8290e-default-rtdb.asia-southeast1.firebasedatabase.app";
const char *FB_SECRET = "czn0xh0lxeKiWDCFiAFkoW2OOcDp4kPpTfB8cVCr";

const uint32_t EARLY_SEC = 10 * 60;                        // booked slot is held this long BEFORE start  (match EARLY_MIN in app)
const uint32_t GRACE_SEC = 15 * 60;                        // ...and released this long AFTER start       (match GRACE_MIN in app)
const uint32_t SOON_SEC = 60 * 60;                         // walk-ins avoid slots booked to start within this time
const unsigned long RESERVE_TIMEOUT = 5UL * 60UL * 1000UL; // guided car must park within 5 min
const bool WALKIN_GUIDE_BLINK = false;                     // true = also blink a guide LED for walk-ins (their slot is never a booked one)

// ---------- EVENTS main loop -> cloud task (defined early so every function can see them) ----------
enum
{
  EV_PARKED = 1,
  EV_LEFT = 2,
  EV_ARRIVAL_USED = 3
};
struct CloudEvent
{
  uint8_t type;
  int idx;
  char bid[28];
  char uid[40];
  uint32_t t0;
  uint32_t t1;
  int rate;
  uint8_t tries;
};

// ---------- HARDWARE ----------
WiFiServer server(80);
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo gateServo;

#define SERVO_PIN 4
int OPEN = 150;
int CLOSED = 90;

#define IR_PIN 23
#define DATA 5
#define CLOCK 18
#define LATCH 19

int trigPins[6] = {13, 14, 27, 26, 25, 33};
int echoPins[6] = {34, 35, 32, 12, 39, 36};
int slotNames[6] = {1, 3, 4, 5, 6, 2}; // sensor index -> slot number shown to users / used in the cloud

int nameToIdx(int name)
{
  for (int i = 0; i < 6; i++)
    if (slotNames[i] == name)
      return i;
  return -1;
}

// ---------- LOCAL STATE (core 1 only) ----------
bool occupied[6];
bool reserved[6]; // a car has been sent to this slot but has not parked yet
bool guide[6];    // blink the LED for that car
int blinkColor[6];
unsigned long leaveTimer[6], parkTimer[6], reservedAt[6];
bool previousIR = HIGH;
bool blinkState = false;
unsigned long previousBlink = 0;
bool lcdIdleShown = false;
int carCounter = 0;

String checkInTime[6], checkOutTime[6];
unsigned long entryMillis[6], parkedDuration[6];

// who is in / heading to each slot
char curBid[6][28]; // booking id ("" for walk-ins)
char curUid[6][40]; // user id or "walkin"
uint32_t sessionStart[6];
int curRate[6];

// ---------- SHARED WITH CLOUD TASK (protected by mtx) ----------
SemaphoreHandle_t mtx;
volatile bool cHold[6]; // slot is held by an app booking right now
volatile bool cSoon[6]; // slot has a booking starting soon
char cBid[6][28];
char cUid[6][40];
int cArrivalIdx = -1; // driver pressed "I'm at the gate"
char cArrivalBid[28];
char cArrivalUid[40];
char usedBid[28];
volatile int cRate = 20; // Rs per hour (refreshed from /lot/ratePerHour)

QueueHandle_t evq;

void sendEvent(uint8_t type, int idx)
{
  CloudEvent e = {};
  e.type = type;
  e.idx = idx;
  strlcpy(e.bid, curBid[idx], sizeof(e.bid));
  strlcpy(e.uid, curUid[idx], sizeof(e.uid));
  e.t0 = sessionStart[idx];
  e.t1 = (uint32_t)time(nullptr);
  e.rate = curRate[idx];
  xQueueSend(evq, &e, 0);
}

// ====================== SENSORS ======================
float getDistance(int trig, int echo)
{
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long duration = pulseIn(echo, HIGH, 30000);
  if (duration == 0)
    return 999;
  return duration * 0.034 / 2;
}

String getCurrentTime()
{
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo))
    return "--:--:--";
  char buffer[10];
  strftime(buffer, sizeof(buffer), "%H:%M:%S", &timeinfo);
  return String(buffer);
}

// Slot priority S1 -> S2 -> S3 -> S6 -> S5 -> S4, skipping anything booked or about to be booked.
int findNextSlot()
{
  int order[6] = {0, 5, 1, 4, 3, 2};
  for (int i = 0; i < 6; i++)
  {
    int idx = order[i];
    if (!occupied[idx] && !reserved[idx] && !cHold[idx] && !cSoon[idx])
      return idx;
  }
  return -1;
}

// ====================== LCD ======================
void displayGrid(int slotNumber)
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("L1 ");
  lcd.print(slotNumber == 3 ? "*" : "3");
  lcd.print(" ");
  lcd.print(slotNumber == 2 ? "*" : "2");
  lcd.print(" ");
  lcd.print(slotNumber == 1 ? "*" : "1");
  lcd.setCursor(0, 1);
  lcd.print("L2 ");
  lcd.print(slotNumber == 4 ? "*" : "4");
  lcd.print(" ");
  lcd.print(slotNumber == 5 ? "*" : "5");
  lcd.print(" ");
  lcd.print(slotNumber == 6 ? "*" : "6");
}

// ====================== LEDs ======================
// Each slot has a green and a red LED on the two shift registers (slot i -> bits 2*(i%3), 2*(i%3)+1).
void setLed(byte &sr1, byte &sr2, int i, bool green, bool red)
{
  byte &sr = (i < 3) ? sr1 : sr2;
  int b = (i % 3) * 2;
  if (green)
    sr |= (1 << b);
  if (red)
    sr |= (1 << (b + 1));
}

void updateLEDs()
{
  if (millis() - previousBlink >= 500)
  {
    previousBlink = millis();
    blinkState = !blinkState;
  }
  byte sr1 = 0, sr2 = 0;
  for (int i = 0; i < 6; i++)
  {
    bool g = false, r = false;
    if (occupied[i])
    {
      r = true; // occupied: solid red
    }
    else if (reserved[i])
    {
      if (guide[i] && blinkState)
      { // guided car: blink its colour
        if (blinkColor[i] == 0)
          g = true;
        else if (blinkColor[i] == 1)
        {
          g = true;
          r = true;
        }
        else
          r = true;
      } // walk-in slot: no blinking
    }
    else if (cHold[i])
    {
      g = true;
      r = true; // booked in the app: STEADY yellow, never blinks
    }
    setLed(sr1, sr2, i, g, r);
  }
  digitalWrite(LATCH, LOW);
  shiftOut(DATA, CLOCK, MSBFIRST, sr2);
  shiftOut(DATA, CLOCK, MSBFIRST, sr1);
  digitalWrite(LATCH, HIGH);
}

// ====================== SLOT SENSING ======================
// Checks ONE slot per call (round robin) so a silent sensor can't stall the servo / LEDs for long.
void checkParkingSensors()
{
  static int next = 0;
  int i = next;
  next = (next + 1) % 6;

  if (reserved[i] && !occupied[i] && millis() - reservedAt[i] > RESERVE_TIMEOUT)
  {
    reserved[i] = false;
    guide[i] = false; // guided car never parked: release
  }

  bool detected = getDistance(trigPins[i], echoPins[i]) <= 6;

  if (!occupied[i])
  {
    if (detected)
    {
      if (parkTimer[i] == 0)
        parkTimer[i] = millis();
      if (millis() - parkTimer[i] > 2000)
      { // car stayed 2 s: it parked
        parkTimer[i] = 0;
        if (!reserved[i])
        { // nobody sent it here: treat as walk-in
          curBid[i][0] = 0;
          strlcpy(curUid[i], "walkin", sizeof(curUid[i]));
        }
        reserved[i] = false;
        guide[i] = false;
        occupied[i] = true;
        checkInTime[i] = getCurrentTime();
        checkOutTime[i] = "";
        entryMillis[i] = millis();
        sessionStart[i] = (uint32_t)time(nullptr);
        curRate[i] = cRate;
        sendEvent(EV_PARKED, i);
        Serial.print("CAR PARKED AT SLOT ");
        Serial.println(slotNames[i]);
      }
    }
    else
    {
      parkTimer[i] = 0;
    }
  }
  else
  {
    if (!detected)
    {
      if (leaveTimer[i] == 0)
        leaveTimer[i] = millis();
      if (millis() - leaveTimer[i] > 2000)
      { // gone for 2 s: it left
        occupied[i] = false;
        leaveTimer[i] = 0;
        parkedDuration[i] = millis() - entryMillis[i];
        checkOutTime[i] = getCurrentTime();
        sendEvent(EV_LEFT, i);
        Serial.print("CAR LEFT SLOT ");
        Serial.println(slotNames[i]);
      }
    }
    else
    {
      leaveTimer[i] = 0;
    }
  }
}

void smartDelay(unsigned long ms)
{
  unsigned long start = millis();
  while (millis() - start < ms)
  {
    updateLEDs();
    checkParkingSensors();
    delay(10);
  }
}

// ====================== GATE ======================
int currentServoAngle = CLOSED;

void moveGateTo(int target)
{
  int step = (currentServoAngle < target) ? 1 : -1;
  while (currentServoAngle != target)
  {
    currentServoAngle += step;
    gateServo.write(currentServoAngle);
    updateLEDs();
    checkParkingSensors();
    delay(15);
  }
}
void openGateGradually() { moveGateTo(OPEN); }
void closeGateFast() { moveGateTo(CLOSED); }

// ====================== FIREBASE (cloud task, core 0) ======================
WiFiClientSecure secureClient;
HTTPClient http;

String fbUrlExtra(const String &path, const String &extra)
{
  return String(FB_HOST) + "/" + path + ".json?auth=" + FB_SECRET + extra;
}
String fbUrl(const String &path)
{
  return fbUrlExtra(path, "");
}

int fbRequestOut(const char *method, const String &url, const String &body, String *out)
{
  if (!http.begin(secureClient, url))
    return -1;
  http.setReuse(true);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest(method, body);
  Serial.printf("FB %s -> %d\n", method, code);
  if (out && code > 0)
    *out = http.getString();
  http.end();
  return code;
}
int fbRequest(const char *method, const String &url, const String &body)
{
  return fbRequestOut(method, url, body, nullptr);
}
bool ok(int c) { return c >= 200 && c < 300; }

bool handleEvent(CloudEvent &e)
{
  int name = slotNames[e.idx];
  String n = String(name), body;

  if (e.type == EV_PARKED)
  {
    JsonDocument d;
    d["slot"] = name;
    d["uid"] = e.uid;
    d["bookingId"] = e.bid;
    d["startSec"] = e.t0;
    serializeJson(d, body);
    if (!ok(fbRequest("PUT", fbUrl("parked/" + n), body)))
      return false;
    fbRequest("PATCH", fbUrl("slots/" + n), "{\"occupied\":true}");
    if (e.bid[0])
    {
      fbRequest("PATCH", fbUrl(String("bookings/") + e.bid),
                String("{\"status\":\"checked_in\",\"checkInSec\":") + e.t0 + "}");
    }
  }
  else if (e.type == EV_LEFT)
  {
    uint32_t dur = (e.t0 && e.t1 > e.t0) ? e.t1 - e.t0 : 0;
    uint32_t hrs = (dur + 3599) / 3600;
    if (hrs < 1)
      hrs = 1; // per-hour rate, minimum one hour
    JsonDocument d;
    d["slot"] = name;
    d["uid"] = e.uid;
    d["bookingId"] = e.bid;
    d["startSec"] = e.t0;
    d["endSec"] = e.t1;
    d["durationSec"] = dur;
    d["rate"] = e.rate;
    d["amount"] = hrs * e.rate;
    serializeJson(d, body);
    if (!ok(fbRequest("POST", fbUrl("sessions"), body)))
      return false;
    fbRequest("DELETE", fbUrl("parked/" + n), "");
    fbRequest("PATCH", fbUrl("slots/" + n), "{\"occupied\":false}");

    if (e.bid[0])
      fbRequest("PATCH", fbUrl(String("bookings/") + e.bid),
                String("{\"status\":\"completed\",\"checkOutSec\":") + e.t1 + "}");
    // free the rest of the booked time window so others can book or park here
    fbRequest("DELETE", fbUrl(String("slotBookings/") + n + "/" + e.bid), "");
  }
}
else if (e.type == EV_ARRIVAL_USED)
{
  fbRequest("DELETE", fbUrl("gate/arrival"), "");
}
return true;
}

void pollCloud()
{
  uint32_t now = (uint32_t)time(nullptr);
  if (now < 1700000000)
    return; // clock not synced yet
  String body;
  static int pollCount = 0;

  // lot rate (every ~30 polls)
  if (pollCount++ % 30 == 0 && fbRequestOut("GET", fbUrl("lot/ratePerHour"), "", &body) == 200)
  {
    int r = body.toInt();
    if (r > 0)
      cRate = r;
  }

  // bookings that have not ended yet
  bool hold[6] = {false}, soon[6] = {false};
  char bid[6][28] = {}, uid[6][40] = {};
  String q = String("&orderBy=%22endSec%22&startAt=") + now;
  int code = fbRequestOut("GET", fbUrlExtra("bookings", q), "", &body);
  if (code != 200)
    return; // keep the last known state if the network hiccups

  JsonDocument doc;
  if (!deserializeJson(doc, body) && doc.is<JsonObject>())
  {
    for (JsonPair kv : doc.as<JsonObject>())
    {
      JsonObject b = kv.value();
      const char *status = b["status"] | "";
      int idx = nameToIdx(b["slot"] | 0);
      if (idx < 0)
        continue;
      uint32_t st = b["startSec"] | 0, en = b["endSec"] | 0;
      bool isHold = false;
      if (!strcmp(status, "confirmed"))
      {
        if (now + EARLY_SEC >= st && now <= st + GRACE_SEC)
          isHold = true;
        else if (st > now && st - now <= SOON_SEC)
          soon[idx] = true;
      }
      else if (!strcmp(status, "arrived") && now <= en)
      {
        isHold = true;
      }
      if (isHold)
      {
        hold[idx] = true;
        strlcpy(bid[idx], kv.key().c_str(), 28);
        strlcpy(uid[idx], b["uid"] | "", 40);
      }
    }
  }

  // "I'm at the gate" request from the app
  int arrIdx = -1;
  char arrBid[28] = "", arrUid[40] = "";
  bool arrivalGone = false;
  if (fbRequestOut("GET", fbUrl("gate/arrival"), "", &body) == 200)
  {
    if (body == "null")
    {
      arrivalGone = true;
    }
    else
    {
      JsonDocument ad;
      if (!deserializeJson(ad, body))
      {
        int idx = nameToIdx(ad["slot"] | 0);
        uint32_t ts = ad["ts"] | 0;
        const char *abid = ad["bookingId"] | "";
        if (idx >= 0 && hold[idx] && !strcmp(bid[idx], abid) && now - ts <= 600)
        {
          arrIdx = idx;
          strlcpy(arrBid, abid, 28);
          strlcpy(arrUid, uid[idx], 40);
        }
      }
    }
  }

  xSemaphoreTake(mtx, portMAX_DELAY);
  for (int i = 0; i < 6; i++)
  {
    cHold[i] = hold[i];
    cSoon[i] = soon[i];
    strlcpy(cBid[i], bid[i], 28);
    strlcpy(cUid[i], uid[i], 40);
  }
  if (arrivalGone)
    usedBid[0] = 0;
  if (arrIdx >= 0 && strcmp(arrBid, usedBid) != 0)
  {
    cArrivalIdx = arrIdx;
    strlcpy(cArrivalBid, arrBid, 28);
    strlcpy(cArrivalUid, arrUid, 40);
  }
  xSemaphoreGive(mtx);
}

void cloudTask(void *)
{
  secureClient.setInsecure(); // no certificate pinning; fine for a project
  for (int i = 0; i < 6; i++)
  { // publish a clean starting state
    String n = String(slotNames[i]);
    fbRequest("PUT", fbUrl("slots/" + n), "{\"occupied\":false}");
    fbRequest("DELETE", fbUrl("parked/" + n), "");
  }
  unsigned long lastPoll = 0;
  for (;;)
  {
    CloudEvent e;
    while (xQueueReceive(evq, &e, 0) == pdTRUE)
    {
      if (!handleEvent(e) && ++e.tries < 10)
      { // network problem: retry later
        xQueueSendToFront(evq, &e, 0);
        vTaskDelay(3000 / portTICK_PERIOD_MS);
        break;
      }
    }
    if (millis() - lastPoll >= 2500)
    {
      lastPoll = millis();
      pollCloud();
    }
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

// ====================== LOCAL STATUS PAGE (optional) ======================
void serveDashboard(WiFiClient &client)
{
  client.readStringUntil('\r');
  client.flush();
  int freeSlots = 0;
  for (int i = 0; i < 6; i++)
    if (!occupied[i])
      freeSlots++;

  String h = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
             "<meta http-equiv='refresh' content='2'><title>IoT Smart Parking</title><style>"
             "body{font-family:Arial;background:#f2f2f2;text-align:center;padding:20px}"
             "table{width:95%;margin:auto;border-collapse:collapse;background:#fff}"
             "th,td{border:1px solid gray;padding:14px;font-size:24px}th{background:#ddd}"
             ".o{color:red;font-weight:bold}.a{color:green;font-weight:bold}.r{color:orange;font-weight:bold}"
             "</style></head><body><h1>IoT Smart Parking System</h1><h2>Total Free: ";
  h += String(freeSlots);
  h += "</h2><table><tr><th>Slot</th><th>Status</th><th>Check-In</th><th>Check-Out</th><th>Duration</th></tr>";
  for (int i = 0; i < 6; i++)
  {
    h += "<tr><td>" + String(slotNames[i]) + "</td><td>";
    if (occupied[i])
      h += "<span class='o'>Occupied</span>";
    else if (reserved[i] || cHold[i])
      h += "<span class='r'>Reserved</span>";
    else
      h += "<span class='a'>Available</span>";
    h += "</td><td>" + (checkInTime[i] != "" ? checkInTime[i] : String("--:--:--")) + "</td>";
    h += "<td>" + (checkOutTime[i] != "" ? checkOutTime[i] : String("--:--:--")) + "</td>";
    unsigned long dur = occupied[i] ? millis() - entryMillis[i] : parkedDuration[i];
    unsigned long s = dur / 1000;
    char buf[15];
    sprintf(buf, "%02lu:%02lu:%02lu", s / 3600, (s % 3600) / 60, s % 60);
    h += "<td>" + String(buf) + "</td></tr>";
  }
  h += "</table></body></html>";
  client.print("HTTP/1.1 200 OK\r\nContent-type:text/html\r\nConnection: close\r\n\r\n");
  client.print(h);
  client.stop();
}

// ====================== SETUP ======================
void setup()
{
  Serial.begin(115200);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  server.begin();

  configTime(19800, 0, "pool.ntp.org"); // IST; time(nullptr) is still UTC epoch
  for (int i = 0; i < 20 && time(nullptr) < 1700000000; i++)
    delay(500);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("SMART PARKING");

  ESP32PWM::allocateTimer(0);
  gateServo.setPeriodHertz(50);
  gateServo.attach(SERVO_PIN, 500, 2400);
  gateServo.write(CLOSED);

  pinMode(IR_PIN, INPUT);
  pinMode(DATA, OUTPUT);
  pinMode(CLOCK, OUTPUT);
  pinMode(LATCH, OUTPUT);

  for (int i = 0; i < 6; i++)
  {
    pinMode(trigPins[i], OUTPUT);
    pinMode(echoPins[i], INPUT);
    occupied[i] = false;
    reserved[i] = false;
    guide[i] = false;
    cHold[i] = false;
    cSoon[i] = false;
    leaveTimer[i] = 0;
    parkTimer[i] = 0;
    checkInTime[i] = "";
    checkOutTime[i] = "";
    parkedDuration[i] = 0;
    curBid[i][0] = 0;
    curUid[i][0] = 0;
    cBid[i][0] = 0;
    cUid[i][0] = 0;
  }

  mtx = xSemaphoreCreateMutex();
  evq = xQueueCreate(16, sizeof(CloudEvent));
  xTaskCreatePinnedToCore(cloudTask, "cloud", 16384, NULL, 1, NULL, 0);
}

// ====================== LOOP ======================
void loop()
{
  updateLEDs();
  checkParkingSensors();

  WiFiClient client = server.available();
  if (client)
    serveDashboard(client);

  // ----- car at the entrance -----
  int irState = digitalRead(IR_PIN);
  if (irState == LOW && previousIR == HIGH)
  {
    int targetIndex = -1;
    bool appUser = false;

    // Did a driver just tap "I'm at the gate" in the app?
    xSemaphoreTake(mtx, portMAX_DELAY);
    if (cArrivalIdx >= 0)
    {
      int ai = cArrivalIdx;
      if (!occupied[ai] && !reserved[ai])
      {
        targetIndex = ai;
        appUser = true;
        strlcpy(curBid[ai], cArrivalBid, sizeof(curBid[ai]));
        strlcpy(curUid[ai], cArrivalUid, sizeof(curUid[ai]));
        strlcpy(usedBid, cArrivalBid, sizeof(usedBid));
      }
      cArrivalIdx = -1;
    }
    xSemaphoreGive(mtx);

    if (appUser)
      sendEvent(EV_ARRIVAL_USED, targetIndex); // clears gate/arrival in the cloud
    else
      targetIndex = findNextSlot(); // walk-in: free slot that is not booked

    if (targetIndex == -1)
    {
      lcd.clear();
      lcd.print("PARKING FULL!");
      smartDelay(2000);
      lcdIdleShown = false;
    }
    else
    {
      reserved[targetIndex] = true;
      reservedAt[targetIndex] = millis();
      guide[targetIndex] = appUser || WALKIN_GUIDE_BLINK;
      if (!appUser)
      {
        curBid[targetIndex][0] = 0;
        strlcpy(curUid[targetIndex], "walkin", sizeof(curUid[targetIndex]));
      }
      blinkColor[targetIndex] = carCounter % 3;
      carCounter++;
      int slotNo = slotNames[targetIndex];

      lcd.clear();
      lcd.setCursor(3, 0);
      lcd.print("WELCOME!");
      smartDelay(1000);

      lcd.clear();
      lcd.print((slotNo <= 3) ? "Park at L1 S" : "Park at L2 S");
      lcd.print(slotNo);
      lcd.setCursor(0, 1);
      if (guide[targetIndex])
      {
        lcd.print(blinkColor[targetIndex] == 0 ? "FOLLOW GREEN" : blinkColor[targetIndex] == 1 ? "FOLLOW YELLOW"
                                                                                               : "FOLLOW RED");
      }
      else
      {
        lcd.print("WALK-IN SLOT");
      }
      smartDelay(2000);

      displayGrid(slotNo);
      smartDelay(2000);

      openGateGradually();
      smartDelay(700);
      closeGateFast();
      lcdIdleShown = false;
    }
  }
  previousIR = irState;

  if (!lcdIdleShown)
  {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("SMART PARKING");
    lcdIdleShown = true;
  }
  delay(20);
}