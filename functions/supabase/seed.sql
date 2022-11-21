create table if not exists users (
    id text not null primary key,
    data jsonb not null
);

create table if not exists contracts (
    id text not null primary key,
    data jsonb not null
);

create table if not exists groups (
    id text not null primary key,
    data jsonb not null
);

create table if not exists txns (
    id text not null primary key,
    data jsonb not null
);

create table if not exists bets (
    id text not null primary key,
    data jsonb not null
);

create table if not exists comments (
    id text not null primary key,
    data jsonb not null
);
