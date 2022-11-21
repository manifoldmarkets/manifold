create table if not exists users (
    id text not null primary key,
    data jsonb not null
);
alter table users enable row level security;

create table if not exists contracts (
    id text not null primary key,
    data jsonb not null
);
alter table contracts enable row level security;

create table if not exists groups (
    id text not null primary key,
    data jsonb not null
);
alter table groups enable row level security;

create table if not exists txns (
    id text not null primary key,
    data jsonb not null
);
alter table txns enable row level security;

create table if not exists bets (
    id text not null primary key,
    data jsonb not null
);
alter table bets enable row level security;

create table if not exists comments (
    id text not null primary key,
    data jsonb not null
);
alter table comments enable row level security;
