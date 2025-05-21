// frontend/src/contexts/PharmacyContext.js
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const LOCAL_STORAGE_PHARMACY_KEY = 'digitalFirstAidKit_pharmacyId';
const PharmacyContext = createContext(undefined);

export const PharmacyProvider = ({ children }) => {
    const [pharmacyId, setPharmacyId] = useState(null);
    const [isLoadingPharmacyId, setIsLoadingPharmacyId] = useState(true);

    useEffect(() => {
        console.log("PharmacyProvider: Checking localStorage for pharmacyId...");
        const storedId = localStorage.getItem(LOCAL_STORAGE_PHARMACY_KEY);
        if (storedId) {
            console.log("PharmacyProvider: Found stored pharmacyId:", storedId);
            setPharmacyId(storedId);
        } else {
            console.log("PharmacyProvider: No pharmacyId found in localStorage.");
        }
        setIsLoadingPharmacyId(false);
    }, []);

    const _updatePharmacyIdAndReload = (newId) => {
        if (newId) {
            localStorage.setItem(LOCAL_STORAGE_PHARMACY_KEY, newId);
            setPharmacyId(newId);
        } else {
            localStorage.removeItem(LOCAL_STORAGE_PHARMACY_KEY);
            setPharmacyId(null);
        }
    };

    const createNewPharmacy = useCallback(() => {
        const newId = uuidv4();
        console.log("PharmacyProvider: Creating new pharmacyId:", newId);
        _updatePharmacyIdAndReload(newId);
        return newId;
    }, []);

    const joinPharmacy = useCallback((idToJoin) => {
        if (idToJoin && typeof idToJoin === 'string' && idToJoin.trim() !== '') {
            const trimmedId = idToJoin.trim();
            console.log("PharmacyProvider: Joining pharmacy with id:", trimmedId);
            _updatePharmacyIdAndReload(trimmedId);
        } else {
            alert("Неверный ID аптечки для присоединения.");
            console.error("PharmacyProvider: Attempted to join with invalid ID:", idToJoin);
        }
    }, []);

    const clearPharmacyId = useCallback(() => {
        console.log("PharmacyProvider: Clearing pharmacyId (logging out).");
        _updatePharmacyIdAndReload(null);
    }, []);

    return (
        <PharmacyContext.Provider value={{ pharmacyId, isLoadingPharmacyId, createNewPharmacy, joinPharmacy, clearPharmacyId }}>
            {children}
        </PharmacyContext.Provider>
    );
};

export const usePharmacy = () => {
    const context = useContext(PharmacyContext);
    if (context === undefined) {
        throw new Error('usePharmacy must be used within a PharmacyProvider');
    }
    return context;
};