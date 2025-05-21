CREATE TABLE usage_history (
    id SERIAL PRIMARY KEY,
    medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    -- user_id INTEGER, -- Пока опустим для простоты, можно добавить позже
    quantity_taken INTEGER NOT NULL CHECK (quantity_taken > 0),
    unit VARCHAR(50) NOT NULL,
    usage_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Индекс для быстрого поиска по medicine_id
CREATE INDEX idx_usage_history_medicine_id ON usage_history(medicine_id);