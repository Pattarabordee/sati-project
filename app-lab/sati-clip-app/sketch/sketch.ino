#if __has_include(<Arduino_Modulino.h>)
#include <Arduino_Modulino.h>
#elif __has_include(<Modulino.h>)
#include <Modulino.h>
#else
#error "Install the Arduino Modulino library from Arduino Library Manager."
#endif

// UNO Q MCU sketch for Sati Clip App Lab.
// Reads Modulino Distance and prints JSON for the Linux Python bridge.

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

  // Modulino Distance connects to the UNO Q Qwiic/I2C port.
  Modulino.begin();
  distance.begin();

  Serial.println("{\"boot\":\"sati-app-lab-tof-v1\"}");
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

  if (rawCm < MIN_DISTANCE_CM || rawCm > MAX_DISTANCE_CM) {
    return;
  }

  rememberReading(rawCm);

  if (readingCount < WINDOW_SIZE) {
    return;
  }

  float filteredCm = medianOfReadings();

  // Python bridge expects one JSON object per line.
  Serial.print("{\"tof\":");
  Serial.print(filteredCm, 1);
  Serial.println("}");
}
