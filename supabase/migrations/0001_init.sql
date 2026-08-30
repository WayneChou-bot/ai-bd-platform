-- AI Business Development Platform — initial schema
-- Spec v0.1 §30 + v0.2 S9. Mirrors src/core/schemas exactly.

create extension if not exists "pgcrypto";

-- Enums -------------------------------------------------------------------
create type entity_type as enum ('company', 'individual');
create type lead_status as enum (
  'DISCOVERED','RESEARCHING','RESEARCHED','QUALIFIED','REJECTED',
  'REVIEW','DRAFTED','APPROVED','CONTACTED','REPLIED','OUTCOME_RECORDED');
create type lead_source as enum ('manual','csv','search','github','company_page','fixture');
create type evidence_type as enum (
  'job_posting','blog_post','press_release','product_page','github_repo',
  'tech_stack','funding','social_post','company_page','documentation');
create type evidence_category as enum (
  'hiring','product_launch','technology','content','funding','company_profile','negative');
create type score_dimension as enum ('product_fit','problem_evidence','intent_signal','role_relevance');
create type polarity as enum ('positive','negative');
create type classification as enum ('HIGH_FIT','MEDIUM_FIT','LOW_FIT','REJECT');
create type outreach_status as enum ('DRAFT','APPROVED','REJECTED','SENT','FAILED');
create type delivery_provider as enum ('mock','resend','smtp');
create type inbound_source as enum ('resend','simulated','manual');
create type reply_outcome as enum (
  'positive_reply','negative_reply','interested','meeting_requested','not_relevant','auto_reply','unclassified');
create type outcome_kind as enum (
  'no_response','positive_reply','negative_reply','interested','meeting_requested','not_relevant');
create type recorded_by as enum ('user','reply_agent');
create type agent_name as enum (
  'product_understanding','discovery','research','qualification','outreach','reply','learning');
create type run_status as enum ('QUEUED','RUNNING','COMPLETED','FAILED','RETRYING');
create type target_entity as enum ('company','individual','both');

-- Tables -------------------------------------------------------------------
create table projects (
  id          text primary key,
  name        text not null,
  category    text,
  description text not null default '',
  website     text,
  repository  text,
  created_at  timestamptz not null default now()
);

create table product_understandings (
  project_id            text primary key references projects(id) on delete cascade,
  category              text not null,
  problem               jsonb not null,
  value_propositions    jsonb not null,
  target_roles          jsonb not null,
  target_company_types  jsonb not null,
  confidence            numeric(4,3) not null check (confidence between 0 and 1),
  generated_at          timestamptz not null
);

create table icp_profiles (
  id                 text primary key,
  project_id         text not null references projects(id) on delete cascade,
  source             text not null check (source in ('ai_suggested','manual')),
  target_entity      target_entity not null default 'company',
  industries         jsonb not null default '[]',
  company_size_min   int,
  company_size_max   int,
  regions            jsonb not null default '[]',
  technologies       jsonb not null default '[]',
  target_roles       jsonb not null default '[]',
  business_problems  jsonb not null default '[]',
  positive_signals   jsonb not null default '[]',
  negative_signals   jsonb not null default '[]',
  created_at         timestamptz not null default now()
);

create table leads (
  id                  text primary key,
  project_id          text not null references projects(id) on delete cascade,
  entity_type         entity_type not null default 'company',
  company_name        text not null,
  display_name        text,
  headline            text,
  public_profile_urls jsonb not null default '[]',
  website             text,
  industry            text,
  size_estimate       text,
  location            text,
  source              lead_source not null,
  discovery_reason    text not null default '',
  status              lead_status not null default 'DISCOVERED',
  thread_key          text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index leads_project_status_idx on leads(project_id, status);

create table evidence (
  id           text primary key,
  lead_id      text not null references leads(id) on delete cascade,
  type         evidence_type not null,
  category     evidence_category not null,
  claim        text not null,
  source_url   text not null,
  observed_at  timestamptz not null,
  confidence   numeric(4,3) not null check (confidence between 0 and 1),
  supports     score_dimension not null,
  polarity     polarity not null default 'positive'
);
create index evidence_lead_idx on evidence(lead_id);

create table qualification_scores (
  lead_id           text primary key references leads(id) on delete cascade,
  product_fit       smallint not null check (product_fit between 0 and 100),
  problem_evidence  smallint not null check (problem_evidence between 0 and 100),
  intent_signal     smallint not null check (intent_signal between 0 and 100),
  role_relevance    smallint not null check (role_relevance between 0 and 100),
  data_confidence   smallint not null check (data_confidence between 0 and 100),
  total_score       smallint not null check (total_score between 0 and 100),
  classification    classification not null,
  why               jsonb not null default '[]',
  risks             jsonb not null default '[]',
  rationale         text not null default '',
  withheld          boolean not null default false,
  scored_at         timestamptz not null
);

create table outreach_drafts (
  id             text primary key,
  lead_id        text not null references leads(id) on delete cascade,
  channel        text not null default 'email',
  subject        text not null,
  body           text not null,
  evidence_used  jsonb not null,
  tone           text not null,
  confidence     numeric(4,3) not null,
  status         outreach_status not null default 'DRAFT',
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  approved_at    timestamptz
);
create index outreach_lead_idx on outreach_drafts(lead_id);

create table delivery_receipts (
  id          text primary key,
  draft_id    text not null references outreach_drafts(id) on delete cascade,
  lead_id     text not null references leads(id) on delete cascade,
  provider    delivery_provider not null,
  message_id  text not null,
  thread_key  text not null,
  simulated   boolean not null,
  sent_at     timestamptz not null,
  error       text
);

create table inbound_events (
  id            text primary key,
  source        inbound_source not null,
  channel       text not null default 'email',
  thread_key    text,
  lead_id       text references leads(id) on delete set null,
  from_address  text not null,
  subject       text not null,
  body_text     text not null,           -- untrusted, rendered as text only
  received_at   timestamptz not null,
  raw_ref       text not null default '',
  processed_at  timestamptz
);
create unique index inbound_raw_ref_idx on inbound_events(source, raw_ref) where raw_ref <> '';

create table reply_classifications (
  id             text primary key,
  event_id       text not null references inbound_events(id) on delete cascade,
  lead_id        text not null references leads(id) on delete cascade,
  outcome        reply_outcome not null,
  confidence     numeric(4,3) not null,
  rationale      text not null,
  quoted_signal  text not null,
  needs_human    boolean not null,
  agent_run_id   text,
  created_at     timestamptz not null default now()
);

create table outcomes (
  id           text primary key,
  lead_id      text not null references leads(id) on delete cascade,
  outcome      outcome_kind not null,
  notes        text not null default '',
  recorded_by  recorded_by not null,
  event_id     text references inbound_events(id) on delete set null,
  recorded_at  timestamptz not null default now()
);
create index outcomes_lead_idx on outcomes(lead_id, recorded_at);

create table learning_insights (
  id            text primary key,
  project_id    text not null references projects(id) on delete cascade,
  kind          text not null,
  title         text not null,
  detail        text not null,
  data          jsonb not null,
  sample_size   int not null,
  generated_at  timestamptz not null
);

create table agent_runs (
  id              text primary key,
  project_id      text not null references projects(id) on delete cascade,
  agent           agent_name not null,
  lead_id         text references leads(id) on delete set null,
  status          run_status not null default 'QUEUED',
  started_at      timestamptz,
  completed_at    timestamptz,
  latency_ms      int,
  model           text,
  token_usage     jsonb,
  retry_count     int not null default 0,
  error           text,
  input_summary   text not null default '',
  output_summary  text not null default '',
  created_at      timestamptz not null default now()
);
create index agent_runs_queue_idx on agent_runs(status, created_at);

create table audit_events (
  id          text primary key,
  project_id  text not null references projects(id) on delete cascade,
  lead_id     text references leads(id) on delete set null,
  actor       text not null check (actor in ('user','system','agent')),
  action      text not null,
  detail      text not null default '',
  created_at  timestamptz not null default now()
);
create index audit_project_idx on audit_events(project_id, created_at);
