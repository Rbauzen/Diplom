CREATE TABLE reminders (
    id SERIAL PRIMARY KEY,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    reminder_time TIME WITHOUT TIME ZONE NOT NULL,
    days_of_week VARCHAR(20), -- e.g., "1,2,3,4,5" for Mon-Fri, or NULL for daily if start_date is set
    start_date DATE NOT NULL,
    end_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    -- last_shown_at TIMESTAMP WITH TIME ZONE, -- Пока опустим для простоты
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индекс для быстрого поиска по medicine_id
CREATE INDEX idx_reminders_medicine_id ON reminders(medicine_id);

-- Триггер для обновления updated_at (если у тебя еще нет универсальной функции, создай ее)
-- Если функция trigger_set_timestamp уже есть от таблицы medicines, можно использовать ее же.
-- CREATE OR REPLACE FUNCTION trigger_set_timestamp() ... (если еще не создана)

CREATE TRIGGER set_timestamp_reminders
BEFORE UPDATE ON reminders
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();