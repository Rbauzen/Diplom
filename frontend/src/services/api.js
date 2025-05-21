// frontend/src/services/api.js
import axios from 'axios';
import { serializeToLWP, deserializeFromLWP } from '../utils/lwp-serializer';
import * as MessagePack from '@msgpack/msgpack';

const API_BASE_URL = '/api';

const prepareDataForSerialization = (data) => {
    if (!data) return null;
    if (Array.isArray(data)) {
        return data.map(item => prepareDataForSerialization(item));
    }
    const prepared = { ...data };
    const dateFieldsToConvert = ['expiry_date', 'start_date', 'end_date'];
    dateFieldsToConvert.forEach(field => {
        if (prepared[field] && typeof prepared[field] === 'string') {
            if (prepared[field].trim() === '') {
                prepared[field] = null;
            } else {
                const dateObj = new Date(prepared[field]);
                if (!isNaN(dateObj.getTime())) prepared[field] = dateObj;
            }
        } else if (prepared[field] === undefined && field === 'end_date') {
            prepared[field] = null;
        }
    });
    return prepared;
};

const postProcessDeserializedData = (data) => {
    if (!data) return null;
    if (Array.isArray(data)) {
        return data.map(item => postProcessDeserializedData(item));
    }
    const processed = { ...data };
    const dateFields = ['expiry_date', 'start_date', 'end_date', 'created_at', 'updated_at', 'usage_timestamp'];
    dateFields.forEach(field => {
        if (processed[field] && !(processed[field] instanceof Date)) {
            const dateObj = new Date(processed[field]);
            if (!isNaN(dateObj.getTime())) processed[field] = dateObj;
        }
    });
    return processed;
};

const getRequestConfig = (protocol, dataPayload = null) => {
    const config = { headers: {} };
    let body = dataPayload ? prepareDataForSerialization(dataPayload) : null;

    switch (protocol) {
        case 'msgpack':
            config.headers['Accept'] = 'application/msgpack';
            config.responseType = 'arraybuffer';
            if (body) {
                config.headers['Content-Type'] = 'application/msgpack';
                try {
                    body = MessagePack.encode(body);
                } catch (encodeError) {
                    console.error('[API Service] MessagePack encode error:', encodeError, 'Data:', body);
                    throw encodeError;
                }
            }
            break;
        case 'lwp':
            config.headers['Accept'] = 'application/lwp';
            if (body) {
                config.headers['Content-Type'] = 'application/lwp';
                try {
                    if (body.name !== undefined && body.expiry_date !== undefined && body.unit !== undefined && body.reminder_time === undefined && body.quantity_taken === undefined) {
                        if (typeof body !== 'string') {
                             // Для POST лекарств:
                            if (body.id === undefined || body.id === null) { // Предполагаем, что это создание
                                body = JSON.stringify(serializeToLWP(body));
                            } else { // Предполагаем, что это обновление или другая сущность, шлем как JSON-строку
                                body = JSON.stringify(body);
                            }
                        }
                    } else { // Для напоминаний, usageData и т.д.
                         body = JSON.stringify(body);
                    }

                } catch (lwpError) {
                    console.error('[API Service] LWP serialization error:', lwpError, 'Data:', body);
                    throw lwpError;
                }
            }
            break;
        default: // JSON
            config.headers['Accept'] = 'application/json';
            if (body) {
                config.headers['Content-Type'] = 'application/json';
            }
            break;
    }
    return { config, body };
};


const handleResponse = async (response, requestedProtocol) => {
    const contentType = response.headers['content-type'];
    let deserializedData;

    if (contentType && contentType.includes('application/msgpack')) {
        if (!(response.data instanceof ArrayBuffer)) {
            console.error("MSGPACK Ответ: response.data не является ArrayBuffer!", response.data);
            throw new Error("Некорректный формат ArrayBuffer ответа для MessagePack");
        }
        try {
            deserializedData = MessagePack.decode(new Uint8Array(response.data));
        } catch (e) {
            console.error("MSGPACK Ответ: Ошибка декодирования!", e, "Data was:", response.data);
            throw e;
        }
    } else if (contentType && (contentType.includes('application/lwp') || contentType.includes('application/x-lwp-v1'))) {
        let lwpPayload;
        if (typeof response.data === 'string') {
            try {
                lwpPayload = JSON.parse(response.data);
            } catch (e) {
                console.error("LWP Ответ: Ошибка парсинга JSON строки!", e, "Data was:", response.data);
                throw e;
            }
        } else if (typeof response.data === 'object' && response.data !== null) {
            lwpPayload = response.data;
        } else {
            console.error("LWP Ответ: Неожиданный тип данных!", typeof response.data, response.data);
            throw new Error("Некорректный формат LWP ответа");
        }

        if (Array.isArray(lwpPayload) && lwpPayload.length > 0 && Array.isArray(lwpPayload[0]) && lwpPayload[0].length >= 13 /* Мин. длина LWP массива лекарства с pharmacy_id */) {
            deserializedData = lwpPayload.map(lwpItemArray => deserializeFromLWP(lwpItemArray));
        } else if (Array.isArray(lwpPayload) && lwpPayload.length >= 13 && !Array.isArray(lwpPayload[0])) {
            deserializedData = deserializeFromLWP(lwpPayload);
        } else if (Array.isArray(lwpPayload) && lwpPayload.length === 0){
            deserializedData = [];
        } else {
            deserializedData = lwpPayload;
        }
    } else { // JSON
        deserializedData = response.data;
    }
    return postProcessDeserializedData(deserializedData);
};

// --- API МЕТОДЫ (все принимают pharmacyId) ---

// Лекарства
export const fetchMedicines = async (protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для fetchMedicines"));
    const { config } = getRequestConfig(protocol);
    const response = await axios.get(`${API_BASE_URL}/medicines?pharmacy_id=${pharmacyId}`, config);
    return handleResponse(response, protocol);
};

export const addMedicine = async (medicineData, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для addMedicine"));
    const dataToSend = { ...medicineData, pharmacy_id: pharmacyId };
    const { config, body } = getRequestConfig(protocol, dataToSend);
    const response = await axios.post(`${API_BASE_URL}/medicines`, body, config);
    return handleResponse(response, protocol);
};

export const updateMedicine = async (id, medicineData, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для updateMedicine"));
    const dataToSend = { ...medicineData, pharmacy_id: pharmacyId };
    const { config, body } = getRequestConfig(protocol, dataToSend);
    const response = await axios.put(`${API_BASE_URL}/medicines/${id}`, body, config);
    return handleResponse(response, protocol);
};

export const deleteMedicine = async (id, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для deleteMedicine"));
    const { config } = getRequestConfig(protocol);
    const response = await axios.delete(`${API_BASE_URL}/medicines/${id}?pharmacy_id=${pharmacyId}`, config);
    return handleResponse(response, protocol);
};

export const consumeMedicine = async (medicineId, usageData, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для consumeMedicine"));
    const dataToSend = { ...usageData, pharmacy_id: pharmacyId };
    const { config, body } = getRequestConfig(protocol, dataToSend);
    const response = await axios.post(`${API_BASE_URL}/medicines/${medicineId}/use`, body, config);
    return handleResponse(response, protocol);
};

export const fetchUsageHistory = async (medicineId, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для fetchUsageHistory"));
    const { config } = getRequestConfig(protocol);
    const response = await axios.get(`${API_BASE_URL}/medicines/${medicineId}/usagehistory?pharmacy_id=${pharmacyId}`, config);
    return handleResponse(response, protocol);
};

// Напоминания
export const fetchReminders = async (protocol, pharmacyId, medicineIdFilter = null) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для fetchReminders"));
    let url = `${API_BASE_URL}/reminders?pharmacy_id=${pharmacyId}`;
    if (medicineIdFilter) {
        url += `&medicine_id=${medicineIdFilter}`;
    }
    const { config } = getRequestConfig(protocol);
    const response = await axios.get(url, config);
    return handleResponse(response, protocol);
};

export const fetchReminderById = async (id, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для fetchReminderById"));
    const { config } = getRequestConfig(protocol);
    const response = await axios.get(`${API_BASE_URL}/reminders/${id}?pharmacy_id=${pharmacyId}`, config);
    return handleResponse(response, protocol);
};

export const addReminder = async (reminderData, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для addReminder"));
    const dataToSend = { ...reminderData, pharmacy_id: pharmacyId };
    const { config, body } = getRequestConfig(protocol, dataToSend);
    const response = await axios.post(`${API_BASE_URL}/reminders`, body, config);
    return handleResponse(response, protocol);
};

export const updateReminder = async (id, reminderData, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для updateReminder"));
    const dataToSend = { ...reminderData, pharmacy_id: pharmacyId };
    const { config, body } = getRequestConfig(protocol, dataToSend);
    const response = await axios.put(`${API_BASE_URL}/reminders/${id}`, body, config);
    return handleResponse(response, protocol);
};

export const deleteReminder = async (id, protocol, pharmacyId) => {
    if (!pharmacyId) return Promise.reject(new Error("pharmacyId не предоставлен для deleteReminder"));
    const { config } = getRequestConfig(protocol);
    const response = await axios.delete(`${API_BASE_URL}/reminders/${id}?pharmacy_id=${pharmacyId}`, config);
    return handleResponse(response, protocol);
};