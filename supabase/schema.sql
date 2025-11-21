-- ============================================================================
-- MANIFOLD ANGOLA - SIMPLIFIED SCHEMA FOR SUPABASE
-- ============================================================================
-- This schema supports YES/NO binary markets only
-- Currency: AOA (Angolan Kwanza) - Real money
-- Removed: Multiple choice markets, groups, leagues, chat, play money (Mana)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE market_visibility AS ENUM ('public', 'unlisted');
CREATE TYPE market_resolution AS ENUM ('YES', 'NO', 'MKT', 'CANCEL');
CREATE TYPE bet_outcome AS ENUM ('YES', 'NO');
CREATE TYPE transaction_type AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL',
    'BET',
    'BET_SALE',
    'PAYOUT',
    'MARKET_CREATION',
    'REFERRAL_BONUS',
    'SIGNUP_BONUS'
);
CREATE TYPE auth_provider AS ENUM ('google', 'phone');

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Authentication
    auth_provider auth_provider NOT NULL,
    auth_provider_id TEXT NOT NULL,  -- Google UID or phone number hash

    -- Profile Info
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,

    -- Contact Info
    email TEXT,
    phone_number TEXT,
    phone_verified BOOLEAN DEFAULT FALSE,

    -- Balance (in AOA - Angolan Kwanza)
    balance DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,
    total_deposits DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,
    total_withdrawals DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,

    -- Stats
    total_bets_count INTEGER DEFAULT 0,
    markets_created_count INTEGER DEFAULT 0,
    profit_loss DECIMAL(15, 2) DEFAULT 0.00,

    -- Settings & Status
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    is_admin BOOLEAN DEFAULT FALSE,

    -- Referral System
    referred_by_user_id UUID REFERENCES users(id),
    referral_code TEXT UNIQUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_bet_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$'),
    CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- Create indexes for users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_auth_provider ON users(auth_provider, auth_provider_id);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone ON users(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- ============================================================================
-- PRIVATE USERS TABLE (Sensitive data)
-- ============================================================================

CREATE TABLE private_users (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Sensitive Auth Data
    api_key TEXT UNIQUE,

    -- Notification Settings
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,

    -- Blocked users
    blocked_user_ids UUID[] DEFAULT '{}',

    -- Device Tokens (for push notifications if added later)
    device_tokens TEXT[] DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- MARKETS TABLE (YES/NO Binary Markets Only)
-- ============================================================================

CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,

    -- Creator Info
    creator_id UUID NOT NULL REFERENCES users(id),
    creator_username TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    creator_avatar_url TEXT,

    -- Market Content
    question TEXT NOT NULL,
    description JSONB,  -- TipTap JSON content
    description_text TEXT,  -- Plain text for search
    cover_image_url TEXT,

    -- Market Settings
    visibility market_visibility DEFAULT 'public' NOT NULL,
    initial_probability DECIMAL(5, 4) NOT NULL DEFAULT 0.5000,

    -- AMM Pool State (CPMM)
    pool_yes DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    pool_no DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    p DECIMAL(10, 8) NOT NULL DEFAULT 0.5,  -- Probability constant

    -- Current Probability (cached for performance)
    prob DECIMAL(5, 4) NOT NULL DEFAULT 0.5000,
    prob_change_day DECIMAL(5, 4) DEFAULT 0.0000,
    prob_change_week DECIMAL(5, 4) DEFAULT 0.0000,
    prob_change_month DECIMAL(5, 4) DEFAULT 0.0000,

    -- Liquidity
    total_liquidity DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,
    subsidy_pool DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,

    -- Volume & Stats
    volume DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,
    volume_24h DECIMAL(15, 2) DEFAULT 0.00,
    unique_bettors_count INTEGER DEFAULT 0,

    -- Fees Collected (in AOA)
    fees_creator DECIMAL(15, 2) DEFAULT 0.00,
    fees_platform DECIMAL(15, 2) DEFAULT 0.00,
    fees_liquidity DECIMAL(15, 2) DEFAULT 0.00,

    -- Resolution
    is_resolved BOOLEAN DEFAULT FALSE NOT NULL,
    resolution market_resolution,
    resolution_probability DECIMAL(5, 4),  -- For MKT resolution
    resolution_time TIMESTAMPTZ,
    resolver_id UUID REFERENCES users(id),
    resolution_notes TEXT,

    -- Scoring (for discovery/ranking)
    popularity_score DECIMAL(10, 4) DEFAULT 0.0000,
    importance_score DECIMAL(10, 4) DEFAULT 0.0000,
    view_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    close_time TIMESTAMPTZ,  -- When betting closes
    last_bet_time TIMESTAMPTZ,
    last_comment_time TIMESTAMPTZ,

    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT question_length CHECK (char_length(question) BETWEEN 10 AND 200),
    CONSTRAINT probability_range CHECK (prob >= 0.01 AND prob <= 0.99),
    CONSTRAINT initial_prob_range CHECK (initial_probability >= 0.01 AND initial_probability <= 0.99)
);

-- Create indexes for markets
CREATE INDEX idx_markets_slug ON markets(slug);
CREATE INDEX idx_markets_creator_id ON markets(creator_id);
CREATE INDEX idx_markets_visibility ON markets(visibility) WHERE visibility = 'public';
CREATE INDEX idx_markets_is_resolved ON markets(is_resolved);
CREATE INDEX idx_markets_close_time ON markets(close_time) WHERE close_time IS NOT NULL;
CREATE INDEX idx_markets_created_at ON markets(created_at DESC);
CREATE INDEX idx_markets_volume ON markets(volume DESC);
CREATE INDEX idx_markets_popularity ON markets(popularity_score DESC);
CREATE INDEX idx_markets_prob ON markets(prob);

-- Full-text search index
CREATE INDEX idx_markets_question_search ON markets USING gin(to_tsvector('portuguese', question));
CREATE INDEX idx_markets_description_search ON markets USING gin(to_tsvector('portuguese', COALESCE(description_text, '')));

-- ============================================================================
-- BETS TABLE
-- ============================================================================

CREATE TABLE bets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- References
    user_id UUID NOT NULL REFERENCES users(id),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

    -- Bet Details
    outcome bet_outcome NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,  -- Amount in AOA (negative for SELL)
    shares DECIMAL(15, 4) NOT NULL,  -- Shares acquired (negative for SELL)

    -- Probability State
    prob_before DECIMAL(5, 4) NOT NULL,
    prob_after DECIMAL(5, 4) NOT NULL,

    -- Fees (in AOA)
    fee_creator DECIMAL(15, 2) DEFAULT 0.00,
    fee_platform DECIMAL(15, 2) DEFAULT 0.00,
    fee_liquidity DECIMAL(15, 2) DEFAULT 0.00,

    -- Limit Order Fields (optional)
    is_limit_order BOOLEAN DEFAULT FALSE,
    limit_prob DECIMAL(5, 4),
    order_amount DECIMAL(15, 2),
    is_filled BOOLEAN,
    is_cancelled BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,

    -- Redemption
    is_redemption BOOLEAN DEFAULT FALSE,

    -- API Flag
    is_api BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Constraints
    CONSTRAINT bet_amount_check CHECK (
        (is_redemption = TRUE) OR
        (ABS(amount) >= 1.00)  -- Minimum bet of 1 AOA
    )
);

-- Limit order fills (for tracking partial fills)
CREATE TABLE bet_fills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bet_id UUID NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
    matched_bet_id UUID REFERENCES bets(id),  -- NULL if matched by pool

    amount DECIMAL(15, 2) NOT NULL,
    shares DECIMAL(15, 4) NOT NULL,
    is_sale BOOLEAN DEFAULT FALSE,

    -- Fees for this fill
    fee_creator DECIMAL(15, 2) DEFAULT 0.00,
    fee_platform DECIMAL(15, 2) DEFAULT 0.00,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for bets
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_market_id ON bets(market_id);
CREATE INDEX idx_bets_created_at ON bets(created_at DESC);
CREATE INDEX idx_bets_outcome ON bets(outcome);
CREATE INDEX idx_bets_user_market ON bets(user_id, market_id);

-- Index for open limit orders
CREATE INDEX idx_bets_open_limits ON bets(market_id, outcome, limit_prob)
    WHERE is_limit_order = TRUE AND is_filled = FALSE AND is_cancelled = FALSE;

-- ============================================================================
-- COMMENTS TABLE
-- ============================================================================

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- References
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),

    -- Content
    content JSONB NOT NULL,  -- TipTap JSON content
    content_text TEXT,  -- Plain text for search

    -- Reply Thread
    reply_to_comment_id UUID REFERENCES comments(id),

    -- Bet Context (optional - if comment is tied to a bet)
    bet_id UUID REFERENCES bets(id),
    bet_amount DECIMAL(15, 2),
    bet_outcome bet_outcome,

    -- Engagement
    likes_count INTEGER DEFAULT 0,

    -- Visibility
    is_hidden BOOLEAN DEFAULT FALSE,
    hidden_by_user_id UUID REFERENCES users(id),
    hidden_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    edited_at TIMESTAMPTZ
);

-- Create indexes for comments
CREATE INDEX idx_comments_market_id ON comments(market_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);
CREATE INDEX idx_comments_reply_to ON comments(reply_to_comment_id) WHERE reply_to_comment_id IS NOT NULL;

-- ============================================================================
-- COMMENT LIKES TABLE
-- ============================================================================

CREATE TABLE comment_likes (
    user_id UUID NOT NULL REFERENCES users(id),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    PRIMARY KEY (user_id, comment_id)
);

-- ============================================================================
-- MARKET RESOLUTIONS TABLE (Audit Trail)
-- ============================================================================

CREATE TABLE market_resolutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    resolver_id UUID NOT NULL REFERENCES users(id),

    resolution market_resolution NOT NULL,
    resolution_probability DECIMAL(5, 4),  -- For MKT resolution

    -- Resolution Details
    notes TEXT,

    -- Payout Stats
    total_payout DECIMAL(15, 2) DEFAULT 0.00,
    payouts_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Constraints
    CONSTRAINT mkt_resolution_requires_probability CHECK (
        (resolution != 'MKT') OR
        (resolution_probability IS NOT NULL AND resolution_probability >= 0 AND resolution_probability <= 1)
    )
);

-- Index for market resolutions
CREATE INDEX idx_market_resolutions_market_id ON market_resolutions(market_id);

-- ============================================================================
-- TRANSACTIONS TABLE (All money movements)
-- ============================================================================

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User
    user_id UUID NOT NULL REFERENCES users(id),

    -- Transaction Details
    type transaction_type NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,  -- In AOA, positive for credit, negative for debit

    -- Balance tracking
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,

    -- Related entities
    market_id UUID REFERENCES markets(id),
    bet_id UUID REFERENCES bets(id),
    related_user_id UUID REFERENCES users(id),  -- For referrals

    -- Description
    description TEXT,

    -- External Reference (for deposits/withdrawals)
    external_reference TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_market_id ON transactions(market_id) WHERE market_id IS NOT NULL;

-- ============================================================================
-- MARKET FOLLOWS TABLE (Users following markets)
-- ============================================================================

CREATE TABLE market_follows (
    user_id UUID NOT NULL REFERENCES users(id),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    PRIMARY KEY (user_id, market_id)
);

-- Index for market follows
CREATE INDEX idx_market_follows_market_id ON market_follows(market_id);

-- ============================================================================
-- USER POSITIONS VIEW (Cached user positions per market)
-- ============================================================================

CREATE MATERIALIZED VIEW user_positions AS
SELECT
    user_id,
    market_id,
    SUM(CASE WHEN outcome = 'YES' THEN shares ELSE 0 END) as yes_shares,
    SUM(CASE WHEN outcome = 'NO' THEN shares ELSE 0 END) as no_shares,
    SUM(amount) as total_invested,
    COUNT(*) as bets_count,
    MAX(created_at) as last_bet_at
FROM bets
WHERE is_redemption = FALSE
GROUP BY user_id, market_id
HAVING SUM(CASE WHEN outcome = 'YES' THEN shares ELSE 0 END) > 0.0001
    OR SUM(CASE WHEN outcome = 'NO' THEN shares ELSE 0 END) > 0.0001;

CREATE UNIQUE INDEX idx_user_positions_pk ON user_positions(user_id, market_id);
CREATE INDEX idx_user_positions_user ON user_positions(user_id);
CREATE INDEX idx_user_positions_market ON user_positions(market_id);

-- ============================================================================
-- NOTIFICATIONS TABLE (Basic)
-- ============================================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Notification Type
    type TEXT NOT NULL,  -- 'bet_fill', 'market_resolved', 'comment_reply', etc.

    -- Content
    title TEXT NOT NULL,
    body TEXT,

    -- Related entities
    market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    source_user_id UUID REFERENCES users(id),

    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users: Public read, authenticated update own
CREATE POLICY "Users are viewable by everyone" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Private Users: Only own data
CREATE POLICY "Private users can view own data" ON private_users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Private users can update own data" ON private_users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Markets: Public read, authenticated create/update own
CREATE POLICY "Public markets are viewable by everyone" ON markets
    FOR SELECT USING (visibility = 'public' OR creator_id::text = auth.uid()::text);

CREATE POLICY "Authenticated users can create markets" ON markets
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Market creators can update own markets" ON markets
    FOR UPDATE USING (creator_id::text = auth.uid()::text);

-- Bets: Public read, authenticated create own
CREATE POLICY "Bets are viewable by everyone" ON bets
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create bets" ON bets
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own bets" ON bets
    FOR UPDATE USING (user_id::text = auth.uid()::text);

-- Comments: Public read, authenticated create own
CREATE POLICY "Comments are viewable by everyone" ON comments
    FOR SELECT USING (is_hidden = FALSE OR user_id::text = auth.uid()::text);

CREATE POLICY "Authenticated users can create comments" ON comments
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own comments" ON comments
    FOR UPDATE USING (user_id::text = auth.uid()::text);

-- Comment Likes: Public read, authenticated create/delete own
CREATE POLICY "Comment likes are viewable by everyone" ON comment_likes
    FOR SELECT USING (true);

CREATE POLICY "Users can like comments" ON comment_likes
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can unlike comments" ON comment_likes
    FOR DELETE USING (user_id::text = auth.uid()::text);

-- Transactions: Only own data
CREATE POLICY "Users can view own transactions" ON transactions
    FOR SELECT USING (user_id::text = auth.uid()::text);

-- Market Follows: Own actions only
CREATE POLICY "Market follows are viewable by everyone" ON market_follows
    FOR SELECT USING (true);

CREATE POLICY "Users can follow markets" ON market_follows
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can unfollow markets" ON market_follows
    FOR DELETE USING (user_id::text = auth.uid()::text);

-- Notifications: Only own
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (user_id::text = auth.uid()::text);

-- Market Resolutions: Public read
CREATE POLICY "Market resolutions are viewable by everyone" ON market_resolutions
    FOR SELECT USING (true);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_private_users_updated_at
    BEFORE UPDATE ON private_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bets_updated_at
    BEFORE UPDATE ON bets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update market stats after bet
CREATE OR REPLACE FUNCTION update_market_after_bet()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE markets
    SET
        last_bet_time = NEW.created_at,
        volume = volume + ABS(NEW.amount),
        unique_bettors_count = (
            SELECT COUNT(DISTINCT user_id)
            FROM bets
            WHERE market_id = NEW.market_id AND is_redemption = FALSE
        )
    WHERE id = NEW.market_id;

    -- Update user last_bet_at
    UPDATE users
    SET
        last_bet_at = NEW.created_at,
        total_bets_count = total_bets_count + 1
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_market_after_bet
    AFTER INSERT ON bets
    FOR EACH ROW
    WHEN (NEW.is_redemption = FALSE)
    EXECUTE FUNCTION update_market_after_bet();

-- Function to update market comment time
CREATE OR REPLACE FUNCTION update_market_after_comment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE markets
    SET last_comment_time = NEW.created_at
    WHERE id = NEW.market_id;

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_market_after_comment
    AFTER INSERT ON comments
    FOR EACH ROW EXECUTE FUNCTION update_market_after_comment();

-- Function to update comment likes count
CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE comments
        SET likes_count = likes_count + 1
        WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE comments
        SET likes_count = likes_count - 1
        WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_comment_likes
    AFTER INSERT OR DELETE ON comment_likes
    FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();

-- Function to create user notification
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_body TEXT DEFAULT NULL,
    p_market_id UUID DEFAULT NULL,
    p_comment_id UUID DEFAULT NULL,
    p_source_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, body, market_id, comment_id, source_user_id)
    VALUES (p_user_id, p_type, p_title, p_body, p_market_id, p_comment_id, p_source_user_id)
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$ language 'plpgsql';

-- ============================================================================
-- FUNCTIONS FOR AMM CALCULATIONS
-- ============================================================================

-- Calculate probability from pool
CREATE OR REPLACE FUNCTION calculate_pool_probability(
    pool_yes DECIMAL,
    pool_no DECIMAL,
    p DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
    IF pool_yes <= 0 OR pool_no <= 0 THEN
        RETURN 0.5;
    END IF;

    -- CPMM probability formula
    RETURN p * pool_no / (p * pool_no + (1 - p) * pool_yes);
END;
$$ language 'plpgsql' IMMUTABLE;

-- ============================================================================
-- FUNCTIONS FOR REAL-TIME SUBSCRIPTIONS
-- ============================================================================

-- Enable realtime for specific tables
-- Run in Supabase dashboard:
-- ALTER PUBLICATION supabase_realtime ADD TABLE markets;
-- ALTER PUBLICATION supabase_realtime ADD TABLE bets;
-- ALTER PUBLICATION supabase_realtime ADD TABLE comments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Create system user for platform operations
INSERT INTO users (
    id,
    auth_provider,
    auth_provider_id,
    username,
    name,
    avatar_url,
    is_admin,
    balance
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'google',
    'system',
    'ManifoldAngola',
    'Manifold Angola',
    '/logo.png',
    TRUE,
    0
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- REFRESH MATERIALIZED VIEW JOB
-- ============================================================================

-- Create function to refresh user_positions
CREATE OR REPLACE FUNCTION refresh_user_positions()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_positions;
END;
$$ language 'plpgsql';

-- Schedule with pg_cron (run in Supabase dashboard):
-- SELECT cron.schedule('refresh-user-positions', '*/5 * * * *', 'SELECT refresh_user_positions()');

-- ============================================================================
-- COMMENTS / DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE users IS 'User accounts with AOA balance for prediction market';
COMMENT ON TABLE markets IS 'YES/NO binary prediction markets using CPMM AMM';
COMMENT ON TABLE bets IS 'User bets/trades on markets';
COMMENT ON TABLE comments IS 'Comments on markets';
COMMENT ON TABLE transactions IS 'All AOA money movements for audit trail';
COMMENT ON TABLE notifications IS 'User notifications';
COMMENT ON COLUMN markets.pool_yes IS 'YES shares in AMM pool';
COMMENT ON COLUMN markets.pool_no IS 'NO shares in AMM pool';
COMMENT ON COLUMN markets.p IS 'Probability constant for CPMM formula: y^p * n^(1-p) = k';
COMMENT ON COLUMN markets.prob IS 'Current market probability (cached)';
COMMENT ON COLUMN bets.shares IS 'Shares acquired (positive for buy, negative for sell)';
COMMENT ON COLUMN users.balance IS 'User balance in AOA (Angolan Kwanza)';
