-- Kin schema. Run in the Supabase SQL editor (or `supabase db push`).
-- Extends the concept-brief schema with `patient_ref` and `medicines`.

create extension if not exists "pgcrypto";

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid references auth.users,   -- clinician Kin escalates to
  name text not null,
  patient_ref text,                          -- clinic-facing reference, e.g. PT-1042
  username text unique,                      -- patient login handle
  email text unique,                         -- set when the patient uses SSO
  language text default 'en',
  timezone text,
  conditions text[] default '{}',
  medicines text[] default '{}',
  baseline_gap_hours numeric default 24,
  peer_opt_in boolean default false          -- opted in to peer support
);

-- If re-running on an older schema, make sure the column exists.
alter table patients add column if not exists peer_opt_in boolean default false;

create table if not exists engagement_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  ts timestamptz default now(),
  direction text check (direction in ('pull','push')),
  channel text,                              -- voice_widget | phone | whatsapp
  answered boolean default true,
  transcript text,
  duration_s int
);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references engagement_events on delete cascade,
  patient_id uuid references patients on delete cascade,
  ts timestamptz default now(),
  language text default 'en',
  med_adherence text,                        -- taken | missed | stopped | unclear | na
  symptoms jsonb default '[]',
  mood text,
  red_flags text[] default '{}',
  triage text check (triage in ('on_track','nudge','red_flag')),
  summary_en text,
  suggested_action text
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  kind text check (kind in ('quiet_anomaly','loud_anomaly','unreachable')),
  severity int default 3,
  context text,
  suggested_action text,
  status text default 'open',                -- open | acked | resolved
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Kin's audit trail: every autonomous decision the agent made.
create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  ts timestamptz default now(),
  kind text check (kind in ('triaged','nudged','called_back','escalated')),
  rationale text,
  alert_id uuid references alerts on delete set null
);

-- Prescriptions the patient uploads for the clinician to review.
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  file_name text,
  mime_type text,
  file_url text,                             -- data URL (demo) or storage URL
  note text,
  status text default 'pending',             -- pending | reviewed
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

-- Peer support: opted-in patients connect and exchange text messages.
create table if not exists peer_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references patients on delete cascade,
  addressee_id uuid references patients on delete cascade,
  status text default 'pending',             -- pending | accepted | declined
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists peer_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references peer_connections on delete cascade,
  sender_id uuid references patients on delete cascade,
  body text,
  created_at timestamptz default now()
);

create index if not exists idx_events_patient_ts on engagement_events (patient_id, ts);
create index if not exists idx_actions_patient_ts on agent_actions (patient_id, ts);
create index if not exists idx_signals_patient_ts on signals (patient_id, ts);
create index if not exists idx_alerts_patient_status on alerts (patient_id, status);
create index if not exists idx_rx_patient_status on prescriptions (patient_id, status);
create index if not exists idx_pc_members on peer_connections (requester_id, addressee_id);
create index if not exists idx_pm_connection on peer_messages (connection_id, created_at);

-- Realtime: stream alert + agent activity to the clinician dashboard.
-- Guarded so the migration is safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table alerts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'agent_actions'
  ) then
    alter publication supabase_realtime add table agent_actions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'prescriptions'
  ) then
    alter publication supabase_realtime add table prescriptions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'peer_messages'
  ) then
    alter publication supabase_realtime add table peer_messages;
  end if;
end $$;
