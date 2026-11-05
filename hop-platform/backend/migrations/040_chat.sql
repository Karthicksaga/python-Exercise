-- Chat, for any feature. A conversation belongs to something (kind + ref, e.g. 'ride' + ride id);
-- participants are accounts with a role; messages are append-only. Who may post, and when, is decided
-- per kind in Go (chatPolicies in chat.go). Ride chat is the first kind; ride_messages is copied over.

CREATE TABLE chat_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind ~ '^[a-z][a-z_]{1,30}$'),
    ref text NOT NULL CHECK (length(ref) BETWEEN 1 AND 100),
    last_message_id bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kind, ref)
);

CREATE TABLE chat_participants (
    conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role ~ '^[a-z][a-z_]{1,30}$'),
    -- Highest message id this participant has seen (read receipts and unread counts).
    last_read_id bigint NOT NULL DEFAULT 0,
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, account_id)
);
CREATE INDEX chat_participants_account ON chat_participants(account_id);

CREATE TABLE chat_messages (
    id bigserial PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    -- NULL sender: a system message (for example "Trip ended").
    sender_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
    -- Chosen by the sending device, so a retried send is stored once.
    client_id uuid,
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conversation ON chat_messages(conversation_id, id);
CREATE UNIQUE INDEX chat_messages_client ON chat_messages(conversation_id, sender_id, client_id) WHERE client_id IS NOT NULL;

-- Copy existing ride chat. Old messages count as read, so nobody gets a pile of stale unread badges.
INSERT INTO chat_conversations(kind, ref, created_at)
SELECT 'ride', ride_id::text, min(created_at) FROM ride_messages GROUP BY ride_id;
INSERT INTO chat_participants(conversation_id, account_id, role)
SELECT c.id, r.rider_id, 'rider' FROM chat_conversations c JOIN rides r ON r.id::text = c.ref WHERE c.kind = 'ride'
UNION ALL
SELECT c.id, r.driver_id, 'captain' FROM chat_conversations c JOIN rides r ON r.id::text = c.ref WHERE c.kind = 'ride' AND r.driver_id IS NOT NULL;
INSERT INTO chat_messages(conversation_id, sender_id, body, created_at)
SELECT c.id, m.sender_id, m.body, m.created_at FROM ride_messages m JOIN chat_conversations c ON c.kind = 'ride' AND c.ref = m.ride_id::text ORDER BY m.id;
UPDATE chat_conversations c SET last_message_id = COALESCE((SELECT max(id) FROM chat_messages m WHERE m.conversation_id = c.id), 0);
UPDATE chat_participants p SET last_read_id = c.last_message_id FROM chat_conversations c WHERE c.id = p.conversation_id;

-- Phone alerts for new messages go through the existing push outbox.
ALTER TABLE push_outbox DROP CONSTRAINT push_outbox_kind_check;
ALTER TABLE push_outbox ADD CONSTRAINT push_outbox_kind_check CHECK (kind IN ('offer', 'ride', 'notification', 'chat'));

-- A new message: bump the conversation, wake every participant's open request, and queue a phone alert
-- for everyone except the sender.
CREATE FUNCTION hop_chat_message() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    UPDATE chat_conversations SET last_message_id = NEW.id WHERE id = NEW.conversation_id AND last_message_id < NEW.id;
    PERFORM pg_notify('hop_events', p.account_id::text) FROM chat_participants p WHERE p.conversation_id = NEW.conversation_id;
    -- Held for 3 seconds (lease_until): if the person reads it in the app meanwhile, no alert is sent.
    INSERT INTO push_outbox(account_id, kind, ref, status, role, lease_until)
    SELECT p.account_id, 'chat', NEW.id::text, '', p.role, now() + interval '3 seconds'
    FROM chat_participants p
    WHERE p.conversation_id = NEW.conversation_id AND p.account_id IS DISTINCT FROM NEW.sender_id
      AND (EXISTS (SELECT 1 FROM push_subscriptions WHERE account_id = p.account_id)
        OR EXISTS (SELECT 1 FROM android_push_tokens WHERE account_id = p.account_id))
      AND COALESCE((SELECT notifications_enabled FROM account_preferences WHERE account_id = p.account_id), true);
    RETURN NULL;
END $fn$;
CREATE TRIGGER chat_messages_signal AFTER INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION hop_chat_message();

-- Someone read further: wake the others so "Seen" appears straight away.
CREATE FUNCTION hop_chat_read() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM pg_notify('hop_events', p.account_id::text) FROM chat_participants p
    WHERE p.conversation_id = NEW.conversation_id AND p.account_id <> NEW.account_id;
    RETURN NULL;
END $fn$;
CREATE TRIGGER chat_participants_read AFTER UPDATE OF last_read_id ON chat_participants FOR EACH ROW
WHEN (NEW.last_read_id > OLD.last_read_id) EXECUTE FUNCTION hop_chat_read();

INSERT INTO schema_migrations(version) VALUES(40);
