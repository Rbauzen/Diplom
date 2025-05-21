// frontend/src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ProtocolProvider } from './contexts/ProtocolContext'; // <<--- Импорт
import { PharmacyProvider } from './contexts/PharmacyContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ProtocolProvider>
      <PharmacyProvider> {/* <<--- Оборачиваем App */}
        <App />
      </PharmacyProvider>
    </ProtocolProvider>
  </React.StrictMode>
);