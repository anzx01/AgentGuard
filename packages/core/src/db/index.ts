import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || './data/agentguard.db'
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
  }
  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL UNIQUE,
      description         TEXT,
      status              TEXT NOT NULL DEFAULT 'active'
                          CHECK(status IN ('active','paused','blocked')),
      rule_set_id         TEXT,
      upstream_api_key    TEXT,
      created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at          DATETIME NOT NULL DEFAULT (datetime('now')),
      last_seen_at        DATETIME
    );

    CREATE TABLE IF NOT EXISTS agent_tokens (
      id            TEXT PRIMARY KEY,
      agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL UNIQUE,
      token_prefix  TEXT NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
      last_used_at  DATETIME,
      expires_at    DATETIME
    );

    CREATE TABLE IF NOT EXISTS rule_sets (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      is_default    INTEGER NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rules (
      id            TEXT PRIMARY KEY,
      rule_set_id   TEXT NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL,
      is_enabled    INTEGER NOT NULL DEFAULT 1,
      action        TEXT NOT NULL DEFAULT 'block'
                    CHECK(action IN ('block','alert','alert_and_block')),
      priority      INTEGER NOT NULL DEFAULT 100,
      params        TEXT NOT NULL DEFAULT '{}',
      created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
      timestamp       DATETIME NOT NULL DEFAULT (datetime('now')),
      method          TEXT NOT NULL,
      target_url      TEXT NOT NULL,
      target_service  TEXT,
      request_headers TEXT,
      request_size    INTEGER,
      decision        TEXT NOT NULL CHECK(decision IN ('allow','block','error')),
      blocked_rule_id TEXT,
      block_reason    TEXT,
      response_status INTEGER,
      response_size   INTEGER,
      latency_ms      REAL,
      proxy_latency_ms REAL,
      estimated_cost  REAL DEFAULT 0,
      actual_cost     REAL,
      ip_address      TEXT,
      is_streaming    INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_transactions_decision ON transactions(decision);

    CREATE TABLE IF NOT EXISTS budget_snapshots (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
      snapshot_hour   DATETIME NOT NULL,
      total_calls     INTEGER NOT NULL DEFAULT 0,
      allowed_calls   INTEGER NOT NULL DEFAULT 0,
      blocked_calls   INTEGER NOT NULL DEFAULT 0,
      total_cost      REAL NOT NULL DEFAULT 0,
      UNIQUE(agent_id, snapshot_hour)
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
      transaction_id  TEXT REFERENCES transactions(id) ON DELETE SET NULL,
      severity        TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
      type            TEXT NOT NULL,
      title           TEXT NOT NULL,
      message         TEXT NOT NULL,
      details         TEXT,
      status          TEXT NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','acknowledged','resolved','ignored')),
      acknowledged_at DATETIME,
      ack_note        TEXT,
      created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_alert_events_status ON alert_events(status);
    CREATE INDEX IF NOT EXISTS idx_alert_events_created_at ON alert_events(created_at);

    CREATE TABLE IF NOT EXISTS alert_channels (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL CHECK(type IN ('local_notification','email','webhook')),
      is_enabled      INTEGER NOT NULL DEFAULT 1,
      config          TEXT NOT NULL DEFAULT '{}',
      min_severity    TEXT NOT NULL DEFAULT 'high',
      alert_types     TEXT NOT NULL DEFAULT '[]',
      created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config_change_logs (
      id              TEXT PRIMARY KEY,
      operator        TEXT NOT NULL DEFAULT 'admin',
      action          TEXT NOT NULL,
      resource_type   TEXT NOT NULL,
      resource_id     TEXT,
      before_value    TEXT,
      after_value     TEXT,
      ip_address      TEXT,
      checksum        TEXT NOT NULL,
      created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_events (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL,
      severity        TEXT NOT NULL DEFAULT 'info',
      message         TEXT NOT NULL,
      details         TEXT,
      created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key             TEXT PRIMARY KEY,
      value           TEXT,
      is_encrypted    INTEGER NOT NULL DEFAULT 0,
      updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_aliases (
      id              TEXT PRIMARY KEY,
      alias           TEXT NOT NULL UNIQUE,
      target_url      TEXT NOT NULL,
      description     TEXT,
      is_builtin      INTEGER NOT NULL DEFAULT 0,
      is_enabled      INTEGER NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Migration: add upstream_api_key column if missing
  const cols = db.prepare(`PRAGMA table_info(agents)`).all() as { name: string }[]
  if (!cols.find(c => c.name === 'upstream_api_key')) {
    db.exec(`ALTER TABLE agents ADD COLUMN upstream_api_key TEXT`)
  }

  // Seed built-in aliases
  const insertAlias = db.prepare(`
    INSERT OR IGNORE INTO service_aliases (id, alias, target_url, description, is_builtin)
    VALUES (?, ?, ?, ?, 1)
  `)
  insertAlias.run('builtin-stripe', 'stripe', 'https://api.stripe.com', 'Stripe 支付 API')
  insertAlias.run('builtin-openai', 'openai', 'https://api.openai.com', 'OpenAI API')
  insertAlias.run('builtin-anthropic', 'anthropic', 'https://api.anthropic.com', 'Anthropic Claude')
  insertAlias.run('builtin-gads', 'google-ads', 'https://googleads.googleapis.com', 'Google Ads API')

  // Seed default settings
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
  const defaults: [string, string][] = [
    ['proxy_port', '8080'],
    ['api_port', '3000'],
    ['bind_address', '127.0.0.1'],
    ['proxy_ip_allowlist', '[]'],
    ['session_timeout_minutes', '30'],
    ['log_retention_days', '7'],
    ['alert_retention_days', '180'],
    ['auto_backup_enabled', '1'],
    ['kill_switch_active', '0'],
    ['license_tier', 'free'],
    ['setup_completed', '0'],
  ]
  for (const [k, v] of defaults) insertSetting.run(k, v)
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value)
}
