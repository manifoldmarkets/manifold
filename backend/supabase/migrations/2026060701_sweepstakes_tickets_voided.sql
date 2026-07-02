-- Void columns on sweepstakes_tickets — companion to the prize-eligibility
-- decoupling and the admin-driven refund flow.
--
-- When an admin flips a user to prizeEligibility = 'ineligible' with
-- voidOutstandingTickets: true (e.g. an under-18 case where their parents
-- want the mana refunded, or a confirmed alt where we want the entry pool
-- cleaned up), the user's outstanding tickets in unresolved drawings are
-- stamped here and their mana is refunded via SWEEPSTAKES_TICKET_REFUND.
--
-- Voided rows survive for audit. They're excluded from the draw and the
-- claim by the `voided_at IS NULL` predicate at both call sites.

ALTER TABLE sweepstakes_tickets
  ADD COLUMN IF NOT EXISTS voided_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- Partial index over active (non-voided) tickets in a sweepstakes.
-- selectSweepstakesWinners and the buy-flow bonding-curve query both scan
-- by sweepstakes_num and care only about live rows.
CREATE INDEX IF NOT EXISTS idx_sweepstakes_tickets_active
ON sweepstakes_tickets (sweepstakes_num)
WHERE voided_at IS NULL;
