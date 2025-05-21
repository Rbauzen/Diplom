// backend/utils/lwp-serializer.js
const LWP_UNITS_CONFIG = require('./lwp-config');

/**
 * Форматирует объект Date или строку даты в "YYYYMMDD".
 * @param {Date|string|null|undefined} dateInput - Входная дата.
 * @returns {string|null} Строка "YYYYMMDD" или null, если дата невалидна.
 */
function formatDateToYYYYMMDD(dateInput) {
    if (!dateInput) return null;
    
    const date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    
    if (isNaN(date.getTime())) {
        // console.warn(`formatDateToYYYYMMDD: Получена невалидная дата: ${dateInput}`);
        return null;
    }

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * Парсит строку "YYYYMMDD" в объект Date (UTC).
 * @param {string|null|undefined} yyyymmddString - Строка даты.
 * @returns {Date|null} Объект Date или null, если строка невалидна.
 */
function parseYYYYMMDDToDate(yyyymmddString) {
    if (!yyyymmddString || typeof yyyymmddString !== 'string' || yyyymmddString.length !== 8) {
        return null;
    }
    const year = parseInt(yyyymmddString.substring(0, 4), 10);
    const month = parseInt(yyyymmddString.substring(4, 6), 10) - 1; // Месяцы в Date 0-11
    const day = parseInt(yyyymmddString.substring(6, 8), 10);

    // Проверка на NaN после parseInt
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return null;
    }

    const date = new Date(Date.UTC(year, month, day));
    
    // Проверка, что дата валидна и соответствует введенным числам
    if (isNaN(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
        return null;
    }
    return date;
}

// Порядок полей LWPv1 (с pharmacy_id):
// 0: pharmacy_id (string)
// 1: id (number | null)
// 2: name (string)
// 3: expiry_date_str ("YYYYMMDD" | null)
// 4: quantity (number | null)
// 5: unit_idx (number | null)
// 6: instructions_str (string | null)
// 7: dosage_str (string | null)
// 8: frequency_str (string | null)
// 9: min_threshold_val (number | null)
// 10: storage_location_str (string | null)
// 11: notes_str (string | null)
// 12: image_url_str (string | null)
// --- Только при чтении с сервера ---
// 13: created_at_ts (number | null)
// 14: updated_at_ts (number | null)
// Ожидаемая длина: 13 для создания/обновления (клиент -> сервер), 15 для чтения (сервер -> клиент)

function serializeToLWP(medicineObject) {
    if (!medicineObject || typeof medicineObject !== 'object') {
        return null;
    }

    if (medicineObject.pharmacy_id === undefined || medicineObject.pharmacy_id === null || String(medicineObject.pharmacy_id).trim() === '') {
        console.error("serializeToLWP: pharmacy_id отсутствует или пуст в объекте лекарства!", medicineObject);
        return null; 
    }

    let unitIdx = null;
    if (medicineObject.unit !== undefined && medicineObject.unit !== null) {
        unitIdx = LWP_UNITS_CONFIG.MAP[medicineObject.unit];
        if (unitIdx === undefined) {
            console.warn(`LWP Serialize: Неизвестная единица измерения "${medicineObject.unit}" для pharmacy_id ${medicineObject.pharmacy_id}. Будет сериализовано как null.`);
            unitIdx = null;
        }
    }

    const lwpArray = [
        String(medicineObject.pharmacy_id),                                                              // 0
        medicineObject.id !== undefined && medicineObject.id !== null ? Number(medicineObject.id) : null, // 1
        medicineObject.name || null,                                                                      // 2
        medicineObject.expiry_date ? formatDateToYYYYMMDD(medicineObject.expiry_date) : null,             // 3 (ожидает Date или строку, которую можно преобразовать в Date)
        medicineObject.quantity !== undefined && medicineObject.quantity !== null ? Number(medicineObject.quantity) : null, // 4
        unitIdx,                                                                                          // 5
        medicineObject.instructions || null,                                                              // 6
        medicineObject.dosage || null,                                                                    // 7
        medicineObject.frequency || null,                                                                 // 8
        (medicineObject.min_threshold !== undefined && medicineObject.min_threshold !== null) ? Number(medicineObject.min_threshold) : null, // 9
        medicineObject.storage_location || null,                                                          // 10
        medicineObject.notes || null,                                                                     // 11
        medicineObject.image_url || null,                                                                 // 12
    ];

    if (medicineObject.hasOwnProperty('created_at')) {
        lwpArray.push(medicineObject.created_at ? Math.floor(new Date(medicineObject.created_at).getTime() / 1000) : null);
    }
    if (medicineObject.hasOwnProperty('updated_at')) {
        lwpArray.push(medicineObject.updated_at ? Math.floor(new Date(medicineObject.updated_at).getTime() / 1000) : null);
    }
    
    return lwpArray;
}

function deserializeFromLWP(lwpArray) {
    if (!lwpArray || !Array.isArray(lwpArray) || (lwpArray.length !== 13 && lwpArray.length !== 15)) {
        return null;
    }

    const expiryDateObj = lwpArray[3] ? parseYYYYMMDDToDate(lwpArray[3]) : null;
    const createdAt = lwpArray.length >= 14 && lwpArray[13] !== null ? new Date(lwpArray[13] * 1000) : null;
    const updatedAt = lwpArray.length >= 15 && lwpArray[14] !== null ? new Date(lwpArray[14] * 1000) : null;

    let unitStr = null;
    if (lwpArray[5] !== undefined && lwpArray[5] !== null) {
        unitStr = LWP_UNITS_CONFIG.LIST[lwpArray[5]];
        if (unitStr === undefined) {
            console.warn(`LWP Deserialize: Некорректный индекс единицы измерения: "${lwpArray[5]}" в массиве:`, lwpArray);
            unitStr = null; // Если индекс невалиден
        }
    }

    const medicineObject = {
        pharmacy_id: lwpArray[0],
        id: lwpArray[1],
        name: lwpArray[2],
        expiry_date: expiryDateObj,
        quantity: lwpArray[4],
        unit: unitStr,
        instructions: lwpArray[6],
        dosage: lwpArray[7],
        frequency: lwpArray[8],
        min_threshold: lwpArray[9],
        storage_location: lwpArray[10],
        notes: lwpArray[11],
        image_url: lwpArray[12],
    };
    
    if (lwpArray.length >= 14 && lwpArray[13] !== undefined) {
        medicineObject.created_at = createdAt;
    }
    if (lwpArray.length >= 15 && lwpArray[14] !== undefined) {
        medicineObject.updated_at = updatedAt;
    }
    
    return medicineObject;
}

module.exports = {
    serializeToLWP,
    deserializeFromLWP,
};