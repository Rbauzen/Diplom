ALTER TABLE medicines
ADD COLUMN pharmacy_id VARCHAR(36); -- Или UUID

-- Обновляем существующие записи (если есть), присваивая им какой-то дефолтный ID
-- ВАЖНО: Этот шаг нужен, если у тебя уже есть данные. 
-- Если база пустая, этот UPDATE не нужен, а pharmacy_id можно сразу сделать NOT NULL.
-- Если делаешь NOT NULL сразу, то при добавлении колонки нужно указать DEFAULT значение, 
-- или сначала добавить колонку (NULLABLE), обновить, потом сделать NOT NULL.
-- Пример с дефолтным ID для существующих (замени 'default-pharmacy-id' на реальный UUID):
UPDATE medicines SET pharmacy_id = 'default-pharmacy-id' WHERE pharmacy_id IS NULL; 

-- Затем делаем поле NOT NULL
ALTER TABLE medicines
ALTER COLUMN pharmacy_id SET NOT NULL;

-- Добавляем индекс
CREATE INDEX idx_medicines_pharmacy_id ON medicines(pharmacy_id);

-- Аналогичные ALTER TABLE и CREATE INDEX для таблиц usage_history и reminders
-- Для usage_history:
ALTER TABLE usage_history
ADD COLUMN pharmacy_id VARCHAR(36);
UPDATE usage_history SET pharmacy_id = 'default-pharmacy-id' WHERE pharmacy_id IS NULL; -- Если есть данные
ALTER TABLE usage_history
ALTER COLUMN pharmacy_id SET NOT NULL;
CREATE INDEX idx_usage_history_pharmacy_id ON usage_history(pharmacy_id);

-- Для reminders:
ALTER TABLE reminders
ADD COLUMN pharmacy_id VARCHAR(36);
UPDATE reminders SET pharmacy_id = 'default-pharmacy-id' WHERE pharmacy_id IS NULL; -- Если есть данные
ALTER TABLE reminders
ALTER COLUMN pharmacy_id SET NOT NULL;
CREATE INDEX idx_reminders_pharmacy_id ON reminders(pharmacy_id);