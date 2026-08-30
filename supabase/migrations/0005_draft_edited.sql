-- Review v2 #11: mark human-edited drafts (evidence grounding not revalidated).
alter table outreach_drafts add column if not exists human_edited boolean not null default false;
