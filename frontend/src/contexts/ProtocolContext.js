// frontend/src/contexts/ProtocolContext.js
import React, { createContext, useState, useContext } from 'react';

export const PROTOCOL_JSON = 'json';
export const PROTOCOL_LWP = 'lwp';
export const PROTOCOL_MSGPACK = 'msgpack';

const ProtocolContext = createContext();

export const ProtocolProvider = ({ children }) => {
    const [currentProtocol, setCurrentProtocol] = useState(PROTOCOL_JSON); // По умолчанию JSON

    const toggleProtocol = () => {
        setCurrentProtocol(prev => prev === PROTOCOL_JSON ? PROTOCOL_LWP : PROTOCOL_JSON);
    };

    return (
        <ProtocolContext.Provider value={{ currentProtocol, toggleProtocol, setCurrentProtocol }}>
            {children}
        </ProtocolContext.Provider>
    );
};

export const useProtocol = () => useContext(ProtocolContext);