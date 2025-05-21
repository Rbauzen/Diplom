// frontend/src/MedicineList.js
import React, { useState, useEffect, useMemo } from 'react';
import { fetchMedicines, deleteMedicine as apiDeleteMedicine } from './services/api';
import { useProtocol } from './contexts/ProtocolContext';
import { usePharmacy } from './contexts/PharmacyContext';
import './MedicineList.css';

const LOCAL_STORAGE_FILTER_KEY = 'medicineList_filters';
const LOCAL_STORAGE_SORT_KEY = 'medicineList_sort';
const EXPIRY_THRESHOLD_KEY_SETTINGS = 'settings_expiryThresholdDays';
const LOW_QUANTITY_THRESHOLD_KEY_SETTINGS = 'settings_lowQuantityDefaultThreshold';

function MedicineList({
    onAddMedicine,
    onEditMedicine,
    onDeleteMedicine,
    refreshKey,
    onUseMedicine,
    onShowHistory,
    onCreateReminder
}) {
    const [allMedicines, setAllMedicines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const { currentProtocol } = useProtocol();
    const { pharmacyId, isLoadingPharmacyId } = usePharmacy();

    const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem(`${LOCAL_STORAGE_FILTER_KEY}_searchTerm`) || '');
    const [sortConfig, setSortConfig] = useState(() => {
        const savedSortBy = localStorage.getItem(`${LOCAL_STORAGE_SORT_KEY}_sortBy`);
        const savedSortOrder = localStorage.getItem(`${LOCAL_STORAGE_SORT_KEY}_sortOrder`);
        return {
            key: savedSortBy || 'name',
            order: savedSortOrder || 'asc',
        };
    });

    useEffect(() => {
        if (isLoadingPharmacyId) {
            setLoading(true);
            setAllMedicines([]);
            return;
        }

        if (!pharmacyId) {
            setAllMedicines([]);
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);
        fetchMedicines(currentProtocol, pharmacyId)
            .then(data => {
                setAllMedicines(data || []);
            })
            .catch(err => {
                console.error("Ошибка при загрузке лекарств (MedicineList):", err);
                const errorMsg = err.response?.data?.error || err.message || 'Не удалось загрузить список лекарств.';
                setError(errorMsg);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [refreshKey, currentProtocol, pharmacyId, isLoadingPharmacyId]);

    useEffect(() => {
        localStorage.setItem(`${LOCAL_STORAGE_FILTER_KEY}_searchTerm`, searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        localStorage.setItem(`${LOCAL_STORAGE_SORT_KEY}_sortBy`, sortConfig.key);
        localStorage.setItem(`${LOCAL_STORAGE_SORT_KEY}_sortOrder`, sortConfig.order);
    }, [sortConfig]);

    const filteredAndSortedMedicines = useMemo(() => {
        let processedMedicines = [...allMedicines];

        if (searchTerm.trim()) {
            processedMedicines = processedMedicines.filter(med =>
                med.name && med.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
            );
        }

        processedMedicines.sort((a, b) => {
            let valA, valB;
            switch (sortConfig.key) {
                case 'name':
                    valA = a.name?.toLowerCase() || '';
                    valB = b.name?.toLowerCase() || '';
                    break;
                case 'expiry_date':
                    valA = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
                    valB = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
                    if (valA === 0 && valB !== 0) return sortConfig.order === 'asc' ? 1 : -1;
                    if (valB === 0 && valA !== 0) return sortConfig.order === 'asc' ? -1 : 1;
                    break;
                case 'quantity':
                    valA = (a.quantity !== null && a.quantity !== undefined) ? Number(a.quantity) : -Infinity;
                    valB = (b.quantity !== null && b.quantity !== undefined) ? Number(b.quantity) : -Infinity;
                    break;
                default: return 0;
            }
            if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
            return 0;
        });
        return processedMedicines;
    }, [allMedicines, searchTerm, sortConfig]);

    const handleSortChange = (e) => {
        const [key, order] = e.target.value.split('-');
        setSortConfig({ key, order });
    };

    const handleDelete = async (medId, medName) => {
        if (!pharmacyId) {
            setError("Невозможно удалить: ID аптечки не определен.");
            console.error("MedicineList handleDelete: pharmacyId is missing.");
            return;
        }
        if (window.confirm(`Вы уверены, что хотите удалить "${medName || 'это лекарство'}"?`)) {
            try {
                await apiDeleteMedicine(medId, currentProtocol, pharmacyId);
                onDeleteMedicine(); // Вызывает setRefreshKey в App.js
            } catch (err) {
                console.error("Ошибка при удалении лекарства (MedicineList):", err);
                setError(err.response?.data?.error || err.message || `Не удалось удалить лекарство "${medName}".`);
            }
        }
    };

    const getExpiryStatus = (expiryDateInput) => {
        const thresholdDays = parseInt(localStorage.getItem(EXPIRY_THRESHOLD_KEY_SETTINGS) || '14', 10);
        if (!expiryDateInput) return { text: 'N/A', className: 'expiry-unknown' };
        const expDate = new Date(expiryDateInput);
        if (isNaN(expDate.getTime())) return { text: 'Неверная дата', className: 'expiry-unknown' };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expDate.setHours(0, 0, 0, 0);

        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const formattedExpDate = expDate.toLocaleDateString();

        if (diffDays < 0) return { text: `Просрочено (${formattedExpDate})`, className: 'expired' };
        
        let criticalThreshold = 7;
        if (thresholdDays >= 30) criticalThreshold = 14;
        else if (thresholdDays >=14) criticalThreshold = Math.max(3, Math.floor(thresholdDays / 3));


        if (diffDays <= criticalThreshold) return { text: `Истекает скоро! (${formattedExpDate})`, className: 'expires-soon-critical' };
        if (diffDays <= thresholdDays) return { text: `Истекает (${formattedExpDate})`, className: 'expires-soon-warning' };
        return { text: formattedExpDate, className: 'expires-ok' };
    };

    const getQuantityStatus = (quantity, minThreshold) => {
        const defaultLowQuantityThreshold = parseInt(localStorage.getItem(LOW_QUANTITY_THRESHOLD_KEY_SETTINGS) || '5', 10);
        if (typeof quantity !== 'number' || isNaN(quantity)) {
            return { text: 'N/A', className: 'quantity-unknown' };
        }
        
        let className = 'quantity-ok';
        const effectiveThreshold = (minThreshold !== null && minThreshold !== undefined && !isNaN(Number(minThreshold))) 
                                  ? Number(minThreshold) 
                                  : defaultLowQuantityThreshold;

        if (quantity <= 0) {
            className = 'quantity-low';
        } else if (quantity <= effectiveThreshold) {
            className = 'quantity-low-warning';
        }
        return { text: `${quantity}`, className };
    };

    if (isLoadingPharmacyId) {
        return <p>Загрузка данных аптечки...</p>;
    }
    if (!pharmacyId) {
        return <p>Аптечка не выбрана. Пожалуйста, выберите или создайте аптечку в настройках.</p>;
    }
    if (loading) {
        return <p>Загрузка лекарств ({currentProtocol.toUpperCase()})...</p>;
    }
    if (error) {
        return <p style={{ color: 'red' }}>Ошибка загрузки списка лекарств: {error}</p>;
    }

    return (
        <div className="medicine-list-container">
            <div className="medicine-list-header">
                <h2>Моя Аптечка</h2>
                <button onClick={() => { setError(null); onAddMedicine(); }} className="add-medicine-btn">
                    + Добавить лекарство
                </button>
            </div>

            <div className="filters-and-sort-container">
                <input
                    type="text"
                    placeholder="Поиск по названию..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                />
                <div className="sort-options">
                    <label htmlFor="sort-select" className="sort-label">Сортировать:</label>
                    <select
                        id="sort-select"
                        value={`${sortConfig.key}-${sortConfig.order}`}
                        onChange={handleSortChange}
                        className="sort-select"
                    >
                        <option value="name-asc">Названию (А-Я)</option>
                        <option value="name-desc">Названию (Я-А)</option>
                        <option value="expiry_date-asc">Сроку (сначала старые)</option>
                        <option value="expiry_date-desc">Сроку (сначала новые)</option>
                        <option value="quantity-asc">Количеству (сначала мало)</option>
                        <option value="quantity-desc">Количеству (сначала много)</option>
                    </select>
                </div>
            </div>

            {filteredAndSortedMedicines.length === 0 ? (
                <p>{searchTerm.trim() ? 'По вашему запросу ничего не найдено.' : 'В вашей аптечке пока нет лекарств.'}</p>
            ) : (
                <div className="medicines-grid">
                    {filteredAndSortedMedicines.map(med => {
                        const expiry = getExpiryStatus(med.expiry_date);
                        const quantityInfo = getQuantityStatus(med.quantity, med.min_threshold);
                        
                        const expiryClassName = expiry.className || 'expiry-unknown';
                        const quantityClassName = quantityInfo.className || 'quantity-unknown';
                        const expiryText = expiry.text;
                        const quantityText = quantityInfo.text;

                        return (
                            <div key={med.id} className={`medicine-card ${expiryClassName} ${quantityClassName}`}>
                                <div className="card-header">
                                    <h3>{med.name || 'Без названия'}</h3>
                                    <div className="card-actions">
                                        <button onClick={() => onEditMedicine(med)} title="Редактировать" className="action-btn edit-btn">✏️</button>
                                        <button onClick={() => handleDelete(med.id, med.name || 'Без названия')} title="Удалить" className="action-btn delete-btn">🗑️</button>
                                    </div>
                                </div>
                                <div className="card-body">
                                    {med.image_url && (
                                        <div className="medicine-image-container">
                                            <img 
                                                src={med.image_url} 
                                                alt={`Изображение ${med.name || 'лекарства'}`} 
                                                className="medicine-image"
                                                onError={(e) => { e.target.style.display = 'none'; }} 
                                            />
                                        </div>
                                    )}
                                    <p><strong>Количество:</strong> <span className={`quantity-text ${quantityClassName}`}>{quantityText} {med.unit || ''}</span></p>
                                    <p><strong>Срок годности:</strong> <span className={`expiry-text ${expiryClassName}`}>{expiryText}</span></p>
                                    {med.dosage && <p><strong>Дозировка:</strong> {med.dosage}</p>}
                                    {med.instructions && <p><strong>Способ приёма:</strong> {med.instructions}</p>} 
                                    {med.frequency && <p><strong>Частота приёма:</strong> {med.frequency}</p>}
                                    {med.storage_location && <p><strong>Место хранения:</strong> {med.storage_location}</p>}
                                    {med.notes && <p><strong>Заметки:</strong> {med.notes}</p>}
                                </div>
                                <div className="card-footer">
                                    <button onClick={() => onUseMedicine(med)} className="use-medicine-btn" style={{marginRight: '5px'}}>Принять</button>
                                    <button onClick={() => onShowHistory(med)} className="history-btn" style={{marginRight: '5px'}}>История</button>
                                    <button onClick={() => onCreateReminder(med)} className="remind-btn">Напомнить</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default MedicineList;