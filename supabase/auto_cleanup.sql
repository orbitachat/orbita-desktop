-- ==============================================================================
-- ORBITA MESSENGER: AUTOMATIC DATABASE CLEANUP & ZERO-KNOWLEDGE RETENTION
-- ==============================================================================

-- 1. Очистка уже существующих завершенных и доставленных данных
DELETE FROM handshakes WHERE consumed = TRUE;
DELETE FROM messages WHERE delivered = TRUE;
DELETE FROM non_messages WHERE delivered = TRUE;

-- 2. ТРИГГЕРЫ МГНОВЕННОГО УДАЛЕНИЯ ПРИ СМЕНЕ СТАТУСА НА TRUE
-- Как только в базе статус меняется на true, PostgreSQL моментально удаляет строку

-- Рукопожатия (handshakes)
CREATE OR REPLACE FUNCTION trg_fn_delete_consumed_handshakes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.consumed = TRUE THEN
    DELETE FROM handshakes WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_delete_consumed_handshakes ON handshakes;
CREATE TRIGGER trg_auto_delete_consumed_handshakes
AFTER UPDATE OF consumed ON handshakes
FOR EACH ROW
WHEN (NEW.consumed = TRUE)
EXECUTE FUNCTION trg_fn_delete_consumed_handshakes();

-- Сообщения (messages)
CREATE OR REPLACE FUNCTION trg_fn_delete_delivered_messages()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.delivered = TRUE THEN
    DELETE FROM messages WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_delete_delivered_messages ON messages;
CREATE TRIGGER trg_auto_delete_delivered_messages
AFTER UPDATE OF delivered ON messages
FOR EACH ROW
WHEN (NEW.delivered = TRUE)
EXECUTE FUNCTION trg_fn_delete_delivered_messages();

-- Системные события (non_messages)
CREATE OR REPLACE FUNCTION trg_fn_delete_delivered_non_messages()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.delivered = TRUE THEN
    DELETE FROM non_messages WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_delete_delivered_non_messages ON non_messages;
CREATE TRIGGER trg_auto_delete_delivered_non_messages
AFTER UPDATE OF delivered ON non_messages
FOR EACH ROW
WHEN (NEW.delivered = TRUE)
EXECUTE FUNCTION trg_fn_delete_delivered_non_messages();

-- 3. ПЕРИОДИЧЕСКАЯ ОЧИСТКА ЗАВИСШИХ ЗАПИСЕЙ ЧЕРЕЗ PG_CRON (каждые 30 минут)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Удаление зависших рукопожатий старше 3 дней
SELECT cron.schedule(
  'orbita-cleanup-stale-handshakes',
  '*/30 * * * *',
  $$DELETE FROM handshakes WHERE consumed = TRUE OR created_at < NOW() - INTERVAL '3 days';$$
);

-- Удаление зависших сообщений старше 7 дней
SELECT cron.schedule(
  'orbita-cleanup-stale-messages',
  '*/30 * * * *',
  $$DELETE FROM messages WHERE delivered = TRUE OR created_at < NOW() - INTERVAL '7 days';$$
);

-- Удаление зависших системных событий старше 3 дней
SELECT cron.schedule(
  'orbita-cleanup-stale-non-messages',
  '*/30 * * * *',
  $$DELETE FROM non_messages WHERE delivered = TRUE OR created_at < NOW() - INTERVAL '3 days';$$
);
