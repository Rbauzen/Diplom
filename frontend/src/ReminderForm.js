// frontend/src/ReminderForm.js
import React, { useState, useEffect } from 'react';
import { addReminder, updateReminder, fetchMedicines } from './services/api';
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

const daysOfWeekOptions = [
    { id: '1', name: 'Пн' }, { id: '2', name: 'Вт' }, { id: '3', name: 'Ср' },
    { id: '4', name: 'Чт' }, { id: '5', name: 'Пт' }, { id: '6', name: 'Сб' }, { id: '7', name: 'Вс' }
];

function ReminderForm({
    onReminderProcessed,
    onCancel,
    editingReminder,
    preselectedMedicineId,
    pharmacyId
}) {
    const getInitialState = () => ({
        medicine_id: preselectedMedicineId || '',
        reminder_time: '09:00',
        days_of_week: [],
        start_date: dateToInputFormat(new Date()),
        end_date: '',
        notes: '',
        is_active: true,
    });

    const [formData, setFormData] = useState(getInitialState());
    const [medicines, setMedicines] = useState([]);
    const [loadingMedicines, setLoadingMedicines] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const isEditing = !!editingReminder;
    const { currentProtocol } = useProtocol();

    useEffect(() => {
        if (!pharmacyId) {
            setMedicines([]);
            setLoadingMedicines(false);
            return;
        }
        setLoadingMedicines(true);
        fetchMedicines(currentProtocol, pharmacyId)
            .then(data => {
                setMedicines(data || []);
            })
            .catch(err => {
                console.error("ReminderForm: Ошибка загрузки лекарств:", err.message);
                setError("Не удалось загрузить список лекарств для выбора.");
            })
            .finally(() => {
                setLoadingMedicines(false);
            });
    }, [currentProtocol, pharmacyId]);

    // Заполнение формы при редактировании или предвыборе
    useEffect(() => {
        if (isEditing && editingReminder) {
            setFormData({
                medicine_id: String(editingReminder.medicine_id || ''),
                reminder_time: editingReminder.reminder_time ? editingReminder.reminder_time.substring(0, 5) : '09:00',
                days_of_week: editingReminder.days_of_week ? editingReminder.days_of_week.split(',').map(String) : [],
                start_date: dateToInputFormat(editingReminder.start_date),
                end_date: dateToInputFormat(editingReminder.end_date),
                notes: editingReminder.notes || '',
                is_active: editingReminder.is_active !== undefined ? editingReminder.is_active : true,
            });
        } else {
            // Сбрасывает форму, но учитываем preselectedMedicineId
            setFormData(prev => ({
                ...getInitialState(), 
                medicine_id: preselectedMedicineId || prev.medicine_id || '', // Сохраняет medicine_id если он был, или preselected
            }));
        }
        // Сбрасывает сообщения при инициализации/переинициализации формы
        setError('');
        setSuccess('');
    }, [editingReminder, isEditing, preselectedMedicineId]);


    const handleDaysOfWeekChange = (dayId) => {
        setFormData(prev => {
            const newDays = prev.days_of_week.includes(dayId)
                ? prev.days_of_week.filter(d => d !== dayId)
                : [...prev.days_of_week, dayId];
            return { ...prev, days_of_week: newDays.sort((a, b) => parseInt(a) - parseInt(b)) };
        });
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === "days_of_week_all") {
            setFormData(prev => ({ ...prev, days_of_week: checked ? daysOfWeekOptions.map(d => d.id) : [] }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!pharmacyId) {
            console.error("ReminderForm handleSubmit: pharmacyId отсутствует!");
            setError("Критическая ошибка: ID аптечки не определен. Невозможно сохранить напоминание.");
            return;
        }

        if (!formData.medicine_id || !formData.reminder_time || !formData.start_date) {
            setError('Обязательные поля: Лекарство, Время напоминания, Дата начала.');
            return;
        }
        if (formData.end_date && formData.start_date && new Date(formData.end_date) < new Date(formData.start_date)) {
            setError('Дата окончания не может быть раньше даты начала.');
            return;
        }

        const dataToSubmit = {
            medicine_id: parseInt(formData.medicine_id, 10),
            reminder_time: formData.reminder_time,
            days_of_week: formData.days_of_week.length > 0 ? formData.days_of_week.join(',') : null,
            start_date: formData.start_date,
            end_date: formData.end_date || null,
            notes: formData.notes.trim() === '' ? null : formData.notes.trim(), // Отправляем null, если заметки пустые
            is_active: formData.is_active,
        };

        try {
            let responseData;
            if (isEditing && editingReminder) {
                responseData = await updateReminder(editingReminder.id, dataToSubmit, currentProtocol, pharmacyId);
                setSuccess(`Напоминание для "${medicines.find(m => m.id === responseData.medicine_id)?.name || 'лекарства'}" успешно обновлено!`);
            } else {
                responseData = await addReminder(dataToSubmit, currentProtocol, pharmacyId);
                setSuccess(`Напоминание для "${medicines.find(m => m.id === responseData.medicine_id)?.name || 'лекарства'}" успешно добавлено!`);
            }

            setTimeout(() => {
                if (onReminderProcessed) {
                    onReminderProcessed(responseData);
                }
                if (!isEditing) {
                    setFormData({
                        ...getInitialState(),
                        medicine_id: preselectedMedicineId || ''
                    });
                }
            }, 1500);

        } catch (err) {
            console.error(`ReminderForm: Ошибка при ${isEditing ? 'обновлении' : 'добавлении'} напоминания:`, err.message);
            const errorMsg = err.response?.data?.error || err.message || `Не удалось ${isEditing ? 'сохранить' : 'добавить'} напоминание.`;
            setError(errorMsg);
        }
    };

    if (!pharmacyId && !loadingMedicines) {
        return (
            <div>
                <h3>{isEditing ? 'Редактировать напоминание' : 'Создать новое напоминание'}</h3>
                <p style={{color: 'orange', fontWeight: 'bold'}}>
                    ID аптечки не определен. Пожалуйста, выберите или создайте аптечку в настройках.
                </p>
                <button type="button" onClick={onCancel}>Назад</button>
            </div>
        );
    }
    
    if (loadingMedicines && medicines.length === 0) {
        return <p>Загрузка списка лекарств для выбора...</p>;
    }

    return (
        <div>
            <h3>{isEditing ? 'Редактировать напоминание' : 'Создать новое напоминание'} ({currentProtocol.toUpperCase()})</h3>
            {error && <p style={{ color: 'red', fontWeight: 'bold' }}>{error}</p>}
            {success && <p style={{ color: 'green', fontWeight: 'bold' }}>{success}</p>}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '600px', margin: '20px auto', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                <div>
                    <label htmlFor="medicine_id">Лекарство*:</label>
                    <select
                        id="medicine_id"
                        name="medicine_id"
                        value={formData.medicine_id}
                        onChange={handleChange}
                        required
                        disabled={(isEditing && !!editingReminder?.medicine_id) || (!!preselectedMedicineId && !isEditing) || loadingMedicines}
                    >
                        <option value="">{loadingMedicines ? "Загрузка лекарств..." : "Выберите лекарство"}</option>
                        {medicines.map(med => (
                            <option key={med.id} value={med.id}>{med.name}</option>
                        ))}
                    </select>
                    {medicines.length === 0 && !loadingMedicines && <p style={{fontSize: '0.8em', color: 'grey'}}>Нет доступных лекарств. Добавьте их в аптечку.</p>}
                </div>

                <div>
                    <label htmlFor="reminder_time">Время напоминания (ЧЧ:ММ)*:</label>
                    <input type="time" id="reminder_time" name="reminder_time" value={formData.reminder_time} onChange={handleChange} required />
                </div>

                <div>
                    <label>Дни недели:</label>
                    <div className="days-of-week-selector">
                        {daysOfWeekOptions.map(day => (
                            <label key={day.id} className="day-checkbox-label">
                                <input type="checkbox" value={day.id} checked={formData.days_of_week.includes(day.id)} onChange={() => handleDaysOfWeekChange(day.id)} />
                                {day.name}
                            </label>
                        ))}
                    </div>
                     <label className="day-checkbox-label all-days-label">
                        <input type="checkbox" name="days_of_week_all" checked={formData.days_of_week.length === daysOfWeekOptions.length && daysOfWeekOptions.length > 0} onChange={handleChange} />
                        Каждый день
                    </label>
                    <small style={{display: 'block', marginTop: '5px', color: '#666'}}>Если дни не выбраны, напоминание будет ежедневным.</small>
                </div>

                <div>
                    <label htmlFor="start_date">Дата начала*:</label>
                    <input type="date" id="start_date" name="start_date" value={formData.start_date} onChange={handleChange} required />
                </div>

                <div>
                    <label htmlFor="end_date">Дата окончания (необязательно):</label>
                    <input type="date" id="end_date" name="end_date" value={formData.end_date} onChange={handleChange} min={formData.start_date || undefined} />
                </div>

                <div>
                    <label htmlFor="notes">Заметки:</label>
                    <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} />
                </div>
                
                <div>
                    <label className="checkbox-label-inline">
                        <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} />
                        Активно
                    </label>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" disabled={!pharmacyId || loadingMedicines}>
                        {isEditing ? 'Сохранить изменения' : 'Создать напоминание'}
                    </button>
                    <button type="button" onClick={onCancel}>Отмена</button>
                </div>
            </form>
        </div>
    );
}

export default ReminderForm;