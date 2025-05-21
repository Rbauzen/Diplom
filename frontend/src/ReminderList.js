// frontend/src/ReminderList.js
import React, { useState, useEffect } from 'react';
import { fetchReminders, deleteReminder as apiDeleteReminder, fetchMedicines } from './services/api';
import { useProtocol } from './contexts/ProtocolContext';
import { usePharmacy } from './contexts/PharmacyContext';
import './ReminderList.css';

function ReminderList({
    onAddReminder,
    onEditReminder,
    medicineIdFilter = null, 
    refreshKey 
}) {
    const [reminders, setReminders] = useState([]);
    const [medicinesMap, setMedicinesMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const { currentProtocol } = useProtocol();
    const { pharmacyId, isLoadingPharmacyId } = usePharmacy();

    // Загрузка названий лекарств для отображения в списке напоминаний
    useEffect(() => {
        if (isLoadingPharmacyId || !pharmacyId) {
            return;
        }

        fetchMedicines(currentProtocol, pharmacyId)
            .then(data => {
                const medsMap = (data || []).reduce((acc, med) => {
                    acc[med.id] = med.name;
                    return acc;
                }, {});
                setMedicinesMap(medsMap);
            })
            .catch(err => {
                console.error("ReminderList: Ошибка загрузки названий лекарств:", err.message);
            });
    }, [currentProtocol, pharmacyId, isLoadingPharmacyId]);

    // Загрузка самих напоминаний
    useEffect(() => {
        if (isLoadingPharmacyId) {
            setLoading(true);
            setReminders([]); // Очищаем предыдущие данные
            return;
        }

        if (!pharmacyId) {
            setReminders([]);
            setLoading(false);
            setError(null); // Сбрасываем ошибку, если была
            return;
        }

        setLoading(true);
        setError(null);
        
        fetchReminders(currentProtocol, pharmacyId, medicineIdFilter)
            .then(data => {
                setReminders(data || []);
            })
            .catch(err => {
                console.error("ReminderList: Ошибка при загрузке напоминаний:", err.message);
                const errorMsg = err.response?.data?.error || err.message || 'Не удалось загрузить список напоминаний.';
                setError(errorMsg);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [refreshKey, currentProtocol, pharmacyId, medicineIdFilter, isLoadingPharmacyId]);

    const handleDelete = async (reminderId) => {
        if (!pharmacyId) {
            setError("Невозможно удалить: ID аптечки не определен.");
            console.error("ReminderList handleDelete: pharmacyId is missing.");
            return;
        }
        if (window.confirm(`Вы уверены, что хотите удалить это напоминание?`)) {
            try {
                await apiDeleteReminder(reminderId, currentProtocol, pharmacyId);
                setReminders(prevReminders => prevReminders.filter(r => r.id !== reminderId));
            } catch (err) {
                console.error("ReminderList: Ошибка при удалении напоминания:", err.message);
                setError(err.response?.data?.error || err.message || 'Не удалось удалить напоминание.');
            }
        }
    };

    const formatDaysOfWeek = (daysString) => {
        if (!daysString || daysString.trim() === '') return 'Ежедневно (если активно)';
        const dayMap = { '1': 'Пн', '2': 'Вт', '3': 'Ср', '4': 'Чт', '5': 'Пт', '6': 'Сб', '7': 'Вс' };
        const days = daysString.split(',').map(d => dayMap[d.trim()] || d.trim()).filter(Boolean); // Убираем пустые после trim, если были пробелы
        return days.length > 0 ? days.join(', ') : 'Ежедневно (если активно)';
    };

    if (isLoadingPharmacyId) {
        return <p>Загрузка информации об аптечке...</p>;
    }
    if (!pharmacyId) {
        return <p>Аптечка не выбрана. Перейдите в настройки, чтобы создать или выбрать аптечку.</p>;
    }
    if (loading) {
        return <p>Загрузка напоминаний ({currentProtocol.toUpperCase()})...</p>;
    }
    if (error) {
        return <p style={{ color: 'red' }}>Ошибка загрузки напоминаний: {error}</p>;
    }

    return (
        <div className="reminder-list-container">
            <div className="reminder-list-header">
                <h2>{medicineIdFilter ? `Напоминания для "${medicinesMap[medicineIdFilter] || `лекарства ID ${medicineIdFilter}`}"` : "Все напоминания"}</h2>
                {onAddReminder && !medicineIdFilter && (
                     <button onClick={onAddReminder} className="add-reminder-btn">
                        + Новое напоминание
                    </button>
                )}
            </div>

            {reminders.length === 0 ? (
                <p>{medicineIdFilter ? 'Для этого лекарства нет активных напоминаний.' : 'Нет созданных напоминаний.'}</p>
            ) : (
                <ul className="reminders">
                    {reminders.map(reminder => (
                        <li key={reminder.id} className={`reminder-item ${!reminder.is_active ? 'inactive' : ''}`}>
                            <div className="reminder-info">
                                <span className="reminder-medicine">
                                    <strong>{medicinesMap[reminder.medicine_id] || `Лекарство ID: ${reminder.medicine_id}`}</strong>
                                </span>
                                <span className="reminder-time">
                                    Время: {reminder.reminder_time ? reminder.reminder_time.substring(0,5) : 'N/A'}
                                </span>
                                <span className="reminder-days">
                                    Дни: {formatDaysOfWeek(reminder.days_of_week)}
                                </span>
                                <span className="reminder-dates">
                                    C {reminder.start_date ? new Date(reminder.start_date).toLocaleDateString() : 'N/A'}
                                    {reminder.end_date ? ` по ${new Date(reminder.end_date).toLocaleDateString()}` : ''}
                                </span>
                                {reminder.notes && <span className="reminder-notes">Заметка: <em>{reminder.notes}</em></span>}
                                {!reminder.is_active && <span className="reminder-status-inactive">(Неактивно)</span>}
                            </div>
                            <div className="reminder-actions">
                                <button onClick={() => onEditReminder(reminder)} title="Редактировать" className="action-btn edit-btn">✏️</button>
                                <button onClick={() => handleDelete(reminder.id)} title="Удалить" className="action-btn delete-btn">🗑️</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default ReminderList;