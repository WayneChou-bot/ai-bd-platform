-- Review v6 round 4: the learning loop closes through a HUMAN decision.
-- Append-only adoption/dismissal records for Learning recommendations; the
-- latest row per (project_id, recommendation_key) is the standing decision,
-- older rows are the audit history. The agent never edits the ICP itself.
create table if not exists strategy_adoptions (
  id                  text primary key,
  project_id          text not null references projects(id) on delete cascade,
  recommendation_key  text not null,
  title               text not null,
  action              text not null check (action in ('adopted', 'dismissed')),
  note                text not null default '',
  created_at          timestamptz not null default now()
);
create index if not exists strategy_adoptions_proj_idx on strategy_adoptions(project_id, recommendation_key, created_at);
