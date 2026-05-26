#if __has_include(<Arduino_Modulino.h>)
#include <Arduino_Modulino.h>
#elif __has_include(<Modulino.h>)
#include <Modulino.h>
#else
#error "Install the Arduino Modulino library from Arduino Library Manager."
#endif

// Verified with Arduino_Modulino 0.8.0 on 2026-05-26.
// Distance_Basic uses Modulino.begin(), distance.begin(), available(), get().
// distance.get() returns millimeters, so this sketch converts to centimeters.

const unsigned long READ_INTERVAL_MS = 100;
const int WINDOW_SIZE = 5;
const float MIN_DISTANCE_CM = 4.0;
const float MAX_DISTANCE_CM = 130.0;

ModulinoDistance distance;

float readings[WINDOW_SIZE];
int readingCount = 0;
int readingIndex = 0;
unsigned long lastRead = 0;

float medianOfReadings() {
  float sorted[WINDOW_SIZE];

  for (int i = 0; i < readingCount; i += 1) {
    sorted[i] = readings[i];
  }

  for (int i = 0; i < readingCount - 1; i += 1) {
    for (int j = i + 1; j < readingCount; j += 1) {
      if (sorted[j] < sorted[i]) {
        float tmp = sorted[i];
        sorted[i] = sorted[j];
        sorted[j] = tmp;
      }
    }
  }

  return sorted[readingCount / 2];
}

void rememberReading(float value) {
  readings[readingIndex] = value;
  readingIndex = (readingIndex + 1) % WINDOW_SIZE;

  if (readingCount < WINDOW_SIZE) {
    readingCount += 1;
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {
  }

  // Modulino Distance ต่อเข้าพอร์ต Qwiic/I2C ของ UNO Q MCU side
  Modulino.begin();
  distance.begin();

  Serial.println("{\"boot\":\"sati-tof-v1\"}");
}

void loop() {
  if (millis() - lastRead < READ_INTERVAL_MS) {
    return;
  }

  lastRead = millis();

  if (!distance.available()) {
    return;
  }

  float rawMm = distance.get();
  float rawCm = rawMm / 10.0;

  // กันค่า spike หรือค่านอกช่วง demo ของ Modulino Distance
  if (rawCm < MIN_DISTANCE_CM || rawCm > MAX_DISTANCE_CM) {
    return;
  }

  rememberReading(rawCm);

  if (readingCount < WINDOW_SIZE) {
    return;
  }

  float filteredCm = medianOfReadings();

  Serial.print("{\"tof\":");
  Serial.print(filteredCm, 1);
  Serial.println("}");
}
