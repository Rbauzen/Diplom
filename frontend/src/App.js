// frontend/src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import MedicineList from './MedicineList';
import AddMedicineForm from './AddMedicineForm';
import UsageHistory from './UsageHistory';
import ReminderList from './ReminderList';
import ReminderForm from './ReminderForm';
import AppSettings from './AppSettings';
import FirstAidScreen from './FirstAidScreen';

import { useProtocol, PROTOCOL_JSON, PROTOCOL_LWP, PROTOCOL_MSGPACK } from './contexts/ProtocolContext';
import { usePharmacy } from './contexts/PharmacyContext';

import {
    fetchMedicines,
    consumeMedicine,
} from './services/api';

const LOCAL_STORAGE_PROTOCOL_KEY = 'digitalFirstAidKit_protocol';

function App() {
    const [view, setView] = useState('list');

    const [editingMedicine, setEditingMedicine] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const { currentProtocol, setCurrentProtocol } = useProtocol();
    const { pharmacyId, isLoadingPharmacyId, createNewPharmacy, joinPharmacy, clearPharmacyId } = usePharmacy();

    const [showUseModal, setShowUseModal] = useState(false);
    const [medicineToUse, setMedicineToUse] = useState(null);
    const [useQuantity, setUseQuantity] = useState(1);

    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [medicineForHistory, setMedicineForHistory] = useState(null);

    const [editingReminder, setEditingReminder] = useState(null);
    const [preselectedMedicineIdForReminder, setPreselectedMedicineIdForReminder] = useState(null);
    const [refreshRemindersKey, setRefreshRemindersKey] = useState(0);

    const [allMedicinesForSettings, setAllMedicinesForSettings] = useState([]);
    const [inputPharmacyId, setInputPharmacyId] = useState('');

    const pharmacyDependentKey = `${refreshKey}-${currentProtocol}-${pharmacyId || 'no-pharmacy'}`;
    const reminderPharmacyDependentKey = `${refreshRemindersKey}-${currentProtocol}-${pharmacyId || 'no-pharmacy'}`;

    // --- Логирование изменения view ---
    useEffect(() => {
    console.log(`App.js: View changed to: ${view}. Current editingMedicine:`, editingMedicine, "Current editingReminder:", editingReminder);
}, [view, editingMedicine, editingReminder]);
    // --- Конец логирования изменения view ---


    useEffect(() => {
        const savedProtocol = localStorage.getItem(LOCAL_STORAGE_PROTOCOL_KEY);
        if (savedProtocol && (savedProtocol === PROTOCOL_JSON || savedProtocol === PROTOCOL_LWP || savedProtocol === PROTOCOL_MSGPACK)) {
            if (savedProtocol !== currentProtocol) {
                setCurrentProtocol(savedProtocol);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        localStorage.setItem(LOCAL_STORAGE_PROTOCOL_KEY, currentProtocol);
        // console.log(`Протокол изменен на: ${currentProtocol} и сохранен.`); // Можно оставить, если нужно
    }, [currentProtocol]);

    useEffect(() => {
        if (view === 'settings' && pharmacyId && !isLoadingPharmacyId) {
            console.log(`App.js: Загрузка лекарств для настроек, pharmacyId: ${pharmacyId}`);
            fetchMedicines(currentProtocol, pharmacyId)
                .then(data => {
                    setAllMedicinesForSettings(data || []);
                })
                .catch(err => {
                    console.error("Ошибка загрузки лекарств для настроек:", err);
                    setAllMedicinesForSettings([]);
                });
        }
    }, [view, refreshKey, currentProtocol, pharmacyId, isLoadingPharmacyId]);

    
    const handleShowAddForm = () => { 
    console.log("App.js: handleShowAddForm called. Setting view to 'form'. Current editingMedicine:", null);
    setEditingMedicine(null); 
    setEditingReminder(null);
    setPreselectedMedicineIdForReminder(null);
    setView('form'); 
    };
    const handleShowEditForm = (medicine) => { 
        console.log("App.js: handleShowEditForm called. Setting view to 'form'. Editing medicine:", medicine);
        setEditingMedicine(medicine); 
        setEditingReminder(null);
        setPreselectedMedicineIdForReminder(null);
        setView('form'); 
    };
    const handleMedicineProcessed = () => { 
        console.log("App.js: handleMedicineProcessed called. Setting view to 'list'");
        setView('list'); 
        setEditingMedicine(null); 
        setRefreshKey(prevKey => prevKey + 1); 
    };
    const handleCancelForm = () => { 
        console.log("App.js: handleCancelForm called. Setting view to 'list'");
        setView('list'); 
        setEditingMedicine(null); 
    };
    const handleMedicineDeleted = () => {
        console.log("App.js: handleMedicineDeleted called.");
        setRefreshKey(prevKey => prevKey + 1); 
        if (view === 'form') { setView('list'); setEditingMedicine(null); }
    };
    const handleOpenUseModal = (medicine) => { 
        setMedicineToUse(medicine); 
        setUseQuantity(1); 
        setShowUseModal(true); 
    };
    const handleCloseUseModal = () => { 
        setShowUseModal(false); 
        setMedicineToUse(null); 
    };
    const handleConfirmUseMedicine = async () => {
        if (!pharmacyId) {
            alert("Аптечка не выбрана. Пожалуйста, создайте новую или присоединитесь к существующей.");
            return;
        }
        if (!medicineToUse || !useQuantity || useQuantity <= 0 || useQuantity > medicineToUse.quantity) {
            alert("Пожалуйста, введите корректное количество.");
            return;
        }
        try {
            const usageData = { 
                pharmacy_id: pharmacyId, // <<--- ДОБАВЛЯЕМ pharmacy_id В ТЕЛО ЗАПРОСА
                quantity_to_use: useQuantity, 
                unit_of_use: medicineToUse.unit 
            };
            console.log('[FRONTEND] handleConfirmUseMedicine - Sending usageData:', usageData, 'for medicine ID:', medicineToUse.id, 'with protocol:', currentProtocol);
            // consumeMedicine ожидает (id, usageData, protocol) - pharmacy_id уже внутри usageData
            await consumeMedicine(medicineToUse.id, usageData, currentProtocol, pharmacyId); 
            setRefreshKey(prevKey => prevKey + 1);
            handleCloseUseModal();
            alert(`Лекарство "${medicineToUse.name}" успешно использовано.`);
        } catch (error) {
            console.error("Ошибка при использовании лекарства:", error);
            alert(error.response?.data?.error || "Не удалось использовать лекарство.");
        }
    };
    const handleOpenHistoryModal = (medicine) => { 
        setMedicineForHistory(medicine); 
        setShowHistoryModal(true); 
    };
    const handleCloseHistoryModal = () => { 
        setShowHistoryModal(false); 
        setMedicineForHistory(null); 
    };

    const handleShowReminderList = () => {
        console.log("App.js: handleShowReminderList called. Setting view to 'reminders'");
        setView('reminders');
        setEditingMedicine(null);
        setEditingReminder(null);
        setPreselectedMedicineIdForReminder(null);
    };
    const handleShowAddReminderForm = (medicineId = null) => {
        console.log("App.js: handleShowAddReminderForm called. Setting view to 'reminderForm', medicineId:", medicineId, "Current editingMedicine:", null);
        setEditingMedicine(null); 
        setEditingReminder(null);
        setPreselectedMedicineIdForReminder(medicineId);
        setView('reminderForm');
    };
    const handleShowEditReminderForm = (reminder) => {
        console.log("App.js: handleShowEditReminderForm called. Setting view to 'reminderForm'. Editing reminder:", reminder, "Current editingMedicine:", null);
        setEditingMedicine(null); 
        setEditingReminder(reminder);
        setPreselectedMedicineIdForReminder(null);
        setView('reminderForm');
    };
    const handleReminderProcessed = () => {
        console.log("App.js: handleReminderProcessed called. Setting view to 'reminders'");
        setView('reminders');
        setEditingReminder(null);
        setPreselectedMedicineIdForReminder(null);
        setRefreshRemindersKey(prevKey => prevKey + 1);
    };
    const handleCancelReminderForm = () => {
        console.log("App.js: handleCancelReminderForm called. Setting view to 'reminders'");
        setView('reminders'); 
        setEditingReminder(null);
        setPreselectedMedicineIdForReminder(null);
    };
    const handleCreateReminderForMedicine = (medicine) => {
        console.log("App.js: handleCreateReminderForMedicine called for medicine ID:", medicine.id);
        handleShowAddReminderForm(medicine.id);
    };
    const handleShowSettings = () => {
        console.log("App.js: handleShowSettings called. Setting view to 'settings'");
        setView('settings');
        setEditingMedicine(null);
        setEditingReminder(null);
        setPreselectedMedicineIdForReminder(null);
    };
    const handleShowFirstAid = () => {
        console.log("App.js: handleShowFirstAid called. Setting view to 'firstAid'");
        setView('firstAid');
        setEditingMedicine(null);
        setEditingReminder(null);
        setPreselectedMedicineIdForReminder(null);
    };

    // --- Рендеринг в зависимости от состояния pharmacyId ---
    if (isLoadingPharmacyId) {
        return (
            <div className="App">
                <header className="App-header"><h1>Цифровая Аптечка</h1></header>
                <main><p style={{textAlign: 'center', marginTop: '50px'}}>Загрузка данных аптечки...</p></main>
            </div>
        );
    }

    if (!pharmacyId) {
        return (
            <div className="App">
                <header className="App-header"><h1>Цифровая Аптечка</h1></header>
                <main style={{ textAlign: 'center', paddingTop: '30px', paddingBottom: '30px' }}>
                    <h2>Добро пожаловать!</h2>
                    <p>Для начала работы создайте новую аптечку или присоединитесь к существующей по ID.</p>
                    <div style={{ margin: '30px 0' }}>
                        <button onClick={createNewPharmacy} style={{ padding: '10px 20px', fontSize: '1.1em' }}>
                            Создать новую аптечку
                        </button>
                    </div>
                    <div className="join-pharmacy-section">
                        <h3>Присоединиться к аптечке:</h3>
                        <input
                            type="text"
                            placeholder="Введите ID аптечки"
                            value={inputPharmacyId}
                            onChange={(e) => setInputPharmacyId(e.target.value)}
                            style={{ marginRight: '10px', padding: '10px', width: '280px', maxWidth: 'calc(100% - 120px)' }}
                        />
                        <button onClick={() => joinPharmacy(inputPharmacyId)} style={{ padding: '10px 15px' }}>
                            Присоединиться
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    // Если pharmacyId есть, рендерим основной интерфейс приложения
    return (
        <div className="App">
            <header className="App-header">
                <h1>Цифровая Аптечка</h1>
                <div className="app-controls">
                    <div className="navigation-buttons">
                        <button
                            onClick={() => { 
                                console.log("App.js: Клик на 'Аптечка'. Setting view to 'list'");
                                setView('list'); 
                                setEditingMedicine(null); 
                                setEditingReminder(null); 
                                setPreselectedMedicineIdForReminder(null); 
                            }}
                            disabled={view === 'list' || view === 'form'}
                        >
                            Аптечка
                        </button>
                        <button
                            onClick={handleShowReminderList}
                            disabled={view === 'reminders' || view === 'reminderForm'}
                        >
                            Напоминания
                        </button>
                        <button
                            onClick={handleShowSettings}
                            disabled={view === 'settings'}
                        >
                            Настройки
                        </button>
                        <button
                            onClick={handleShowFirstAid}
                            disabled={view === 'firstAid'}
                        >
                            Первая Помощь
                        </button>
                    </div>
                    <div className="protocol-switcher">
                        <label htmlFor="protocolSelect">Протокол: </label>
                        <select
                            id="protocolSelect"
                            value={currentProtocol}
                            onChange={(e) => setCurrentProtocol(e.target.value)}
                        >
                            <option value={PROTOCOL_JSON}>JSON</option>
                            <option value={PROTOCOL_LWP}>LWPv1</option>
                            <option value={PROTOCOL_MSGPACK}>MessagePack</option>
                        </select>
                    </div>
                </div>
            </header>
            <main>
                {view === 'list' && (
                    <MedicineList
                        key={pharmacyDependentKey}
                        // pharmacyId пропс убран, т.к. MedicineList теперь использует usePharmacy()
                        onAddMedicine={handleShowAddForm}
                        onEditMedicine={handleShowEditForm}
                        onDeleteMedicine={handleMedicineDeleted} // Этот обработчик в App.js просто обновляет refreshKey
                        onUseMedicine={handleOpenUseModal}
                        onShowHistory={handleOpenHistoryModal}
                        onCreateReminder={handleCreateReminderForMedicine}
                    />
                )}
                {view === 'form' && (
                    <AddMedicineForm
                        key={(editingMedicine ? `med-${editingMedicine.id}` : 'newMed') + currentProtocol + (pharmacyId || 'no-id')}
                        pharmacyId={pharmacyId}
                        onMedicineAddedOrUpdated={handleMedicineProcessed}
                        onCancel={handleCancelForm}
                        editingMedicine={editingMedicine}
                    />
                )}
                {view === 'reminders' && (
                    <ReminderList
                        key={reminderPharmacyDependentKey}
                        onAddReminder={() => handleShowAddReminderForm()}
                        onEditReminder={handleShowEditReminderForm}
                        refreshKey={refreshRemindersKey}
                    />
                )}
                {view === 'reminderForm' && (
                    <ReminderForm
                        key={(editingReminder ? `rem-${editingReminder.id}` : 'newReminder') + (preselectedMedicineIdForReminder || 'no-preselect') + currentProtocol + (pharmacyId || 'no-id')}
                        pharmacyId={pharmacyId}
                        onReminderProcessed={handleReminderProcessed}
                        onCancel={handleCancelReminderForm}
                        editingReminder={editingReminder}
                        preselectedMedicineId={preselectedMedicineIdForReminder}
                    />
                )}
                {view === 'settings' && (
                    <AppSettings 
                        allMedicines={allMedicinesForSettings} 
                        pharmacyId={pharmacyId}
                        clearPharmacyId={clearPharmacyId}
                    />
                )}
                {view === 'firstAid' && (
                    <FirstAidScreen />
                )}
            </main>

            {/* Модальное окно для списания лекарства */}
            {showUseModal && medicineToUse && (
                <div className="modal-overlay" onClick={handleCloseUseModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Использовать "{medicineToUse.name}"</h3>
                        <p>В наличии: {medicineToUse.quantity} {medicineToUse.unit}</p>
                        <div>
                            <label htmlFor="useQuantity">Списать количество:</label>
                            <input
                                type="number"
                                id="useQuantity"
                                value={useQuantity}
                                onChange={(e) => setUseQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                min="1"
                                max={medicineToUse.quantity}
                            />
                            <span> {medicineToUse.unit}</span>
                        </div>
                        <div className="modal-actions">
                            <button onClick={handleConfirmUseMedicine} disabled={!useQuantity || useQuantity <= 0 || useQuantity > medicineToUse.quantity}>Подтвердить</button>
                            <button onClick={handleCloseUseModal} className="cancel-btn">Отмена</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Модальное окно для истории использования */}
            {showHistoryModal && medicineForHistory && pharmacyId && (
                <div className="modal-overlay" onClick={handleCloseHistoryModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <UsageHistory
                            medicineId={medicineForHistory.id}
                            pharmacyId={pharmacyId}
                            medicineName={medicineForHistory.name}
                            onClose={handleCloseHistoryModal}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;