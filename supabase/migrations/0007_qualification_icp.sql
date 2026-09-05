-- A score is only meaningful relative to a specific ICP (review v6 F01).
alter table qualification_scores add column if not exists icp_id text;
