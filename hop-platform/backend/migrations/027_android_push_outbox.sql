-- Native devices participate in the existing durable notification pipeline.
CREATE OR REPLACE FUNCTION hop_push_enqueue(acct uuid, k text, r text, st text, rl text) RETURNS void LANGUAGE sql AS $fn$
    INSERT INTO push_outbox(account_id, kind, ref, status, role)
    SELECT acct, k, r, st, rl
    WHERE (EXISTS (SELECT 1 FROM push_subscriptions WHERE account_id = acct)
        OR EXISTS (SELECT 1 FROM android_push_tokens WHERE account_id = acct))
      AND COALESCE((SELECT notifications_enabled FROM account_preferences WHERE account_id = acct), true)
$fn$;
INSERT INTO schema_migrations(version) VALUES(27);
