create table campaigns (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  pillars_json jsonb not null,
  created_at timestamptz not null default now()
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id),
  to_number    text not null,
  call_sid     text unique,
  consent      boolean,
  status       text not null default 'pending',
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duration_ms  integer
);

create index sessions_call_sid_idx on sessions(call_sid);
create index sessions_campaign_idx on sessions(campaign_id);

create table turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id),
  turn_index      integer not null,
  speaker         text not null,
  pillar_id       text,
  lens            text,
  phase           text,
  prompt_text     text,
  response_text   text,
  start_ms        integer,
  end_ms          integer,
  raw_twilio_payload jsonb,
  created_at      timestamptz not null default now()
);

create index turns_session_idx on turns(session_id);

create table recordings (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id),
  recording_sid   text,
  recording_url   text,
  duration_sec    real,
  downloaded_path text,
  created_at      timestamptz not null default now()
);

create index recordings_session_idx on recordings(session_id);

create table transcripts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id),
  type         text not null,
  content_json jsonb not null,
  provider     text,
  created_at   timestamptz not null default now()
);

create index transcripts_session_idx on transcripts(session_id);
