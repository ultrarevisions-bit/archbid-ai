-- ArchBid AI initial database schema
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.firms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'My Architecture Firm',
  country text not null default 'United States',
  services text[] not null default '{}',
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rfps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_id uuid references public.firms(id) on delete set null,
  file_name text not null,
  file_path text,
  file_type text,
  status text not null default 'uploaded' check (status in ('uploaded','analyzing','analyzed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rfp_analyses (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null unique references public.rfps(id) on delete cascade,
  opportunity_score integer check (opportunity_score between 0 and 100),
  recommendation text,
  project_name text,
  client_name text,
  location text,
  project_type text,
  deadline date,
  requirements jsonb not null default '[]'::jsonb,
  evaluation_criteria jsonb not null default '[]'::jsonb,
  submission_requirements jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  missing_items jsonb not null default '[]'::jsonb,
  raw_analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.firms enable row level security;
alter table public.rfps enable row level security;
alter table public.rfp_analyses enable row level security;

create policy "Users can view their own firm"
  on public.firms for select
  using (auth.uid() = owner_id);

create policy "Users can create their own firm"
  on public.firms for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own firm"
  on public.firms for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own firm"
  on public.firms for delete
  using (auth.uid() = owner_id);

create policy "Users can view their own RFPs"
  on public.rfps for select
  using (auth.uid() = user_id);

create policy "Users can create their own RFPs"
  on public.rfps for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own RFPs"
  on public.rfps for update
  using (auth.uid() = user_id);

create policy "Users can delete their own RFPs"
  on public.rfps for delete
  using (auth.uid() = user_id);

create policy "Users can view analyses for their RFPs"
  on public.rfp_analyses for select
  using (exists (select 1 from public.rfps where rfps.id = rfp_analyses.rfp_id and rfps.user_id = auth.uid()));

create policy "Users can create analyses for their RFPs"
  on public.rfp_analyses for insert
  with check (exists (select 1 from public.rfps where rfps.id = rfp_analyses.rfp_id and rfps.user_id = auth.uid()));

create policy "Users can update analyses for their RFPs"
  on public.rfp_analyses for update
  using (exists (select 1 from public.rfps where rfps.id = rfp_analyses.rfp_id and rfps.user_id = auth.uid()));

create policy "Users can delete analyses for their RFPs"
  on public.rfp_analyses for delete
  using (exists (select 1 from public.rfps where rfps.id = rfp_analyses.rfp_id and rfps.user_id = auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.firms (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('rfps', 'rfps', false)
on conflict (id) do nothing;

create policy "Users can upload their own RFP files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'rfps' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view their own RFP files"
on storage.objects for select
to authenticated
using (bucket_id = 'rfps' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own RFP files"
on storage.objects for delete
to authenticated
using (bucket_id = 'rfps' and (storage.foldername(name))[1] = auth.uid()::text);

-- Paid proposal add-on. Launch price: $19 one-time.
create table if not exists public.proposal_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rfp_id uuid not null references public.rfps(id) on delete cascade,
  analysis_id uuid not null unique references public.rfp_analyses(id) on delete cascade,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  lemon_squeezy_checkout_session_id text,
  lemon_squeezy_order_id text,
  amount_cents integer not null default 1900,
  currency text not null default 'usd',
  status text not null default 'paid' check (status in ('paid','refunded','failed')),
  created_at timestamptz not null default now()
);

create unique index if not exists proposal_purchases_lemon_order_id_key
  on public.proposal_purchases (lemon_squeezy_order_id)
  where lemon_squeezy_order_id is not null;

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rfp_id uuid not null references public.rfps(id) on delete cascade,
  analysis_id uuid not null unique references public.rfp_analyses(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','generating','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposal_purchases enable row level security;
alter table public.proposals enable row level security;

create policy "Users can view their proposal purchases"
  on public.proposal_purchases for select
  using (auth.uid() = user_id);

create policy "Users can view their proposals"
  on public.proposals for select
  using (auth.uid() = user_id);

create policy "Users can create their proposals"
  on public.proposals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their proposals"
  on public.proposals for update
  using (auth.uid() = user_id);
