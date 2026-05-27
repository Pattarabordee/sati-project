#include <Arduino_BMI270_BMM150.h>
#include <ArduinoBLE.h>

// Verified with Arduino_BMI270_BMM150 1.2.3 and ArduinoBLE 2.0.2 on 2026-05-26.
// The Y-axis assumption still depends on how the Nano is clipped to the shirt.

const char DEVICE_NAME[] = "Sati-Nano";
const char SERVICE_UUID[] = "19B10000-E8F2-537E-4F6C-D104768A1214";
const char CHAR_UUID[] = "19B10001-E8F2-537E-4F6C-D104768A1214";

const unsigned long UPDATE_MS = 200;
const unsigned long CALIBRATION_MS = 5000;

BLEService postureService(SERVICE_UUID);
BLECharacteristic postureCharacteristic(CHAR_UUID, BLERead | BLENotify, 32);

float zeroAngle = 0.0;
float lastGx = 0.0;
float lastGy = 0.0;
float lastGz = 0.0;
bool hasLastGyro = false;
bool wasConnected = false;
bool imuReady = false;
unsigned long lastUpdate = 0;

float angleFromAccel(float ax, float ay, float az) {
  // ใช้แกน Y เป็นค่าเริ่มต้น เพราะติด Nano กลางหลังแบบตั้ง; ถ้าติดคนละทิศให้ swap แกนตรงนี้
  float sideMagnitude = sqrt((ax * ax) + (az * az));
  return atan2(ay, sideMagnitude) * 180.0 / PI;
}

float readBackAngle() {
  if (!imuReady) {
    return 0.0;
  }

  float ax = 0.0;
  float ay = 0.0;
  float az = 0.0;

  if (IMU.accelerationAvailable()) {
    IMU.readAcceleration(ax, ay, az);
  }

  float rawAngle = angleFromAccel(ax, ay, az);
  return fabs(rawAngle - zeroAngle);
}

float readMotionAmount() {
  if (!imuReady) {
    return 0.0;
  }

  float gx = 0.0;
  float gy = 0.0;
  float gz = 0.0;

  if (IMU.gyroscopeAvailable()) {
    IMU.readGyroscope(gx, gy, gz);
  }

  float motion = 0.0;
  if (hasLastGyro) {
    float dx = gx - lastGx;
    float dy = gy - lastGy;
    float dz = gz - lastGz;
    motion = sqrt((dx * dx) + (dy * dy) + (dz * dz));
  }

  lastGx = gx;
  lastGy = gy;
  lastGz = gz;
  hasLastGyro = true;
  return motion;
}

void calibrateZeroAngle() {
  if (!imuReady) {
    zeroAngle = 0.0;
    return;
  }

  Serial.println("Calibrating zero angle for 5 seconds. Sit upright and stay still.");

  unsigned long start = millis();
  float total = 0.0;
  int samples = 0;

  while (millis() - start < CALIBRATION_MS) {
    if (IMU.accelerationAvailable()) {
      float ax = 0.0;
      float ay = 0.0;
      float az = 0.0;
      IMU.readAcceleration(ax, ay, az);
      total += angleFromAccel(ax, ay, az);
      samples += 1;
    }
    delay(20);
  }

  if (samples > 0) {
    zeroAngle = total / samples;
  }

  Serial.print("Zero angle set to ");
  Serial.println(zeroAngle, 1);
}

void writePayload(float backAngle, float motion) {
  // จำกัดจำนวนหลักเพื่อให้ JSON ไม่เกิน 32 bytes ตาม characteristic size
  if (backAngle < 0.0) backAngle = 0.0;
  if (backAngle > 99.9) backAngle = 99.9;
  if (motion < 0.0) motion = 0.0;
  if (motion > 99.9) motion = 99.9;

  char payload[33];
  snprintf(payload, sizeof(payload), "{\"backAngle\":%.1f,\"motion\":%.1f}", backAngle, motion);
  postureCharacteristic.writeValue((const unsigned char *)payload, strlen(payload));
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {
  }

  Serial.println("Sati Nano back-angle sensor booting...");

  if (!BLE.begin()) {
    Serial.println("BLE begin failed.");
    while (true) {
      delay(1000);
    }
  }

  BLE.setLocalName(DEVICE_NAME);
  BLE.setDeviceName(DEVICE_NAME);
  BLE.setAdvertisedService(postureService);
  postureService.addCharacteristic(postureCharacteristic);
  BLE.addService(postureService);

  writePayload(0.0, 0.0);
  BLE.advertise();

  Serial.println("BLE advertising as Sati-Nano");

  imuReady = IMU.begin();
  if (imuReady) {
    calibrateZeroAngle();
  } else {
    Serial.println("IMU begin failed. BLE stays online with zero sensor values.");
  }
}

void loop() {
  BLE.poll();

  BLEDevice central = BLE.central();
  bool isConnected = central && central.connected();

  if (isConnected && !wasConnected) {
    Serial.print("BLE central connected: ");
    Serial.println(central.address());
  }

  if (!isConnected && wasConnected) {
    Serial.println("BLE central disconnected");
  }

  wasConnected = isConnected;

  if (millis() - lastUpdate >= UPDATE_MS) {
    lastUpdate = millis();

    float backAngle = readBackAngle();
    float motion = readMotionAmount();
    writePayload(backAngle, motion);
  }
}
