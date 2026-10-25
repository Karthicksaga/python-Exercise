-- Standards-based Web Push (VAPID). Subscriptions are per browser/device; the outbox is filled at commit
-- time by triggers (only for accounts that subscribed and kept notifications on) and drained by workers
-- with SKIP LOCKED, so any number of API instances can send without duplicates.
CREATE TABLE push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 20 AND 2048),
    p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 20 AND 256),
    auth text NOT NULL CHECK (length(auth) BETWEEN 8 AND 128),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_account ON push_subscriptions(account_id, created_at);
CREATE TABLE push_outbox (
    id bigserial PRIMARY KEY,
    account_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('offer','ride','notification')),
    ref text NOT NULL,
    status text NOT NULL DEFAULT '',
    role text NOT NULL DEFAULT '',
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION hop_push_enqueue(acct uuid, k text, r text, st text, rl text) RETURNS void LANGUAGE sql AS $fn$
    INSERT INTO push_outbox(account_id, kind, ref, status, role)
    SELECT acct, k, r, st, rl
    WHERE EXISTS (SELECT 1 FROM push_subscriptions WHERE account_id = acct)
      AND COALESCE((SELECT notifications_enabled FROM account_preferences WHERE account_id = acct), true)
$fn$;

CREATE FUNCTION hop_push_offer() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM hop_push_enqueue(NEW.driver_id, 'offer', NEW.ride_id::text, '', '');
    RETURN NULL;
END $fn$;
CREATE TRIGGER ride_offers_push AFTER INSERT ON ride_offers FOR EACH ROW EXECUTE FUNCTION hop_push_offer();

CREATE FUNCTION hop_push_ride() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM hop_push_enqueue(NEW.rider_id, 'ride', NEW.id::text, NEW.status, 'rider');
    IF NEW.driver_id IS NOT NULL THEN
        PERFORM hop_push_enqueue(NEW.driver_id, 'ride', NEW.id::text, NEW.status, 'driver');
    END IF;
    RETURN NULL;
END $fn$;
CREATE TRIGGER rides_push AFTER UPDATE ON rides FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION hop_push_ride();

CREATE FUNCTION hop_push_notification() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM hop_push_enqueue(NEW.account_id, 'notification', NEW.id::text, '', '');
    RETURN NULL;
END $fn$;
CREATE TRIGGER notifications_push AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION hop_push_notification();

INSERT INTO schema_migrations(version) VALUES(16);
