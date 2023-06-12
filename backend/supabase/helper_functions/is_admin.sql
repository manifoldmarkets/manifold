create
or replace function is_admin (input_string text) returns boolean immutable parallel SAFE as $$
DECLARE
-- @Austin, @JamesGrugett, @SG, @DavidChee, @Alice, @ian, @IngaWei, @mqp, @Sinclair
    strings TEXT[] := ARRAY[
        'igi2zGXsfxYPgB0DJTXVJVmwCOr2',
        '5LZ4LgYuySdL1huCWe7bti02ghx2', 
        'tlmGNz9kjXc2EteizMORes4qvWl2', 
        'uglwf3YKOZNGjjEXKc5HampOFRE2', 
        'qJHrvvGfGsYiHZkGY6XjVfIMj233', 
        'AJwLWoo3xue32XIiAVrL5SyR1WB2', 
        'GRwzCexe5PM6ThrSsodKZT9ziln2',
        '62TNqzdBx7X2q621HltsJm8UFht2', 
        '0k1suGSJKVUnHbCPEhHNpgZPkUP2'
        ];
BEGIN
    RETURN input_string = ANY(strings);
END;
$$ language plpgsql;
