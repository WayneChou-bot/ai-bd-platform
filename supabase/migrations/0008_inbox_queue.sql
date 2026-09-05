-- Review v6 round 3 (F14 + F15):
-- outcomes.occurred_at — when the business event happened (reply received),
--   distinct from when the row was written; null on legacy rows (treated as
--   recorded_at by the application).
-- reply_classifications.review_status / resolved_at — the human work-ticket,
--   separate from the model's needs_human flag which is never rewritten.
alter table outcomes add column if not exists occurred_at timestamptz;
alter table reply_classifications add column if not exists review_status text not null default 'pending';
alter table reply_classifications add column if not exists resolved_at timestamptz;
