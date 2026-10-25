CREATE TABLE android_push_tokens (
 token text PRIMARY KEY CHECK (length(token) BETWEEN 20 AND 4096),
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 app text NOT NULL CHECK (app IN ('rider','captain')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX android_push_account ON android_push_tokens(account_id);
INSERT INTO schema_migrations(version) VALUES(26);
