// generate_msgpack_payload.js
const MessagePack = require('@msgpack/msgpack');
const fs = require('fs');

const newMedicineData = {
    name: "Тест Лекарство (MsgPack)",
    expiry_date: new Date("2028-12-31T00:00:00.000Z"), // Отправляем как Date объект
    quantity: 25,
    unit: "таб.",
    instructions: "Принимать по назначению (MsgPack)",
    dosage: "1 таблетка",
    frequency: "2 раза в день",
    min_threshold: 5,
    storage_location: "Холодильник",
    notes: "Тестовая заметка для MessagePack",
    image_url: null
};

try {
    const encodedData = MessagePack.encode(newMedicineData);
    fs.writeFileSync('medicine_payload.msgpack', encodedData);
    console.log('Файл medicine_payload.msgpack успешно создан.');
    console.log('Размер файла:', encodedData.length, 'байт');
} catch (error) {
    console.error('Ошибка при кодировании или записи файла:', error);
}