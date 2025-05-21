// frontend/src/UsageHistory.js
import React, { useState, useEffect } from 'react';
import { fetchUsageHistory } from './services/api';
import { useProtocol } from './contexts/ProtocolContext';
import './UsageHistory.css';

function UsageHistory({ medicineId, medicineName, onClose, pharmacyId }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { currentProtocol } = useProtocol();

    useEffect(() => {
        if (!medicineId || !pharmacyId) {
            console.log("UsageHistory: medicineId или pharmacyId отсутствует, загрузка истории отложена.");
            setHistory([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        console.log(`UsageHistory: Запрос истории для medicine_id ${medicineId} с протоколом ${currentProtocol.toUpperCase()}`);
        fetchUsageHistory(medicineId, currentProtocol, pharmacyId)
            .then(data => {
                setHistory(data || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(`Ошибка при загрузке истории для medicine_id ${medicineId}:`, err);
                setError(err.response?.data?.error || err.message || 'Не удалось загрузить историю.');
                setLoading(false);
            });
    }, [medicineId, currentProtocol, pharmacyId]); // Перезагружаем, если изменился ID или протокол

    if (!medicineId) return null; // Если ID не передан, ничего не рендерим

    if (loading) return <p>Загрузка истории...</p>;
    if (!pharmacyId) return <p>ID аптечки не определен. Невозможно загрузить историю.</p>;
    if (error) return <p style={{ color: 'red' }}>Ошибка: {error}</p>;

    return (
        <div className="usage-history-container">
            <div className="usage-history-header">
                <h3>История использования: {medicineName || `ID ${medicineId}`}</h3>
                {onClose && <button onClick={onClose} className="close-btn">×</button>}
            </div>
            {history.length === 0 ? (
                <p>История использования для этого лекарства пуста.</p>
            ) : (
                <ul className="history-list">
                    {history.map(entry => (
                        <li key={entry.id} className="history-item">
                            <span className="history-timestamp">
                                {new Date(entry.usage_timestamp).toLocaleString()}
                            </span>
                            <span className="history-details">
                                Использовано: {entry.quantity_taken} {entry.unit}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default UsageHistory;