create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  about_me text not null,
  role text null,
  photo_url text null,
  linkedin_url text null,
  twitter_url text null,
  public_email text null,
  edit_secret_hash text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists profiles_created_at_idx
on public.profiles (created_at);
