-- Phase 3: engagement
alter table leads add column if not exists contact_email text;
alter type outreach_status add value if not exists 'SUPERSEDED';
