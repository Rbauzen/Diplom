// backend/server.js
const express = require('express');
const { v4: uuidv4 } = require('uuid'); // Для генерации pharmacy_id
const db = require('./db');
const MessagePack = require('@msgpack/msgpack');
const { serializeToLWP, deserializeFromLWP } = require('./utils/lwp-serializer');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.raw({ type: 'application/msgpack', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['application/lwp', 'application/x-lwp-v1'], limit: '10mb' }));

/**
 * Подготавливает данные объекта лекарства для записи в БД.
 * Основное назначение - форматирование дат.
 * @param {object} medicineData - Объект с данными лекарства.
 * @returns {object} Объект с подготовленными данными.
 */
const prepareMedicineDataForDb = (medicineData) => {
    const dataForDb = { ...medicineData };
    if (dataForDb.expiry_date) {
        if (dataForDb.expiry_date instanceof Date) {
            dataForDb.expiry_date = dataForDb.expiry_date.toISOString().split('T')[0];
        } else if (typeof dataForDb.expiry_date === 'string') {
            // Можно добавить валидацию формата YYYY-MM-DD, если нужно
            // Но pg обычно справляется, если формат корректен
        }
    }
    // created_at, updated_at управляются триггерами БД или DEFAULT CURRENT_TIMESTAMP
    return dataForDb;
};

/**
 * Подготавливает данные объекта напоминания для записи в БД.
 * Основное назначение - форматирование времени и дат.
 * @param {object} reminderData - Объект с данными напоминания.
 * @returns {object} Объект с подготовленными данными.
 */
const prepareReminderDataForDb = (reminderData) => {
    const dataForDb = { ...reminderData };

    // reminder_time (TIME WITHOUT TIME ZONE в БД ожидает 'HH:MI' или 'HH:MI:SS')
    if (dataForDb.reminder_time && typeof dataForDb.reminder_time === 'string' && dataForDb.reminder_time.length > 5) {
        // Обрезаем до HH:MM, если пришли секунды
        if (/^\d{2}:\d{2}:\d{2}$/.test(dataForDb.reminder_time)) {
            dataForDb.reminder_time = dataForDb.reminder_time.substring(0, 5);
        }
        // Можно добавить более строгую валидацию формата HH:MM
    }

    // start_date и end_date (DATE в БД ожидает 'YYYY-MM-DD')
    // Если они приходят как Date объекты от MessagePack, преобразуем
    if (dataForDb.start_date instanceof Date) {
        dataForDb.start_date = dataForDb.start_date.toISOString().split('T')[0];
    }
    if (dataForDb.end_date instanceof Date) {
        dataForDb.end_date = dataForDb.end_date.toISOString().split('T')[0];
    } else if (dataForDb.end_date === '') { // Пустая строка из формы может означать отсутствие даты
        dataForDb.end_date = null;
    }
    
    return dataForDb;
};

app.get('/', (req, res) => {
    res.send('Бэкенд "Цифровой Аптечки" запущен!');
});

// GET /api/medicines - Получение списка лекарств для указанной аптечки
app.get('/api/medicines', async (req, res) => {
    const { pharmacy_id } = req.query;

    if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
        // Более строгая проверка pharmacy_id
        return res.status(400).json({ error: 'Некорректный или отсутствующий идентификатор аптечки (pharmacy_id).' });
    }

    try {
        const queryText = 'SELECT * FROM medicines WHERE pharmacy_id = $1 ORDER BY name ASC';
        const { rows } = await db.query(queryText, [pharmacy_id]);

        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.send(MessagePack.encode(rows));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                const lwpData = rows.map(med => serializeToLWP(med));
                res.set('Content-Type', preferredType);
                res.status(200).send(JSON.stringify(lwpData));
                break;
            case 'application/json': // Явный запрос JSON
            default: // Если preferredType не определен (например, Accept: */*) или не совпал
                res.set('Content-Type', 'application/json');
                res.status(200).json(rows);
                break;
        }
    } catch (err) {
        console.error(`Ошибка при получении лекарств для pharmacy_id [${pharmacy_id}]:`, err.message, err.stack); // Добавим pharmacy_id в лог ошибки
        res.status(500).json({ error: 'Внутренняя ошибка сервера при получении данных о лекарствах.' });
    }
});

// POST /api/medicines - Создание нового лекарства
app.post('/api/medicines', async (req, res) => {
    const contentType = req.get('Content-Type');
    let requestData; // Данные из тела запроса после парсинга/декодирования

    try {
        // --- 1. Получение и декодирование/парсинг данных запроса ---
        switch (contentType) {
            case 'application/msgpack':
                if (!(req.body instanceof Buffer)) {
                    console.error('POST /medicines: MsgPack body is not a Buffer. Type:', typeof req.body);
                    return res.status(400).json({ error: 'Тело запроса для application/msgpack должно быть Buffer' });
                }
                try {
                    requestData = MessagePack.decode(req.body);
                } catch (decodeError) {
                    // Попытка исправить ошибку "Extra bytes"
                    if (decodeError instanceof RangeError && decodeError.message.includes("Extra") && decodeError.message.includes("found at buffer[")) {
                        const match = decodeError.message.match(/found at buffer\[(\d+)\]/);
                        if (match && match[1]) {
                            const usefulLength = parseInt(match[1], 10);
                            if (usefulLength > 0 && usefulLength < req.body.length) { // usefulLength должна быть меньше полной длины
                                try {
                                    const actualDataBuffer = req.body.slice(0, usefulLength);
                                    requestData = MessagePack.decode(actualDataBuffer);
                                    console.warn(`MSGPACK POST /medicines: Декодировано ${usefulLength} из ${req.body.length} байт (обнаружены лишние байты).`);
                                } catch (sliceDecodeError) {
                                    console.error('MSGPACK POST /medicines: Ошибка при декодировании срезанного буфера:', sliceDecodeError.message);
                                    return res.status(400).json({ error: 'Ошибка декодирования MessagePack данных (срез)', details: sliceDecodeError.message });
                                }
                            } else {
                                console.error('MSGPACK POST /medicines: Некорректная полезная длина из ошибки "Extra bytes".', decodeError.message);
                                return res.status(400).json({ error: 'Ошибка декодирования MessagePack (некорректная структура)', details: decodeError.message });
                            }
                        } else {
                             return res.status(400).json({ error: 'Ошибка декодирования MessagePack (не удалось извлечь полезную длину)', details: decodeError.message });
                        }
                    } else { // Другая ошибка декодирования MessagePack
                        console.error('MSGPACK POST /medicines: Ошибка декодирования MessagePack:', decodeError.message);
                        return res.status(400).json({ error: 'Ошибка декодирования MessagePack данных', details: decodeError.message });
                    }
                }
                break;

            case 'application/lwp':
            case 'application/x-lwp-v1':
                if (typeof req.body !== 'string') {
                    console.error('LWP POST /medicines: req.body is not a String.');
                    return res.status(400).json({ error: 'Для application/lwp тело запроса должно быть строкой' });
                }
                try {
                    const parsedLwpArray = JSON.parse(req.body);
                    requestData = deserializeFromLWP(parsedLwpArray);
                    if (!requestData) {
                        console.error('LWP POST /medicines: deserializeFromLWP вернул null. Входные данные:', parsedLwpArray);
                        return res.status(400).json({ error: 'Не удалось десериализовать LWP данные' });
                    }
                } catch (jsonParseError) {
                    console.error('LWP POST /medicines: Ошибка парсинга LWP JSON строки:', jsonParseError.message);
                    return res.status(400).json({ error: 'Некорректный формат LWP данных (невалидный JSON)' });
                }
                break;

            case 'application/json':
                requestData = req.body;
                break;
            
            default:
                // Если Content-Type не указан, но тело есть и Express его распарсил как JSON (по умолчанию)
                if (!contentType && req.body && Object.keys(req.body).length > 0 && typeof req.body === 'object') {
                    console.warn('POST /api/medicines: Content-Type не указан, предполагается JSON.');
                    requestData = req.body;
                } else {
                    console.warn(`POST /api/medicines: Неподдерживаемый Content-Type: ${contentType}`);
                    return res.status(415).json({ error: `Неподдерживаемый Content-Type: ${contentType || 'не указан'}` });
                }
        }

        if (!requestData || typeof requestData !== 'object' || Object.keys(requestData).length === 0) {
            console.error('POST /api/medicines: Данные запроса отсутствуют или некорректны после парсинга. requestData:', requestData);
            return res.status(400).json({ error: 'Тело запроса не содержит данных или имеет неверный формат' });
        }

        // --- 2. Подготовка и валидация данных ---
        const dataForDb = prepareMedicineDataForDb(requestData); // Используем функцию для лекарств

        const {
            pharmacy_id, name, expiry_date, quantity, unit,
            instructions, dosage, frequency, min_threshold,
            storage_location, notes, image_url
        } = dataForDb;

        if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
            return res.status(400).json({ error: 'Идентификатор аптечки (pharmacy_id) обязателен и не может быть пустым.' });
        }
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Поле "name" обязательно.' });
        }
        if (!expiry_date) { // prepareMedicineDataForDb должна вернуть строку YYYY-MM-DD или null
            return res.status(400).json({ error: 'Поле "expiry_date" обязательно.' });
        }
        if (quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) < 0) {
            return res.status(400).json({ error: 'Поле "quantity" обязательно и должно быть неотрицательным числом.' });
        }
        if (!unit || typeof unit !== 'string' || unit.trim() === '') {
            return res.status(400).json({ error: 'Поле "unit" обязательно.' });
        }

        // --- 3. Взаимодействие с базой данных ---
        const queryText = `
            INSERT INTO medicines (
                pharmacy_id, name, expiry_date, quantity, unit,
                instructions, dosage, frequency, min_threshold,
                storage_location, notes, image_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `;
        const values = [
            pharmacy_id, name, expiry_date, Number(quantity), unit,
            instructions, dosage, frequency, 
            (min_threshold !== null && min_threshold !== undefined) ? Number(min_threshold) : null,
            storage_location, notes, image_url
        ];

        const { rows } = await db.query(queryText, values);
        const createdMedicine = rows[0];

        // --- 4. Отправка ответа ---
        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);
        
        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.status(201).send(MessagePack.encode(createdMedicine));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                res.set('Content-Type', preferredType);
                res.status(201).send(JSON.stringify(serializeToLWP(createdMedicine)));
                break;
            default: // 'application/json' или если ничего не подошло
                res.set('Content-Type', 'application/json');
                res.status(201).json(createdMedicine);
                break;
        }

    } catch (err) {
        console.error(`POST /api/medicines - КРИТИЧЕСКАЯ ОШИБКА: ${err.message}`, err.stack);
        
        if (res.headersSent) {
            return; // Если ответ уже был отправлен (например, из блока декодирования)
        }

        // Обработка специфических ошибок БД
        if (err.code === '23502') { // NOT NULL VIOLATION
             return res.status(400).json({ error: 'Отсутствует обязательное поле при записи в БД.' });
        }
        if (err.code === '23514') { // CHECK VIOLATION
            return res.status(400).json({ error: 'Нарушение ограничений данных (например, отрицательное количество).' });
        }
        
        res.status(500).json({ error: 'Внутренняя ошибка сервера при добавлении лекарства.', details: err.message });
    }
});

// POST /api/medicines/:medicineId/use - Запись об использовании лекарства
app.post('/api/medicines/:medicineId/use', async (req, res) => {
    const { medicineId } = req.params; // ID лекарства из URL
    const contentType = req.get('Content-Type');
    let requestBodyData; // Данные из тела запроса после парсинга/декодирования

    // console.log(`[SERVER] POST /api/medicines/${medicineId}/use - Entry. Content-Type: ${contentType}`); // Можно оставить для отладки низкого уровня

    try {
        // --- 1. Обработка тела запроса ---
        switch (contentType) {
            case 'application/msgpack':
                if (!(req.body instanceof Buffer)) {
                    console.error(`POST /medicines/${medicineId}/use: MsgPack body is not a Buffer.`);
                    return res.status(400).json({ error: 'Тело запроса для application/msgpack должно быть Buffer' });
                }
                if (req.body.length === 0) {
                    return res.status(400).json({ error: 'Тело запроса MessagePack пустое' });
                }
                try {
                    requestBodyData = MessagePack.decode(req.body);
                } catch (decodeError) {
                    if (decodeError instanceof RangeError && decodeError.message.includes("Extra") && decodeError.message.includes("found at buffer[")) {
                        const match = decodeError.message.match(/found at buffer\[(\d+)\]/);
                        if (match && match[1]) {
                            const usefulLength = parseInt(match[1], 10);
                            if (usefulLength > 0 && usefulLength < req.body.length) { // Строгая проверка, что полезная длина меньше
                                try {
                                    requestBodyData = MessagePack.decode(req.body.slice(0, usefulLength));
                                    console.warn(`POST /medicines/${medicineId}/use: MsgPack - декодировано ${usefulLength} из ${req.body.length} байт (обнаружены лишние байты).`);
                                } catch (sliceDecodeError) {
                                    console.error(`POST /medicines/${medicineId}/use: MsgPack - Ошибка при декодировании срезанного буфера:`, sliceDecodeError.message);
                                    return res.status(400).json({ error: 'Ошибка декодирования MessagePack данных (срез)', details: sliceDecodeError.message });
                                }
                            } else {
                                console.error(`POST /medicines/${medicineId}/use: MsgPack - Некорректная полезная длина из ошибки "Extra bytes". Useful: ${usefulLength}, Total: ${req.body.length}`);
                                return res.status(400).json({ error: 'Ошибка декодирования MessagePack (некорректная структура)', details: decodeError.message });
                            }
                        } else {
                             return res.status(400).json({ error: 'Ошибка декодирования MessagePack (не удалось извлечь полезную длину)', details: decodeError.message });
                        }
                    } else {
                        console.error(`POST /medicines/${medicineId}/use: MsgPack - Ошибка декодирования:`, decodeError.message);
                        return res.status(400).json({ error: 'Ошибка декодирования MessagePack', details: decodeError.message });
                    }
                }
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                if (typeof req.body !== 'string' || req.body.trim() === '') {
                    return res.status(400).json({ error: 'Тело запроса для LWP должно быть непустой строкой' });
                }
                try {
                    requestBodyData = JSON.parse(req.body); // Предполагаем, что LWP для /use это JSON-объект
                } catch (e) {
                    console.error(`POST /medicines/${medicineId}/use: LWP - Ошибка парсинга JSON:`, e.message);
                    return res.status(400).json({ error: 'Некорректный LWP JSON', details: e.message });
                }
                break;
            case 'application/json':
                requestBodyData = req.body;
                break;
            default:
                if (!contentType && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                    console.warn(`POST /medicines/${medicineId}/use: Content-Type не указан, предполагается JSON.`);
                    requestBodyData = req.body;
                } else {
                    console.warn(`POST /medicines/${medicineId}/use: Неподдерживаемый Content-Type: ${contentType} или пустое тело.`);
                    return res.status(415).json({ error: `Неподдерживаемый или отсутствующий Content-Type / тело запроса` });
                }
        }

        if (!requestBodyData || typeof requestBodyData !== 'object' || Object.keys(requestBodyData).length === 0) {
            console.error(`POST /medicines/${medicineId}/use: Данные тела запроса отсутствуют или некорректны после парсинга.`, requestBodyData);
            return res.status(400).json({ error: 'Тело запроса не содержит данных или имеет неверный формат' });
        }

        const { pharmacy_id, quantity_to_use, unit_of_use } = requestBodyData;

        // --- Валидация данных ---
        if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
            return res.status(400).json({ error: 'pharmacy_id не предоставлен или некорректен' });
        }
        const numericQuantityToUse = Number(quantity_to_use); // Преобразуем сразу для проверок
        if (isNaN(numericQuantityToUse) || numericQuantityToUse <= 0) {
            return res.status(400).json({ error: 'quantity_to_use должно быть положительным числом' });
        }
        if (!unit_of_use || typeof unit_of_use !== 'string' || unit_of_use.trim() === '') {
            return res.status(400).json({ error: 'unit_of_use не предоставлен или некорректен' });
        }

        const numericMedicineId = parseInt(medicineId, 10);
        if (isNaN(numericMedicineId)) {
            return res.status(400).json({ error: 'Некорректный ID лекарства в URL' });
        }

        // --- Взаимодействие с базой данных ---
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const medRes = await client.query('SELECT quantity, unit FROM medicines WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE', [numericMedicineId, pharmacy_id]);
            if (medRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Лекарство не найдено или не принадлежит указанной аптечке' });
            }
            const currentMed = medRes.rows[0];

            if (currentMed.unit !== unit_of_use) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Несоответствие единиц измерения: ожидалось ${currentMed.unit}, получено ${unit_of_use}` });
            }
            if (currentMed.quantity < numericQuantityToUse) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Недостаточно лекарства. В наличии: ${currentMed.quantity} ${currentMed.unit}` });
            }

            const newQuantity = currentMed.quantity - numericQuantityToUse;
            const updateResult = await client.query(
                'UPDATE medicines SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND pharmacy_id = $3 RETURNING *',
                [newQuantity, numericMedicineId, pharmacy_id]
            );

            if (updateResult.rowCount === 0) { // Должно быть практически невозможно после FOR UPDATE и проверки выше, но для надежности
                await client.query('ROLLBACK');
                console.error(`POST /medicines/${medicineId}/use: Не удалось обновить лекарство после проверки наличия. ID: ${numericMedicineId}, PharmacyID: ${pharmacy_id}`);
                return res.status(409).json({ error: 'Конфликт: не удалось обновить лекарство, возможно, данные изменились.' });
            }

            await client.query(
                'INSERT INTO usage_history (medicine_id, quantity_taken, unit, pharmacy_id) VALUES ($1, $2, $3, $4)',
                [numericMedicineId, numericQuantityToUse, unit_of_use, pharmacy_id]
            );

            await client.query('COMMIT');
            
            const finalUpdatedMedicine = updateResult.rows[0];
            const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

            switch (preferredType) {
                case 'application/msgpack':
                    res.set('Content-Type', 'application/msgpack');
                    res.status(200).send(MessagePack.encode(finalUpdatedMedicine));
                    break;
                case 'application/lwp':
                case 'application/x-lwp-v1':
                    console.warn(`POST /medicines/${medicineId}/use: LWP для ответа пока не реализован как специфичный массив, отдаю JSON.`);
                    res.set('Content-Type', 'application/json'); 
                    res.status(200).json(finalUpdatedMedicine);
                    break;
                default: // 'application/json' или если ничего не подошло
                    res.set('Content-Type', 'application/json');
                    res.status(200).json(finalUpdatedMedicine);
                    break;
            }

        } catch (dbError) {
            console.error(`POST /medicines/${medicineId}/use: Ошибка транзакции БД для pharmacy_id ${pharmacy_id}:`, dbError.message, dbError.stack);
            try { await client.query('ROLLBACK'); }
            catch (rbError) { console.error(`POST /medicines/${medicineId}/use: Ошибка при откате транзакции:`, rbError); }
            if (!res.headersSent) {
                 if (dbError.code === '23503') return res.status(400).json({ error: 'Ошибка связи данных при записи истории или обновлении лекарства.' });
                res.status(500).json({ error: 'Ошибка сервера при операции с базой данных', details: dbError.message });
            }
        } finally {
            if (client) {
                client.release();
            }
        }
    } catch (err) { // Внешний catch для ошибок парсинга или других до блока транзакции
        console.error(`POST /api/medicines/${medicineId}/use - КРИТИЧЕСКАЯ ОШИБКА (до БД):`, err.message, err.stack);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Внутренняя ошибка сервера (обработка запроса)', details: err.message });
        }
    }
});

// PUT /api/medicines/:medicineId - Обновление существующего лекарства
app.put('/api/medicines/:medicineId', async (req, res) => {
    const { medicineId } = req.params; // ID лекарства из URL
    const contentType = req.get('Content-Type');
    let requestBodyData; // Данные из тела запроса после парсинга/декодирования

    try {
        // --- 1. Обработка тела запроса ---
        switch (contentType) {
            case 'application/msgpack':
                if (!(req.body instanceof Buffer)) {
                    console.error(`PUT /medicines/${medicineId}: MsgPack body is not a Buffer.`);
                    return res.status(400).json({ error: 'Тело запроса для application/msgpack должно быть Buffer' });
                }
                if (req.body.length === 0) {
                    return res.status(400).json({ error: 'Тело запроса MessagePack пустое' });
                }
                try {
                    requestBodyData = MessagePack.decode(req.body);
                } catch (decodeError) {
                    if (decodeError instanceof RangeError && decodeError.message.includes("Extra") && decodeError.message.includes("found at buffer[")) {
                        const match = decodeError.message.match(/found at buffer\[(\d+)\]/);
                        if (match && match[1]) {
                            const usefulLength = parseInt(match[1], 10);
                            if (usefulLength > 0 && usefulLength < req.body.length) {
                                try {
                                    requestBodyData = MessagePack.decode(req.body.slice(0, usefulLength));
                                    console.warn(`PUT /medicines/${medicineId}: MsgPack - декодировано ${usefulLength} из ${req.body.length} байт (обнаружены лишние байты).`);
                                } catch (sliceDecodeError) {
                                    console.error(`PUT /medicines/${medicineId}: MsgPack - Ошибка при декодировании срезанного буфера:`, sliceDecodeError.message);
                                    return res.status(400).json({ error: 'Ошибка декодирования MessagePack данных (срез)', details: sliceDecodeError.message });
                                }
                            } else {
                                console.error(`PUT /medicines/${medicineId}: MsgPack - Некорректная полезная длина из ошибки "Extra bytes". Useful: ${usefulLength}, Total: ${req.body.length}`);
                                return res.status(400).json({ error: 'Ошибка декодирования MessagePack (некорректная структура)', details: decodeError.message });
                            }
                        } else {
                             return res.status(400).json({ error: 'Ошибка декодирования MessagePack (не удалось извлечь полезную длину)', details: decodeError.message });
                        }
                    } else {
                        console.error(`PUT /medicines/${medicineId}: MsgPack - Ошибка декодирования:`, decodeError.message);
                        return res.status(400).json({ error: 'Ошибка декодирования MessagePack', details: decodeError.message });
                    }
                }
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                if (typeof req.body !== 'string' || req.body.trim() === '') {
                    return res.status(400).json({ error: 'Тело запроса для LWP должно быть непустой строкой' });
                }
                try {
                    const parsedLwpData = JSON.parse(req.body);
                    // Если LWP для PUT - это массив значений лекарства (включая pharmacy_id первым)
                    requestBodyData = deserializeFromLWP(parsedLwpData);
                    if (!requestBodyData) {
                        console.error(`PUT /medicines/${medicineId}: LWP - deserializeFromLWP вернул null. Входные данные:`, parsedLwpData);
                        return res.status(400).json({ error: 'Не удалось десериализовать LWP данные для обновления' });
                    }
                } catch (e) {
                    console.error(`PUT /medicines/${medicineId}: LWP - Ошибка парсинга JSON или десериализации:`, e.message);
                    return res.status(400).json({ error: 'Некорректный LWP формат', details: e.message });
                }
                break;
            case 'application/json':
                requestBodyData = req.body;
                break;
            default:
                if (!contentType && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                    console.warn(`PUT /medicines/${medicineId}: Content-Type не указан, предполагается JSON.`);
                    requestBodyData = req.body;
                } else {
                    console.warn(`PUT /medicines/${medicineId}: Неподдерживаемый Content-Type: ${contentType} или пустое тело.`);
                    return res.status(415).json({ error: `Неподдерживаемый или отсутствующий Content-Type / тело запроса` });
                }
        }

        if (!requestBodyData || typeof requestBodyData !== 'object') {
            console.error(`PUT /medicines/${medicineId}: Данные тела запроса некорректны после парсинга.`, requestBodyData);
            return res.status(400).json({ error: 'Тело запроса имеет неверный формат или отсутствует' });
        }

        // --- 2. Подготовка и валидация данных ---
        const { pharmacy_id, ...fieldsToUpdate } = requestBodyData;

        if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
            return res.status(400).json({ error: 'Идентификатор аптечки (pharmacy_id) обязателен в теле запроса и не может быть пустым.' });
        }
        
        const dataForDb = prepareMedicineDataForDb(fieldsToUpdate);

        const allowedFields = ['name', 'expiry_date', 'quantity', 'unit', 'instructions', 'dosage', 'frequency', 'min_threshold', 'storage_location', 'notes', 'image_url'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        allowedFields.forEach(field => {
            if (dataForDb.hasOwnProperty(field)) {
                // Дополнительная валидация для quantity, если оно передается
                if (field === 'quantity' && (Number(dataForDb[field]) < 0 || isNaN(Number(dataForDb[field])))) {
                    console.warn(`PUT /medicines/${medicineId}: Попытка установить некорректное значение для quantity: ${dataForDb[field]}`);
                } else {
                    setClauses.push(`${field} = $${paramIndex++}`);
                    values.push(dataForDb[field]);
                }
            }
        });

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления. Передайте хотя бы одно поле для изменения.' });
        }
        
        const numericMedicineId = parseInt(medicineId, 10);
        if (isNaN(numericMedicineId)) {
            return res.status(400).json({ error: 'Некорректный ID лекарства в URL' });
        }
        
        values.push(numericMedicineId);
        values.push(pharmacy_id);

        const queryText = `
            UPDATE medicines
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex++} AND pharmacy_id = $${paramIndex} 
            RETURNING *;
        `;

        // --- 3. Взаимодействие с базой данных ---
        const { rows } = await db.query(queryText, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Лекарство не найдено или не принадлежит указанной аптечке для обновления' });
        }
        const updatedMedicine = rows[0];

        // --- 4. Отправка ответа ---
        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);
        
        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.send(MessagePack.encode(updatedMedicine));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                res.set('Content-Type', preferredType);
                res.send(JSON.stringify(serializeToLWP(updatedMedicine))); // LWP для лекарства
                break;
            default: // 'application/json' или если ничего не подошло
                res.set('Content-Type', 'application/json');
                res.json(updatedMedicine);
                break;
        }

    } catch (err) {
        console.error(`PUT /api/medicines/${medicineId} - КРИТИЧЕСКАЯ ОШИБКА: ${err.message}`, err.stack);
        if (res.headersSent) return;

        if (err.code === '23514') { 
            return res.status(400).json({ error: 'Нарушение ограничений данных (например, некорректное количество).' });
        }
        // Другие специфичные ошибки БД
        res.status(500).json({ error: 'Внутренняя ошибка сервера при обновлении лекарства.', details: err.message });
    }
});

// DELETE /api/medicines/:medicineId - Удаление лекарства
app.delete('/api/medicines/:medicineId', async (req, res) => {
    const { medicineId } = req.params; // Используем medicineId для единообразия
    const { pharmacy_id } = req.query;

    // Валидация входных данных
    if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
        return res.status(400).json({ error: 'Некорректный или отсутствующий идентификатор аптечки (pharmacy_id) в параметрах запроса.' });
    }

    const numericMedicineId = parseInt(medicineId, 10);
    if (isNaN(numericMedicineId) || numericMedicineId <= 0) { // Добавим проверку на > 0 для ID
        return res.status(400).json({ error: 'Некорректный формат ID лекарства в URL.' });
    }

    try {
        const queryText = 'DELETE FROM medicines WHERE id = $1 AND pharmacy_id = $2 RETURNING *;';
        const values = [numericMedicineId, pharmacy_id];

        const result = await db.query(queryText, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Лекарство не найдено или не принадлежит указанной аптечке.' });
        }
        
        const deletedMedicine = result.rows[0];

        // --- Отправка ответа ---
        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.status(200).send(MessagePack.encode(deletedMedicine));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                res.set('Content-Type', preferredType);
                res.status(200).send(JSON.stringify(serializeToLWP(deletedMedicine)));
                break;
            default: // 'application/json' или если ничего не подошло
                res.set('Content-Type', 'application/json');
                res.status(200).json({ message: 'Лекарство успешно удалено.', deletedMedicine });
                break;
        }

    } catch (err) {
        console.error(`DELETE /api/medicines/${medicineId}: Ошибка при удалении для pharmacy_id [${pharmacy_id}]: ${err.message}`, err.stack);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Внутренняя ошибка сервера при удалении лекарства.', details: err.message });
        }
    }
});

// GET /api/medicines/:medicineId - Получение одного лекарства по ID для указанной аптечки
app.get('/api/medicines/:medicineId', async (req, res) => {
    const { medicineId } = req.params;
    const { pharmacy_id } = req.query;

    // Валидация входных данных
    if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
        return res.status(400).json({ error: 'Некорректный или отсутствующий идентификатор аптечки (pharmacy_id) в параметрах запроса.' });
    }

    const numericMedicineId = parseInt(medicineId, 10);
    if (isNaN(numericMedicineId) || numericMedicineId <= 0) { // ID должен быть положительным
        return res.status(400).json({ error: 'Некорректный формат ID лекарства.' });
    }

    try {
        const queryText = 'SELECT * FROM medicines WHERE id = $1 AND pharmacy_id = $2';
        const values = [numericMedicineId, pharmacy_id];

        const { rows } = await db.query(queryText, values);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Лекарство не найдено или не принадлежит указанной аптечке.' });
        }
        const medicine = rows[0];

        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.send(MessagePack.encode(medicine));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                res.set('Content-Type', preferredType);
                res.send(JSON.stringify(serializeToLWP(medicine)));
                break;
            default: // 'application/json' или если ничего не подошло
                res.set('Content-Type', 'application/json');
                res.json(medicine);
                break;
        }
    } catch (err) {
        console.error(`GET /api/medicines/${medicineId}: Ошибка при получении лекарства для pharmacy_id [${pharmacy_id}]: ${err.message}`, err.stack);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при получении данных о лекарстве.' });
    }
});

// POST /api/reminders - Создание нового напоминания
app.post('/api/reminders', async (req, res) => {
    const contentType = req.get('Content-Type');
    let requestData; // Данные из тела запроса после парсинга/декодирования

    try {
        // --- 1. Получение и декодирование/парсинг данных запроса ---
        switch (contentType) {
            case 'application/msgpack':
                if (!(req.body instanceof Buffer)) {
                    console.error('POST /reminders: MsgPack body is not a Buffer.');
                    return res.status(400).json({ error: 'Тело запроса для application/msgpack должно быть Buffer' });
                }
                if (req.body.length === 0) {
                    return res.status(400).json({ error: 'Тело запроса MessagePack пустое' });
                }
                try {
                    requestData = MessagePack.decode(req.body);
                } catch (decodeError) {
                    if (decodeError instanceof RangeError && decodeError.message.includes("Extra") && decodeError.message.includes("found at buffer[")) {
                        const match = decodeError.message.match(/found at buffer\[(\d+)\]/);
                        if (match && match[1]) {
                            const usefulLength = parseInt(match[1], 10);
                            if (usefulLength > 0 && usefulLength < req.body.length) {
                                try {
                                    requestData = MessagePack.decode(req.body.slice(0, usefulLength));
                                    console.warn(`POST /reminders: MsgPack - декодировано ${usefulLength} из ${req.body.length} байт (обнаружены лишние байты).`);
                                } catch (sliceDecodeError) {
                                    console.error('POST /reminders: MsgPack - Ошибка при декодировании срезанного буфера:', sliceDecodeError.message);
                                    return res.status(400).json({ error: 'Ошибка декодирования MessagePack данных (срез)', details: sliceDecodeError.message });
                                }
                            } else {
                                console.error(`POST /reminders: MsgPack - Некорректная полезная длина из ошибки "Extra bytes". Useful: ${usefulLength}, Total: ${req.body.length}`);
                                return res.status(400).json({ error: 'Ошибка декодирования MessagePack (некорректная структура)', details: decodeError.message });
                            }
                        } else {
                             return res.status(400).json({ error: 'Ошибка декодирования MessagePack (не удалось извлечь полезную длину)', details: decodeError.message });
                        }
                    } else {
                        console.error('POST /reminders: MsgPack - Ошибка декодирования:', decodeError.message);
                        return res.status(400).json({ error: 'Ошибка декодирования MessagePack', details: decodeError.message });
                    }
                }
                break;

            case 'application/lwp':
            case 'application/x-lwp-v1':
                if (typeof req.body !== 'string' || req.body.trim() === '') {
                    return res.status(400).json({ error: 'Тело запроса для LWP должно быть непустой строкой' });
                }
                try {
                    requestData = JSON.parse(req.body);
                    if (typeof requestData !== 'object' || requestData === null) { // Дополнительная проверка
                        throw new Error('LWP payload did not parse to an object.');
                    }
                } catch (e) {
                    console.error('POST /reminders: LWP - Ошибка парсинга JSON:', e.message);
                    return res.status(400).json({ error: 'Некорректный LWP JSON', details: e.message });
                }
                break;

            case 'application/json':
                requestData = req.body;
                break;
            
            default:
                if (!contentType && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                    console.warn('POST /api/reminders: Content-Type не указан, предполагается JSON.');
                    requestData = req.body;
                } else {
                    console.warn(`POST /api/reminders: Неподдерживаемый Content-Type: ${contentType} или пустое тело.`);
                    return res.status(415).json({ error: `Неподдерживаемый или отсутствующий Content-Type / тело запроса` });
                }
        }

        if (!requestData || typeof requestData !== 'object' || Object.keys(requestData).length === 0) {
            console.error('POST /api/reminders: Данные тела запроса отсутствуют или некорректны после парсинга.', requestData);
            return res.status(400).json({ error: 'Тело запроса не содержит данных или имеет неверный формат' });
        }

        // --- 2. Подготовка и валидация данных ---
        const dataForDb = prepareReminderDataForDb(requestData); // Используем функцию для напоминаний

        const {
            pharmacy_id, medicine_id, reminder_time, days_of_week,
            start_date, end_date, notes
        } = dataForDb;
        const isActiveValue = (dataForDb.is_active === undefined || dataForDb.is_active === null) ? true : Boolean(dataForDb.is_active);

        // Валидация
        if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
            return res.status(400).json({ error: 'Идентификатор аптечки (pharmacy_id) обязателен.' });
        }
        if (medicine_id === undefined || medicine_id === null || isNaN(Number(medicine_id))) {
            return res.status(400).json({ error: 'Поле "medicine_id" обязательно и должно быть числом.' });
        }
        if (!reminder_time || typeof reminder_time !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(reminder_time)) {
            return res.status(400).json({ error: 'Поле "reminder_time" обязательно и должно быть в формате ЧЧ:ММ или ЧЧ:ММ:СС.' });
        }
        if (!start_date || !(new Date(start_date) instanceof Date) || isNaN(new Date(start_date).getTime())) {
            return res.status(400).json({ error: 'Поле "start_date" обязательно и должно быть корректной датой.' });
        }

        // --- 3. Взаимодействие с базой данных ---
        const queryText = `
            INSERT INTO reminders (pharmacy_id, medicine_id, reminder_time, days_of_week, start_date, end_date, notes, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        const values = [
            pharmacy_id, Number(medicine_id), reminder_time, days_of_week, 
            dataForDb.start_date, // Используем dataForDb, так как там дата может быть уже отформатирована
            dataForDb.end_date,   // Аналогично
            notes, isActiveValue
        ];

        const { rows } = await db.query(queryText, values);
        const createdReminder = rows[0];

        // --- 4. Отправка ответа ---
        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);
        
        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.status(201).send(MessagePack.encode(createdReminder));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                console.warn("POST /api/reminders: LWP для ответа о создании напоминания пока не реализован, отдаю JSON.");
                res.set('Content-Type', 'application/json'); 
                res.status(201).json(createdReminder);
                break;
            default: // 'application/json'
                res.set('Content-Type', 'application/json');
                res.status(201).json(createdReminder);
                break;
        }

    } catch (err) {
        console.error(`POST /api/reminders - КРИТИЧЕСКАЯ ОШИБКА: ${err.message}`, err.stack);
        if (res.headersSent) return;
        
        if (err.code === '23503') return res.status(400).json({ error: 'Некорректный ID лекарства.' });
        if (err.code === '23505') return res.status(409).json({ error: 'Конфликт данных (возможно, дубликат).' });
        if (err.code === '22007' || err.code === '22008') return res.status(400).json({ error: 'Некорректный формат даты/времени.' });
        if (err.code === '23502') return res.status(400).json({ error: 'Отсутствует обязательное поле.' });
        
        res.status(500).json({ error: 'Внутренняя ошибка сервера при создании напоминания.', details: err.message });
    }
});

// GET /api/reminders - Получение списка напоминаний для аптечки, с опциональной фильтрацией по medicine_id
app.get('/api/reminders', async (req, res) => {
    const { medicine_id, pharmacy_id } = req.query;

    // Валидация pharmacy_id
    if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
        return res.status(400).json({ error: 'Некорректный или отсутствующий идентификатор аптечки (pharmacy_id).' });
    }

    // Валидация medicine_id, если он предоставлен
    let numericMedicineId = null;
    if (medicine_id !== undefined) { // Проверяем, что параметр вообще есть
        if (medicine_id === null || medicine_id.trim() === '') { // Если передан как пустой
             numericMedicineId = null; // Игнорируем пустой medicine_id
        } else {
            numericMedicineId = parseInt(medicine_id, 10);
            if (isNaN(numericMedicineId) || numericMedicineId <= 0) {
                return res.status(400).json({ error: 'Некорректный формат ID лекарства для фильтрации.' });
            }
        }
    }

    try {
        let queryText = 'SELECT * FROM reminders WHERE pharmacy_id = $1';
        const queryParams = [pharmacy_id];
        let paramCount = 1;

        if (numericMedicineId !== null) { // Используем проверенный numericMedicineId
            paramCount++;
            queryText += ` AND medicine_id = $${paramCount}`;
            queryParams.push(numericMedicineId);
        }

        queryText += ' ORDER BY start_date ASC, reminder_time ASC;';
        
        const { rows } = await db.query(queryText, queryParams);

        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.send(MessagePack.encode(rows));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                console.warn(`GET /api/reminders (pharmacy_id: ${pharmacy_id}): LWP для списка напоминаний не реализован, отдается JSON.`);
                res.set('Content-Type', 'application/json');
                res.status(200).json(rows);
                break;
            default: // 'application/json' или если ничего не подошло
                res.set('Content-Type', 'application/json');
                res.status(200).json(rows);
                break;
        }
    } catch (err) {
        console.error(`GET /api/reminders: Ошибка при получении списка напоминаний для pharmacy_id [${pharmacy_id}], medicine_id [${medicine_id}]: ${err.message}`, err.stack);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при получении списка напоминаний.' });
    }
});

// GET /api/reminders/:reminderId - Получение одного напоминания по ID для указанной аптечки
app.get('/api/reminders/:reminderId', async (req, res) => {
    const { reminderId } = req.params;
    const { pharmacy_id } = req.query;

    // Валидация входных данных
    if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
        return res.status(400).json({ error: 'Некорректный или отсутствующий идентификатор аптечки (pharmacy_id) в параметрах запроса.' });
    }

    const numericReminderId = parseInt(reminderId, 10);
    if (isNaN(numericReminderId) || numericReminderId <= 0) {
        return res.status(400).json({ error: 'Некорректный формат ID напоминания в URL.' });
    }

    try {
        const queryText = 'SELECT * FROM reminders WHERE id = $1 AND pharmacy_id = $2';
        const values = [numericReminderId, pharmacy_id];

        const { rows } = await db.query(queryText, values);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Напоминание не найдено или не принадлежит указанной аптечке.' });
        }
        const reminder = rows[0];

        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.send(MessagePack.encode(reminder));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                console.warn(`GET /api/reminders/${reminderId}: LWP для одиночного напоминания не реализован, отдается JSON.`);
                res.set('Content-Type', 'application/json');
                res.status(200).json(reminder);
                break;
            default: // 'application/json'
                res.set('Content-Type', 'application/json');
                res.status(200).json(reminder);
                break;
        }
    } catch (err) {
        console.error(`GET /api/reminders/${reminderId}: Ошибка при получении напоминания для pharmacy_id [${pharmacy_id}]: ${err.message}`, err.stack);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при получении напоминания.' });
    }
});

// PUT /api/reminders/:reminderId - Обновление существующего напоминания
app.put('/api/reminders/:reminderId', async (req, res) => {
    const { reminderId } = req.params;
    const contentType = req.get('Content-Type');
    let requestBodyData; // Данные из тела запроса после парсинга/декодирования

    try {
        // --- 1. Обработка тела запроса ---
        switch (contentType) {
            case 'application/msgpack':
                if (!(req.body instanceof Buffer)) {
                    console.error(`PUT /reminders/${reminderId}: MsgPack body is not a Buffer.`);
                    return res.status(400).json({ error: 'Тело запроса для application/msgpack должно быть Buffer' });
                }
                if (req.body.length === 0) {
                    return res.status(400).json({ error: 'Тело запроса MessagePack пустое' });
                }
                try {
                    requestBodyData = MessagePack.decode(req.body);
                } catch (decodeError) {
                    console.error(`PUT /reminders/${reminderId}: MsgPack - Ошибка декодирования:`, decodeError.message);
                    return res.status(400).json({ error: 'Ошибка декодирования MessagePack', details: decodeError.message });
                }
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                if (typeof req.body !== 'string' || req.body.trim() === '') {
                    return res.status(400).json({ error: 'Тело запроса для LWP должно быть непустой строкой' });
                }
                try {
                    // LWP для PUT напоминаний - это JSON-объект, а не LWP-массив.
                    requestBodyData = JSON.parse(req.body);
                     if (typeof requestBodyData !== 'object' || requestBodyData === null) {
                        throw new Error('LWP payload did not parse to an object.');
                    }
                } catch (e) {
                    console.error(`PUT /reminders/${reminderId}: LWP - Ошибка парсинга JSON:`, e.message);
                    return res.status(400).json({ error: 'Некорректный LWP JSON', details: e.message });
                }
                break;
            case 'application/json':
                requestBodyData = req.body;
                break;
            default:
                if (!contentType && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                    console.warn(`PUT /api/reminders/${reminderId}: Content-Type не указан, предполагается JSON.`);
                    requestBodyData = req.body;
                } else {
                    console.warn(`PUT /api/reminders/${reminderId}: Неподдерживаемый Content-Type: ${contentType} или пустое тело.`);
                    return res.status(415).json({ error: `Неподдерживаемый или отсутствующий Content-Type / тело запроса` });
                }
        }

        if (!requestBodyData || typeof requestBodyData !== 'object') {
            console.error(`PUT /api/reminders/${reminderId}: Данные тела запроса некорректны после парсинга.`, requestBodyData);
            return res.status(400).json({ error: 'Тело запроса имеет неверный формат или отсутствует' });
        }

        // --- 2. Подготовка и валидация данных ---
        const { pharmacy_id, ...fieldsToUpdate } = requestBodyData;

        if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
            return res.status(400).json({ error: 'Идентификатор аптечки (pharmacy_id) обязателен в теле запроса и не может быть пустым.' });
        }
        
        const dataForDb = prepareReminderDataForDb(fieldsToUpdate);

        const allowedFields = ['medicine_id', 'reminder_time', 'days_of_week', 'start_date', 'end_date', 'notes', 'is_active'];
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        allowedFields.forEach(field => {
            if (dataForDb.hasOwnProperty(field)) {
                if (field === 'medicine_id' && (dataForDb[field] === null || isNaN(Number(dataForDb[field])) || Number(dataForDb[field]) <= 0)) {
                     console.warn(`PUT /reminders/${reminderId}: Попытка установить некорректный medicine_id: ${dataForDb[field]}`);
                     // Пропустить или вернуть ошибку
                     return; // Пропускаем невалидный medicine_id
                }
                setClauses.push(`${field} = $${paramIndex++}`);
                values.push(dataForDb[field]);
            }
        });

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления. Передайте хотя бы одно поле для изменения.' });
        }
        
        const numericReminderId = parseInt(reminderId, 10);
        if (isNaN(numericReminderId) || numericReminderId <= 0) {
            return res.status(400).json({ error: 'Некорректный ID напоминания в URL.' });
        }
        
        values.push(numericReminderId);
        values.push(pharmacy_id);

        const queryText = `
            UPDATE reminders
            SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex++} AND pharmacy_id = $${paramIndex} 
            RETURNING *;
        `;

        // --- 3. Взаимодействие с базой данных ---
        const { rows } = await db.query(queryText, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Напоминание не найдено или не принадлежит указанной аптечке для обновления.' });
        }
        const updatedReminder = rows[0];

        // --- 4. Отправка ответа ---
        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);
        
        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.send(MessagePack.encode(updatedReminder));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                console.warn(`PUT /api/reminders/${reminderId}: LWP для ответа об обновлении напоминания пока не реализован, отдаю JSON.`);
                res.set('Content-Type', 'application/json');
                res.json(updatedReminder);
                break;
            default: // 'application/json'
                res.set('Content-Type', 'application/json');
                res.json(updatedReminder);
                break;
        }

    } catch (err) {
        console.error(`PUT /api/reminders/${reminderId}: КРИТИЧЕСКАЯ ОШИБКА: ${err.message}`, err.stack);
        if (res.headersSent) return;

        if (err.code === '23503') return res.status(400).json({ error: 'Некорректный ID лекарства.' });
        if (err.code === '22007' || err.code === '22008') return res.status(400).json({ error: 'Некорректный формат даты/времени.' });
        res.status(500).json({ error: 'Внутренняя ошибка сервера при обновлении напоминания.', details: err.message });
    }
});

// DELETE /api/reminders/:reminderId - Удаление напоминания
app.delete('/api/reminders/:reminderId', async (req, res) => {
    const { reminderId } = req.params;
    const { pharmacy_id } = req.query;

    // Валидация входных данных
    if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
        return res.status(400).json({ error: 'Некорректный или отсутствующий идентификатор аптечки (pharmacy_id) в параметрах запроса.' });
    }

    const numericReminderId = parseInt(reminderId, 10);
    if (isNaN(numericReminderId) || numericReminderId <= 0) {
        return res.status(400).json({ error: 'Некорректный формат ID напоминания в URL.' });
    }

    try {
        const queryText = 'DELETE FROM reminders WHERE id = $1 AND pharmacy_id = $2 RETURNING *;';
        const values = [numericReminderId, pharmacy_id];

        const result = await db.query(queryText, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Напоминание не найдено или не принадлежит указанной аптечке.' });
        }
        
        const deletedReminder = result.rows[0];

        // Отправка ответа
        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.status(200).send(MessagePack.encode(deletedReminder));
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                console.warn(`DELETE /api/reminders/${reminderId}: LWP для ответа об удалении напоминания пока не реализован, отдаю JSON.`);
                res.set('Content-Type', 'application/json');
                res.status(200).json({ message: 'Напоминание успешно удалено.', deletedReminder });
                break;
            default: // 'application/json'
                res.set('Content-Type', 'application/json');
                res.status(200).json({ message: 'Напоминание успешно удалено.', deletedReminder });
                break;
        }
    } catch (err) {
        console.error(`DELETE /api/reminders/${reminderId}: Ошибка при удалении для pharmacy_id [${pharmacy_id}]: ${err.message}`, err.stack);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Внутренняя ошибка сервера при удалении напоминания.', details: err.message });
        }
    }
});

// GET /api/medicines/:medicineId/usagehistory - Получение истории использования для конкретного лекарства
app.get('/api/medicines/:medicineId/usagehistory', async (req, res) => {
    const { medicineId } = req.params;
    const { pharmacy_id } = req.query;

    // Валидация входных данных
    if (!pharmacy_id || typeof pharmacy_id !== 'string' || pharmacy_id.trim() === '') {
        return res.status(400).json({ error: 'Некорректный или отсутствующий идентификатор аптечки (pharmacy_id) в параметрах запроса.' });
    }

    const numericMedicineId = parseInt(medicineId, 10);
    if (isNaN(numericMedicineId) || numericMedicineId <= 0) {
        return res.status(400).json({ error: 'Некорректный формат ID лекарства в URL.' });
    }

    try {
        const queryText = `
            SELECT uh.id, uh.quantity_taken, uh.unit, uh.usage_timestamp, m.name as medicine_name
            FROM usage_history uh
            JOIN medicines m ON uh.medicine_id = m.id
            WHERE uh.medicine_id = $1 AND uh.pharmacy_id = $2 
            ORDER BY uh.usage_timestamp DESC;
        `;
        const values = [numericMedicineId, pharmacy_id];
        
        const { rows } = await db.query(queryText, values);

        const preferredType = req.accepts(['application/json', 'application/lwp', 'application/x-lwp-v1', 'application/msgpack']);

        switch (preferredType) {
            case 'application/msgpack':
                res.set('Content-Type', 'application/msgpack');
                res.send(MessagePack.encode(rows)); // rows - это массив объектов истории
                break;
            case 'application/lwp':
            case 'application/x-lwp-v1':
                console.warn(`GET /api/medicines/${medicineId}/usagehistory: LWP для истории пока не реализован, отдаю JSON.`);
                res.set('Content-Type', 'application/json');
                res.status(200).json(rows);
                break;
            default: // 'application/json' или если ничего не подошло
                res.set('Content-Type', 'application/json');
                res.status(200).json(rows);
                break;
        }
    } catch (err) {
        console.error(`GET /api/medicines/${medicineId}/usagehistory: Ошибка для pharmacy_id [${pharmacy_id}]: ${err.message}`, err.stack);
        res.status(500).json({ error: 'Внутренняя ошибка сервера при получении истории использования.' });
    }
});

app.post('/api/pharmacies/new', (req, res) => {
    const newPharmacyId = uuidv4();
    res.status(201).json({ pharmacy_id: newPharmacyId });
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}, обрабатывает JSON, LWP, MessagePack`);
});