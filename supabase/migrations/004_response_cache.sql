create table response_cache (
  id serial primary key,
  query_key text not null unique,
  query_raw text not null,
  response_text text not null,
  sources jsonb not null default '[]',
  hit_count integer not null default 0,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

create index on response_cache (query_key);
create index on response_cache (expires_at);

-- Atomic hit counter
create or replace function bump_cache_hit(cache_key text)
returns void as $$
  update response_cache
  set hit_count = hit_count + 1
  where query_key = cache_key
    and expires_at > now();
$$ language sql;
