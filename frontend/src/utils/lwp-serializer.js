// frontend/src/utils/lwp-serializer.js
import LWP_UNITS_CONFIG from './lwp-config';

export function formatDateToYYYYMMDD(dateInput) {
    if (!dateInput) return null;
    const date = (typeof dateInput === 'string') ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return null;

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

// Вспомогательная функция: "YYYYMMDD" -> Date
export function parseYYYYMMDDToDate(yyyymmddString) {
    if (!yyyymmddString || typeof yyyymmddString !== 'string' || yyyymmddString.length !== 8) return null;
    const year = parseInt(yyyymmddString.substring(0, 4), 10);
    const month = parseInt(yyyymmddString.substring(4, 6), 10) - 1;
    const day = parseInt(yyyymmddString.substring(6, 8), 10);

    const date = new Date(Date.UTC(year, month, day));
    if (isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
        return null;
    }
    return date;
}

export function serializeToLWP(medicineObject) {
    if (!medicineObject) return null;
    if (medicineObject.pharmacy_id === undefined || medicineObject.pharmacy_id === null) {
        console.error("serializeToLWP: pharmacy_id is missing in medicineObject!", medicineObject);
        return null; 
    }

    let unitIdx = null;
    if (medicineObject.unit !== undefined && medicineObject.unit !== null) {
        unitIdx = LWP_UNITS_CONFIG.MAP[medicineObject.unit];
        if (unitIdx === undefined) { // Если юнит не найден в карте
            console.warn(`LWP Serialize: Неизвестная единица измерения "${medicineObject.unit}". Будет сериализовано как null.`);
            unitIdx = null;
        }
    }

    const lwpArray = [
        medicineObject.pharmacy_id,                                                           // 0
        medicineObject.id !== undefined ? medicineObject.id : null,                           // 1
        medicineObject.name || null,                                                          // 2
        medicineObject.expiry_date ? formatDateToYYYYMMDD(new Date(medicineObject.expiry_date)) : null, // 3
        medicineObject.quantity !== undefined ? Number(medicineObject.quantity) : null,       // 4
        unitIdx,                                                                              // 5
        medicineObject.instructions || null,                                                  // 6
        medicineObject.dosage || null,                                                        // 7
        medicineObject.frequency || null,                                                     // 8
        (medicineObject.min_threshold !== undefined && medicineObject.min_threshold !== null) ? Number(medicineObject.min_threshold) : null, // 9
        medicineObject.storage_location || null,                                              // 10
        medicineObject.notes || null,                                                         // 11
        medicineObject.image_url || null,                                                     // 12
    ];

    if (medicineObject.hasOwnProperty('created_at')) {
        lwpArray.push(medicineObject.created_at ? Math.floor(new Date(medicineObject.created_at).getTime() / 1000) : null);
    }
    if (medicineObject.hasOwnProperty('updated_at')) {
        lwpArray.push(medicineObject.updated_at ? Math.floor(new Date(medicineObject.updated_at).getTime() / 1000) : null);
    }
    
    return lwpArray;
}

export function deserializeFromLWP(lwpArray) {
    if (!lwpArray || !Array.isArray(lwpArray) || (lwpArray.length !== 13 && lwpArray.length !== 15)) {
        console.warn("LWP Deserialize: Некорректный или несоответствующей длины массив LWP.", lwpArray, "Длина:", lwpArray ? lwpArray.length : 'null');
        return null;
    }

    const expiryDateObj = lwpArray[3] ? parseYYYYMMDDToDate(lwpArray[3]) : null;
    const createdAt = lwpArray.length >= 14 && lwpArray[13] !== null ? new Date(lwpArray[13] * 1000) : null;
    const updatedAt = lwpArray.length >= 15 && lwpArray[14] !== null ? new Date(lwpArray[14] * 1000) : null;

    let unitStr = null;
    if (lwpArray[5] !== undefined && lwpArray[5] !== null && LWP_UNITS_CONFIG.LIST[lwpArray[5]] !== undefined) {
         unitStr = LWP_UNITS_CONFIG.LIST[lwpArray[5]];
    } else if (lwpArray[5] !== null) {
        console.warn(`LWP Deserialize: Некорректный или отсутствующий индекс единицы измерения: "${lwpArray[5]}".`);
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
        ...(createdAt && { created_at: createdAt }),
        ...(updatedAt && { updated_at: updatedAt }),
    };
    
    return medicineObject;
}