-- ArchBid AI: switch paid proposal fulfillment from Stripe to Lemon Squeezy.
-- Run this migration in the Supabase SQL Editor before testing payments.

alter table public.proposal_purchases
  add column if not exists lemon_squeezy_checkout_session_id text,
  add column if not exists lemon_squeezy_order_id text;

create unique index if not exists proposal_purchases_lemon_order_id_key
  on public.proposal_purchases (lemon_squeezy_order_id)
  where lemon_squeezy_order_id is not null;

alter table public.proposal_purchases
  alter column amount_cents set default 1900;

-- Existing Stripe columns are intentionally retained for historical compatibility.
-- New purchases are recorded using the Lemon Squeezy columns above.
