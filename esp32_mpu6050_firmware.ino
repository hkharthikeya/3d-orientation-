// ESP32 Arduino / C++ Sketch for MPU6050 3D Real-Time Orientation Visualization
// Install "Adafruit MPU6050" and "Adafruit Unified Sensor" via Arduino Library Manager
// If using WiFi / WebSockets, install "WebSocketsServer" by Markus Sattler.

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

// Complementary filter variables
float roll = 0.0;
float pitch = 0.0;
float yaw = 0.0;
unsigned long lastTime = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Wire.begin(21, 22); // Default ESP32 I2C pins: SDA=21, SCL=22

  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip!");
    while (1) { delay(10); }
  }

  // Set ranges
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  delay(100);
  lastTime = millis();
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  unsigned long currentTime = millis();
  float dt = (currentTime - lastTime) / 1000.0;
  lastTime = currentTime;
  if (dt <= 0.0 || dt > 0.2) dt = 0.02; // Safeguard against timer jumps

  // Convert angular rates from rad/s to deg/s
  float gx_deg = g.gyro.x * 57.2957795;
  float gy_deg = g.gyro.y * 57.2957795;
  float gz_deg = g.gyro.z * 57.2957795;

  // Accelerometer angles
  float accPitch = atan2(-a.acceleration.x, sqrt(a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z)) * 57.2957795;
  float accRoll  = atan2(a.acceleration.y, a.acceleration.z) * 57.2957795;

  // Complementary filter (98% Gyro + 2% Accel)
  roll  = 0.98 * (roll + gx_deg * dt) + 0.02 * accRoll;
  pitch = 0.98 * (pitch + gy_deg * dt) + 0.02 * accPitch;
  yaw   += gz_deg * dt; // Gyro integration for yaw

  // Keep yaw within 0 - 360 or -180 to 180
  if (yaw >= 360.0) yaw -= 360.0;
  if (yaw < 0.0) yaw += 360.0;

  // Raw acceleration in LSB approx (+/- 2G range: 1G = 16384 LSB, a in m/s^2 -> lsb = a/9.80665 * 16384)
  int ax_raw = (int)((a.acceleration.x / 9.80665) * 16384.0);
  int ay_raw = (int)((a.acceleration.y / 9.80665) * 16384.0);
  int az_raw = (int)((a.acceleration.z / 9.80665) * 16384.0);

  int gx_raw = (int)gx_deg;
  int gy_raw = (int)gy_deg;
  int gz_raw = (int)gz_deg;

  // Protocol format: roll,pitch,yaw,ax,ay,az,gx,gy,gz
  Serial.print(roll, 2);
  Serial.print(",");
  Serial.print(pitch, 2);
  Serial.print(",");
  Serial.print(yaw, 2);
  Serial.print(",");
  Serial.print(ax_raw);
  Serial.print(",");
  Serial.print(ay_raw);
  Serial.print(",");
  Serial.print(az_raw);
  Serial.print(",");
  Serial.print(gx_raw);
  Serial.print(",");
  Serial.print(gy_raw);
  Serial.print(",");
  Serial.println(gz_raw);

  delay(20); // ~50Hz sample output
}
