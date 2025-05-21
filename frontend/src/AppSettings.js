// frontend/src/AppSettings.js
import React, { useState, useEffect } from 'react';
import { usePharmacy } from './contexts/PharmacyContext';
import './AppSettings.css';

const EXPIRY_THRESHOLD_KEY = 'settings_expiryThresholdDays';
const LOW_QUANTITY_THRESHOLD_KEY = 'settings_lowQuantityDefaultThreshold';

function AppSettings({ allMedicines }) {
    const { pharmacyId, createNewPharmacy, joinPharmacy, clearPharmacyId } = usePharmacy();
    const [inputPharmacyIdToJoin, setInputPharmacyIdToJoin] = useState('');

    const [expiryThresholdDays, setExpiryThresholdDays] = useState(() => {
        return parseInt(localStorage.getItem(EXPIRY_THRESHOLD_KEY) || '14', 10);
    });
    const [lowQuantityDefaultThreshold, setLowQuantityDefaultThreshold] = useState(() => {
        return parseInt(localStorage.getItem(LOW_QUANTITY_THRESHOLD_KEY) || '5', 10);
    });

    const [expiringSoon, setExpiringSoon] = useState([]);
    const [lowStock, setLowStock] = useState([]);

    useEffect(() => {
        localStorage.setItem(EXPIRY_THRESHOLD_KEY, expiryThresholdDays.toString());
    }, [expiryThresholdDays]);

    useEffect(() => {
        localStorage.setItem(LOW_QUANTITY_THRESHOLD_KEY, lowQuantityDefaultThreshold.toString());
    }, [lowQuantityDefaultThreshold]);

    useEffect(() => {
            if (!allMedicines || allMedicines.length === 0) {
                setExpiringSoon([]);
                setLowStock([]);
                return;
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const expiring = allMedicines.filter(med => {
                if (!med.expiry_date) return false;
                const expDate = new Date(med.expiry_date);
                expDate.setHours(0,0,0,0);
                const diffTime = expDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays >= 0 && diffDays <= expiryThresholdDays;
            });
            const low = allMedicines.filter(med => {
                const threshold = med.min_threshold !== null && med.min_threshold !== undefined 
                                  ? med.min_threshold 
                                  : lowQuantityDefaultThreshold;
                return med.quantity <= threshold;
            });
            setExpiringSoon(expiring.sort((a,b) => new Date(a.expiry_date) - new Date(b.expiry_date)));
            setLowStock(low.sort((a,b) => a.quantity - b.quantity));
    }, [allMedicines, expiryThresholdDays, lowQuantityDefaultThreshold]);

    const handleCopyToClipboard = () => {
        if (pharmacyId) {
            navigator.clipboard.writeText(pharmacyId)
                .then(() => alert('ID Аптечки скопирован в буфер обмена!'))
                .catch(err => console.error('Ошибка копирования ID: ', err));
        }
    };

    const handleJoin = () => {
        if (inputPharmacyIdToJoin.trim()) {
            joinPharmacy(inputPharmacyIdToJoin.trim());
            setInputPharmacyIdToJoin('');
        } else {
            alert("Пожалуйста, введите ID аптечки для присоединения.");
        }
    };
    
    const handleCreateNew = () => {
        if (window.confirm("Создать новую аптечку? Текущий ID будет заменен, и вам нужно будет заново добавить лекарства (если вы не сохранили текущий ID).")) {
            createNewPharmacy();
        }
    };

    const handleClearCurrentPharmacy = () => {
        if (window.confirm("Вы уверены, что хотите отсоединиться от текущей аптечки? Данные останутся на сервере, но вы потеряете к ним доступ, если не сохранили ID.")) {
            clearPharmacyId();
        }
    }

    return (
        <div className="app-settings-container">
            <h2>Настройки и Управление Аптечкой</h2>

            <div className="settings-section pharmacy-management">
                <h3>Управление Аптечкой</h3>
                {pharmacyId ? (
                    <>
                        <p><strong>Текущий ID вашей аптечки:</strong></p>
                        <div className="pharmacy-id-display">
                            <code>{pharmacyId}</code>
                            <button onClick={handleCopyToClipboard} title="Копировать ID">📋</button>
                        </div>
                        <p className="small-text">Передайте этот ID другому человеку (или используйте на другом устройстве) для совместного доступа.</p>
                        <button onClick={handleClearCurrentPharmacy} className="danger-btn" style={{marginTop: '10px', marginRight: '10px'}}>
                            Отсоединиться от этой аптечки
                        </button>
                    </>
                ) : (
                    <p>Аптечка не выбрана. Создайте новую или присоединитесь к существующей на главном экране.</p>
                )}
                 <button onClick={handleCreateNew} style={{marginTop: '10px'}}>
                    Создать совершенно новую аптечку
                </button>

                <h4>Присоединиться к другой аптечке:</h4>
                <div className="join-input-group">
                    <input
                        type="text"
                        placeholder="Введите ID другой аптечки"
                        value={inputPharmacyIdToJoin}
                        onChange={(e) => setInputPharmacyIdToJoin(e.target.value)}
                    />
                    <button onClick={handleJoin}>Присоединиться</button>
                </div>
            </div>


            <div className="settings-section">
                <h3>Пороги уведомлений</h3>
                 <div className="setting-item">
                    <label htmlFor="expiryThreshold">Предупреждать о сроке годности за (дней):</label>
                    <select id="expiryThreshold" value={expiryThresholdDays} onChange={(e) => setExpiryThresholdDays(parseInt(e.target.value, 10))}>
                        <option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option><option value="60">60 дней</option>
                    </select>
                </div>
                <div className="setting-item">
                    <label htmlFor="lowQuantityThreshold">Мин. порог по умолчанию (если не задан):</label>
                    <input type="number" id="lowQuantityThreshold" value={lowQuantityDefaultThreshold} onChange={(e) => setLowQuantityDefaultThreshold(parseInt(e.target.value, 10) || 0)} min="0"/>
                </div>
            </div>

            <div className="notifications-section settings-section">
                <h3>Уведомления</h3>
                <h4>Истекает срок годности (ближайшие {expiryThresholdDays} дней):</h4>
                {expiringSoon.length > 0 ? ( <ul> {expiringSoon.map(med => (<li key={`exp-${med.id}`}>{med.name} - истекает {new Date(med.expiry_date).toLocaleDateString()}</li>))} </ul>) : (<p>Нет лекарств с истекающим сроком годности.</p>)}
                <h4>Заканчиваются (равно или меньше порога):</h4>
                {lowStock.length > 0 ? (<ul> {lowStock.map(med => (<li key={`low-${med.id}`}>{med.name} - осталось {med.quantity} {med.unit} (порог: {med.min_threshold !== null ? med.min_threshold : lowQuantityDefaultThreshold})</li>))} </ul>) : (<p>Нет лекарств с низким остатком.</p>)}
            </div>

            <div className="about-section settings-section">
                 <h3>О приложении</h3>
                 <p>Цифровая Аптечка v1.0.0</p>
                 <p>Разработано в рамках дипломного проекта.</p>
            </div>
        </div>
    );
}

export default AppSettings;