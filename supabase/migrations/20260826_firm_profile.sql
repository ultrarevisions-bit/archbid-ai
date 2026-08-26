-- ArchBid AI reusable firm profile
-- Run this migration in the Supabase SQL Editor before using /firm-profile.

alter table public.firms
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column public.firms.profile is
  'Reusable firm-specific information used when generating procurement proposals.';
