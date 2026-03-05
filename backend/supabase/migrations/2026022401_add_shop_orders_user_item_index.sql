-- Add index on shop_orders(user_id, item_id) to speed up one-time purchase limit checks
-- and per-user order queries. Used by shop-purchase-merch.ts and shop-reset-all.ts.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shop_orders_user_item
  ON shop_orders (user_id, item_id);
