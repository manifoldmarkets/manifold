create
or replace function get_contract_voters (this_contract_id text) returns table (data JSON) parallel SAFE language sql as $$
  SELECT users.data from users join votes on votes.user_id = users.id where votes.contract_id = this_contract_id;
$$;

create
or replace function get_option_voters (this_contract_id text, this_option_id text) returns table (data JSON) parallel SAFE language sql as $$
  SELECT users.data from users join votes on votes.user_id = users.id where votes.contract_id = this_contract_id and votes.id = this_option_id;
$$;
