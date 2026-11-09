-- Metrycor 001: fundação. Valores monetários em centavos (INTEGER). Toda tabela de negócio tem org_id.
CREATE TABLE organizations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, document TEXT UNIQUE, is_demo INTEGER NOT NULL DEFAULT 0, timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE users(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE, email TEXT NOT NULL UNIQUE COLLATE NOCASE, document TEXT, phone TEXT, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN('org_admin','manager','seller')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
CREATE TABLE pipeline_stages(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#8B5CF6', position INTEGER NOT NULL,
 kind TEXT NOT NULL DEFAULT 'open' CHECK(kind IN('open','won','lost')), required_fields TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE clients(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, document TEXT, phone TEXT, email TEXT, company TEXT, notes TEXT,
 is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT, deleted_at TEXT);
CREATE UNIQUE INDEX ux_clients_doc ON clients(org_id,document) WHERE document IS NOT NULL AND deleted_at IS NULL;
CREATE TABLE leads(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id), client_id INTEGER REFERENCES clients(id), name TEXT NOT NULL, phone TEXT, whatsapp TEXT, email TEXT, document TEXT, company TEXT,
 category TEXT, product TEXT, source TEXT, owner_id INTEGER REFERENCES users(id), stage_id INTEGER NOT NULL REFERENCES pipeline_stages(id),
 premium_cents INTEGER NOT NULL DEFAULT 0, brokerage_cents INTEGER NOT NULL DEFAULT 0, commission_cents INTEGER NOT NULL DEFAULT 0,
 priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN('baixa','media','alta')), next_action TEXT, notes TEXT, tags TEXT,
 entered_at TEXT NOT NULL DEFAULT (datetime('now')), last_contact_at TEXT, closed_at TEXT, lost_reason TEXT,
 is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT, deleted_at TEXT);
CREATE INDEX ix_leads_owner_stage ON leads(org_id,owner_id,stage_id);
CREATE INDEX ix_leads_closed ON leads(org_id,closed_at);
CREATE TABLE lead_activities(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, lead_id INTEGER NOT NULL REFERENCES leads(id), user_id INTEGER, kind TEXT NOT NULL, text TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX ix_act_lead ON lead_activities(lead_id,created_at);
CREATE TABLE tasks(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organizations(id), title TEXT NOT NULL, description TEXT, assigned_to INTEGER REFERENCES users(id), lead_id INTEGER REFERENCES leads(id), client_id INTEGER REFERENCES clients(id),
 due_at TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN('baixa','media','alta')), status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','concluida')),
 origin TEXT NOT NULL DEFAULT 'manual', is_demo INTEGER NOT NULL DEFAULT 0, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX ix_tasks_due ON tasks(org_id,status,due_at);
CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, org_id INTEGER, user_id INTEGER, entity TEXT NOT NULL, entity_id INTEGER, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
