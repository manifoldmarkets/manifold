create
or replace function is_admin (input_string text) returns boolean immutable parallel SAFE as $$
DECLARE
    strings TEXT[] := ARRAY[
        'igi2zGXsfxYPgB0DJTXVJVmwCOr2', -- Austin
        '5LZ4LgYuySdL1huCWe7bti02ghx2', -- JamesGrugett
        'tlmGNz9kjXc2EteizMORes4qvWl2', -- SG
        'uglwf3YKOZNGjjEXKc5HampOFRE2', -- Salty
        'qJHrvvGfGsYiHZkGY6XjVfIMj233', -- Alice
        'AJwLWoo3xue32XIiAVrL5SyR1WB2', -- ian
        'GRwzCexe5PM6ThrSsodKZT9ziln2', -- Inga
        '62TNqzdBx7X2q621HltsJm8UFht2', -- mqp
        '0k1suGSJKVUnHbCPEhHNpgZPkUP2', -- Sinclair
        'vuI5upWB8yU00rP7yxj95J2zd952', -- ManifoldPolitics
        'vUks7InCtYhBFrdLQhqXFUBHD4D2', -- baraki
        'cA1JupYR5AR8btHUs2xvkui7jA93' -- Gen
        ];
BEGIN
    RETURN input_string = ANY(strings);
END;
$$ language plpgsql;
