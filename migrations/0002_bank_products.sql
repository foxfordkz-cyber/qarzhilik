-- Банк өнімдерінің автоматты түрде жаңартылатын кэші (күнделікті cron)

CREATE TABLE IF NOT EXISTS bank_products (
  bank_id    TEXT PRIMARY KEY,
  deposits   TEXT NOT NULL,   -- JSON array
  loans      TEXT NOT NULL,   -- JSON array
  updated_at TEXT NOT NULL    -- ISO 8601 (UTC)
);

-- Соңғы жүгірулердің нәтижесі (диагностика үшін; әр банк бойынша соңғысы сақталады)
CREATE TABLE IF NOT EXISTS fetch_log (
  bank_id TEXT PRIMARY KEY,
  ok      INTEGER NOT NULL,
  message TEXT,
  at      TEXT NOT NULL
);
