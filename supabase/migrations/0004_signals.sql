-- Spec v0.3: Source / Signal intelligence — tracked entities and mention signals.
-- Signals are events with possible business meaning; evidence supports judgements (§8).

create table if not exists tracked_entities (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  canonical_name text not null,
  entity_type text not null check (entity_type in ('product','company','repository','person','technology')),
  aliases jsonb not null default '[]',
  canonical_url text,
  identifiers jsonb not null default '[]',
  keywords jsonb not null default '[]',
  created_at timestamptz not null
);

create table if not exists signals (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  entity_id text not null references tracked_entities(id) on delete cascade,
  lead_id text references leads(id) on delete set null,
  signal_type text not null,
  source_type text not null,
  source_url text not null,
  title text not null,
  snippet text not null,
  language text not null default 'en',
  country text,
  published_at timestamptz,
  observed_at timestamptz not null,
  confidence integer not null check (confidence between 0 and 100),
  business_relevance text not null check (business_relevance in ('low','medium','high')),
  mention_context text not null default 'neutral',
  sentiment text not null default 'neutral',
  intent text not null default 'none',
  query text not null default '',
  status text not null default 'NEW' check (status in ('NEW','CONVERTED','IGNORED')),
  created_at timestamptz not null
);

create index if not exists signals_project_idx on signals(project_id, observed_at desc);
create index if not exists signals_entity_url_idx on signals(entity_id, source_url);

-- Lead source gains 'mention' (v0.3). leads.source is the lead_source enum from 0001.
alter type lead_source add value if not exists 'mention';
