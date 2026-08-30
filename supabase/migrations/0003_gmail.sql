-- Gmail adapter: provider thread id + new enum values
alter type delivery_provider add value if not exists 'gmail';
alter type inbound_source add value if not exists 'gmail';
alter table delivery_receipts add column if not exists provider_thread_id text;
create index if not exists delivery_receipts_provider_thread_idx on delivery_receipts(provider, provider_thread_id);
