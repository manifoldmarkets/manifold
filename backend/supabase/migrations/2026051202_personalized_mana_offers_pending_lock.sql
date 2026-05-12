-- Cross-method pending lock: prevents the multi-tab "I paid full price by
-- accident" failure mode. When createcheckoutsession or create-daimo-session
-- starts a new payment for an offer, we mark the offer as pending. A second
-- attempt for the same offer (any method) within the lock window is rejected.
--
-- `payment_pending_session_id` and `payment_pending_at` are set on session
-- creation and cleared on success (status flip to redeemed implicitly clears
-- the meaningful state) or on a client-side abandon-callback. A 30-minute TTL
-- check at read time handles browser crashes / silent abandonment.
--
-- `stripe_promotion_code_id` stores the per-offer Stripe Promotion Code so
-- second checkout attempts share the same code (Stripe enforces single-use
-- at payment time). Stripe Coupon parent must exist in Stripe; see
-- STRIPE_OFFER_COUPON_ID in env.
alter table personalized_mana_offers
  add column if not exists payment_pending_session_id text,
  add column if not exists payment_pending_at timestamp with time zone,
  add column if not exists stripe_promotion_code_id text;
