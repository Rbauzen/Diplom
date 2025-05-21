// Пример для backend/utils/test-lwp.js
const { serializeToLWP, deserializeFromLWP } = require('./lwp-serializer');
const LWP_UNITS_CONFIG = require('./lwp-config');
const sampleMedicineJS = {
  id: 1,
  name: "Тестовый Препарат",
  expiry_date: new Date("2027-07-15"), // или "2027-07-15T00:00:00.000Z"
  quantity: 30,
  unit: "капс.",
  instructions: "2 раза в день",
  dosage: "1 капсула",
  frequency: "каждые 12 часов",
  min_threshold: 5,
  storage_location: "Аптечка",
  notes: "Важно!",
  image_url: null,
  created_at: new Date("2024-01-10T12:30:00Z"),
  updated_at: new Date("2024-01-11T15:45:00Z")
};

console.log("Исходный JS объект:", sampleMedicineJS);

const lwpArray = serializeToLWP(sampleMedicineJS);
console.log("Сериализованный LWP массив:", lwpArray);

// Для имитации передачи по сети
const lwpArrayAsString = JSON.stringify(lwpArray);
console.log("LWP массив как JSON строка (для передачи):", lwpArrayAsString);
const receivedLwpArray = JSON.parse(lwpArrayAsString); // На принимающей стороне

const deserializedMedicineJS = deserializeFromLWP(receivedLwpArray);
console.log("Десериализованный JS объект:", deserializedMedicineJS);

// Проверка некоторых полей:
console.log("Даты совпадают (expiry_date)?", deserializedMedicineJS.expiry_date.getTime() === sampleMedicineJS.expiry_date.getTime());
console.log("Единица измерения совпадает?", deserializedMedicineJS.unit === sampleMedicineJS.unit);
console.log("Timestamp created_at совпадает?", deserializedMedicineJS.created_at.getTime() === sampleMedicineJS.created_at.getTime());

// Тест с отсутствующими/null полями
const sampleMedicineMinimalJS = {
  id: 2,
  name: "Минимум",
  expiry_date: "2025-01-01",
  quantity: 1,
  unit: "шт.",
  instructions: null,
  dosage: null,
  frequency: null,
  min_threshold: null,
  storage_location: null,
  notes: null,
  image_url: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
};
console.log("\nМинимальный JS объект:", sampleMedicineMinimalJS);
const lwpMinimalArray = serializeToLWP(sampleMedicineMinimalJS);
console.log("Сериализованный минимальный LWP массив:", lwpMinimalArray);
const deserializedMinimalJS = deserializeFromLWP(lwpMinimalArray);
console.log("Десериализованный минимальный JS объект:", deserializedMinimalJS);