create table gidx_receipts (
    id bigint primary key generated always as identity,
    user_id text references users(id),
    merchant_transaction_id text not null,
    session_id text not null,
    created_time timestamp with time zone not null default now(),
    status text,
    status_code int,
    payment_status_code text,
    payment_status_message text,
    transaction_status_code text,
    transaction_status_message text,
    merchant_session_id text,
    amount bigint,
    currency text,
    payment_method_type text,
    payment_amount_type text,
    session_score int,
    reason_codes text[],
    service_type text,
    txn_id text,
    payment_data jsonb,
    callback_data jsonb
);

create index cash_out_receipts_user_id_idx on gidx_receipts (user_id);
create index cash_out_receipts_merchant_transaction_id_idx on gidx_receipts (merchant_transaction_id);

