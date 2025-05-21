// generate_reminder_payload.js
const MessagePack = require('@msgpack/msgpack');
const fs = require('fs');

const newReminderData = {
    medicine_id: 3,
    reminder_time: "10:30:00",
    days_of_week: "1,2,3,4,5",
    start_date: new Date("2024-08-01T00:00:00.000Z"),
    end_date: null,
    notes: "Тестовое напоминание из скрипта",
    is_active: true
};

try {
    const encodedData = MessagePack.encode(newReminderData);
    fs.writeFileSync('reminder_payload.msgpack', encodedData);
    console.log('Файл reminder_payload.msgpack успешно создан.');
    console.log('Содержимое объекта для кодирования:', newReminderData);
    console.log('Размер файла:', encodedData.length, 'байт');
    console.log('Закодированные данные (HEX):', Buffer.from(encodedData).toString('hex'));
} catch (error) {
    console.error('Ошибка при кодировании или записи файла:', error);
}