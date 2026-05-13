-- WhatsApp conversation history for multi-turn context
create table whatsapp_conversations (
  id bigint generated always as identity primary key,
  phone_hash text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create index idx_wa_conv_phone on whatsapp_conversations (phone_hash, created_at desc);
create index idx_wa_conv_created on whatsapp_conversations (created_at);

-- Rate limiting tracking per phone number
create table whatsapp_rate_limits (
  phone_hash text primary key,
  query_count int default 0,
  window_start timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_wa_rate_reset on whatsapp_rate_limits (window_start);

-- Function to reset rate limit windows automatically
create or replace function reset_rate_limit_if_expired()
returns trigger as $$
begin
  -- Reset counter if 24 hours have passed since window_start
  if now() - new.window_start > interval '24 hours' then
    new.query_count := 0;
    new.window_start := now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trigger_reset_rate_limit
  before update on whatsapp_rate_limits
  for each row
  execute function reset_rate_limit_if_expired();
