-- Public email signup OTP storage.
-- Apply this migration in the VistaBalayan Supabase project before enabling
-- the public EmailJS signup endpoints.

create table if not exists public.email_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null,
  otp_hash text not null,
  attempts integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.email_otps
  drop constraint if exists email_otps_purpose_check;

alter table public.email_otps
  add constraint email_otps_purpose_check
  check (purpose in ('staff_creation', 'password_reset', 'email_verification', 'public_signup'));

create index if not exists idx_email_otps_lookup
  on public.email_otps (email, purpose, otp_hash)
  where consumed_at is null;

create index if not exists idx_email_otps_expiry
  on public.email_otps (expires_at);

alter table public.email_otps enable row level security;
revoke all on public.email_otps from anon, authenticated;
drop policy if exists "No client access to email otps" on public.email_otps;
create policy "No client access to email otps"
  on public.email_otps
  for all
  to authenticated, anon
  using (false)
  with check (false);
