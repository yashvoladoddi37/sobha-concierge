create table chat_feedback (
  id serial primary key,
  message_id text not null unique,
  rating text not null check (rating in ('up', 'down')),
  query text,
  response text,
  created_at timestamptz default now()
);

create index on chat_feedback (rating);
create index on chat_feedback (created_at);
