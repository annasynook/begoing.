-- Profiles
create table profiles (
  id        uuid references auth.users on delete cascade primary key,
  name      text,
  email     text,
  city      text,
  interests text[] default '{}',
  created_at timestamptz default now()
);

-- Events
create table events (
  id            uuid default gen_random_uuid() primary key,
  title         text not null,
  description   text,
  date          timestamptz,
  city          text,
  category      text default 'Social',
  host_id       uuid references profiles(id),
  attendees     uuid[] default '{}',
  max_attendees integer default 0,
  lat           double precision,
  lng           double precision,
  created_at    timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table events   enable row level security;

create policy "Profiles: public read" on profiles for select using (true);
create policy "Profiles: own insert" on profiles for insert with check (auth.uid() = id);
create policy "Profiles: own update" on profiles for update using (auth.uid() = id);

create policy "Events: public read" on events for select using (true);
create policy "Events: auth insert" on events for insert with check (auth.uid() = host_id);
create policy "Events: auth update attendees" on events for update using (auth.uid() = any(attendees) or auth.uid() = host_id);
