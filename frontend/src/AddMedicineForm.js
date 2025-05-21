// frontend/src/AddMedicineForm.js
import React, { useState, useEffect } from 'react';
import { addMedicine, updateMedicine } from './services/api';
import { useProtocol } from './contexts/ProtocolContext';

const dateToInputFormat = (date) => {
    if (!date) return '';
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return date;
    }
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
};

function AddMedicineForm({ 
    onMedicineAddedOrUpdated, 
    onCancel, 
    editingMedicine, 
    pharmacyId
}) {
    const initialFormState = {
        name: '',
        expiry_date: '',
        quantity: '',
        unit: 'таб.',
        instructions: '',
        dosage: '',
        frequency: '',
        min_threshold: '',
        storage_location: '',
        notes: '',
        image_url: '',
    };

    const [formData, setFormData] = useState(initialFormState);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const isEditing = !!editingMedicine;
    const { currentProtocol } = useProtocol();

    useEffect(() => {
        console.log("AddMedicineForm mounted/updated. editingMedicine:", editingMedicine, "pharmacyId prop:", pharmacyId); // Лог для отладки pharmacyId
        if (isEditing && editingMedicine) {
            setFormData({
                name: editingMedicine.name || '',
                expiry_date: dateToInputFormat(editingMedicine.expiry_date),
                quantity: editingMedicine.quantity !== undefined ? String(editingMedicine.quantity) : '',
                unit: editingMedicine.unit || 'таб.',
                instructions: editingMedicine.instructions || '',
                dosage: editingMedicine.dosage || '',
                frequency: editingMedicine.frequency || '',
                min_threshold: (editingMedicine.min_threshold !== undefined && editingMedicine.min_threshold !== null) ? String(editingMedicine.min_threshold) : '',
                storage_location: editingMedicine.storage_location || '',
                notes: editingMedicine.notes || '',
                image_url: editingMedicine.image_url || '',
            });
        } else {
            setFormData(initialFormState);
        }
        setError('');
        setSuccess('');
    }, [editingMedicine, isEditing, pharmacyId]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Валидация полей формы
        if (!formData.name || !formData.expiry_date || formData.quantity === '' || !formData.unit) {
            setError('Пожалуйста, заполните все обязательные поля: Название, Срок годности, Количество, Ед. изм.');
            return;
        }
        if (parseInt(formData.quantity, 10) < 0) {
            setError('Количество не может быть отрицательным.');
            return;
        }
        if (formData.min_threshold && parseInt(formData.min_threshold, 10) < 0) {
            setError('Минимальный порог не может быть отрицательным.');
            return;
        }

        // Проверка наличия pharmacyId ПЕРЕД вызовом API
        if (!pharmacyId) {
            console.error("AddMedicineForm handleSubmit Error: pharmacyId is missing!");
            setError("Ошибка: ID аптечки не определен. Невозможно сохранить лекарство. Пожалуйста, перезагрузите страницу или создайте/присоединитесь к аптечке.");
            return;
        }

        const dataToSubmit = {
            name: formData.name,
            expiry_date: formData.expiry_date, // строка "YYYY-MM-DD"
            quantity: parseInt(formData.quantity, 10),
            unit: formData.unit,
            instructions: formData.instructions,
            dosage: formData.dosage,
            frequency: formData.frequency,
            min_threshold: formData.min_threshold ? parseInt(formData.min_threshold, 10) : null,
            storage_location: formData.storage_location,
            notes: formData.notes,
            image_url: formData.image_url,
        };

        try {
            let responseData;
            console.log(`AddMedicineForm: Отправка данных с протоколом ${currentProtocol.toUpperCase()}, pharmacyId: ${pharmacyId}`, dataToSubmit);
            if (isEditing) {
                responseData = await updateMedicine(editingMedicine.id, dataToSubmit, currentProtocol, pharmacyId);
                setSuccess(`Лекарство "${responseData.name}" успешно обновлено!`);
            } else {
                responseData = await addMedicine(dataToSubmit, currentProtocol, pharmacyId); // <<--- ПЕРЕДАЕМ pharmacyId
                setSuccess(`Лекарство "${responseData.name}" успешно добавлено!`);
            }

            setTimeout(() => {
                if (onMedicineAddedOrUpdated) {
                    onMedicineAddedOrUpdated(responseData);
                }
                if (!isEditing) {
                    setFormData(initialFormState);
                }
            }, 1500);

        } catch (err) {
            console.error(`Ошибка при ${isEditing ? 'обновлении' : 'добавлении'} лекарства (AddMedicineForm):`, err);
            const errorMsg = err.response?.data?.error || err.message || `Не удалось ${isEditing ? 'обновить' : 'добавить'} лекарство.`;
            setError(errorMsg);
        }
    };

    return (
        <div>
            <h3>{isEditing ? 'Редактировать лекарство' : 'Добавить новое лекарство'} ({currentProtocol.toUpperCase()})</h3>
            {!pharmacyId && <p style={{color: 'orange', fontWeight: 'bold'}}>Внимание: ID аптечки не определен. Сохранение может не сработать.</p>} {/* Дополнительное предупреждение */}
            {error && <p style={{ color: 'red', fontWeight: 'bold' }}>{error}</p>}
            {success && <p style={{ color: 'green', fontWeight: 'bold' }}>{success}</p>}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '500px', margin: '0 auto' }}>
                <div>
                    <label htmlFor="name">Название*:</label>
                    <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required />
                </div>
                <div>
                    <label htmlFor="expiry_date">Срок годности (ГГГГ-ММ-ДД)*:</label>
                    <input type="date" id="expiry_date" name="expiry_date" value={formData.expiry_date} onChange={handleChange} required />
                </div>
                <div>
                    <label htmlFor="quantity">Количество*:</label>
                    <input type="number" id="quantity" name="quantity" value={formData.quantity} onChange={handleChange} min="0" required />
                </div>
                <div>
                    <label htmlFor="unit">Ед. изм.*:</label>
                    <select id="unit" name="unit" value={formData.unit} onChange={handleChange} required>
                        <option value="таб.">таб.</option>
                        <option value="капс.">капс.</option>
                        <option value="амп.">амп.</option>
                        <option value="мл">мл</option>
                        <option value="г">г</option>
                        <option value="шт.">шт.</option>
                        <option value="пакетик">пакетик</option>
                        <option value="суппозиторий">суппозиторий</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="instructions">Способ приёма (Инструкция):</label>
                    <textarea id="instructions" name="instructions" value={formData.instructions} onChange={handleChange} />
                </div>
                <div>
                    <label htmlFor="dosage">Дозировка:</label>
                    <input type="text" id="dosage" name="dosage" value={formData.dosage} onChange={handleChange} />
                </div>
                <div>
                    <label htmlFor="frequency">Частота приёма:</label>
                    <input type="text" id="frequency" name="frequency" value={formData.frequency} onChange={handleChange} />
                </div>
                <div>
                    <label htmlFor="min_threshold">Минимальный порог (для уведомлений):</label>
                    <input type="number" id="min_threshold" name="min_threshold" value={formData.min_threshold} onChange={handleChange} min="0" placeholder="например, 5" />
                </div>
                <div>
                    <label htmlFor="storage_location">Место хранения:</label>
                    <input type="text" id="storage_location" name="storage_location" value={formData.storage_location} onChange={handleChange} />
                </div>
                <div>
                    <label htmlFor="notes">Заметки/Комментарии:</label>
                    <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} />
                </div>
                <div>
                    <label htmlFor="image_url"> URL фото упаковки:</label>
                    <input type="url" id="image_url" name="image_url" value={formData.image_url} onChange={handleChange} placeholder="https://example.com/image.jpg" />
                </div>
                <div style={{ marginTop: '10px' }}>
                    <button type="submit" disabled={!pharmacyId /* Блокирует кнопку, если нет pharmacyId */ }>
                        {isEditing ? 'Сохранить изменения' : 'Добавить лекарство'}
                    </button>
                    <button type="button" onClick={onCancel}>Отмена</button>
                </div>
            </form>
        </div>
    );
}

export default AddMedicineForm;