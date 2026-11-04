-- Cash handover (Nov 2026): the rider can report paying a Captain directly, which lifts the booking
-- block; the Captain can confirm it or report it missing, which keeps the payment due.
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_payment_status_check;
ALTER TABLE rides ADD CONSTRAINT rides_payment_status_check CHECK (payment_status IN
 ('unconfirmed','driver_reported_received','rider_disputed','paid_online','rider_reported_paid','driver_reported_unpaid'));
DROP INDEX IF EXISTS idx_rides_rider_unsettled;
CREATE INDEX IF NOT EXISTS idx_rides_rider_unsettled ON rides(rider_id)
WHERE status = 'completed' AND payment_status NOT IN ('paid_online','driver_reported_received','rider_reported_paid');

-- Captains who signed up in the Captain app before the fix got the rider default name "Rider ####".
-- Rename only accounts that still carry that untouched default; names people chose are kept.
UPDATE accounts a SET name = 'Captain ' || substr(a.name, 7)
WHERE a.name ~ '^Rider [0-9]{4}$'
  AND EXISTS (SELECT 1 FROM drivers d WHERE d.user_id = a.id);

INSERT INTO schema_migrations(version) VALUES(37);
