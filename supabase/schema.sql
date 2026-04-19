-- Profiles
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  email text,
  city text,
  interests text[] default '{}',
  created_at timestamptz default now()
);

-- Events
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  date timestamptz,
  city text,
  category text default 'Social',
  host_id uuid references profiles(id),
  attendees uuid[] default '{}',
  max_attendees integer default 0,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

-- Friend requests / friendships
create table if not exists friend_requests (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  responded_at timestamptz,
  constraint friend_requests_no_self check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_unique_pending_pair
  on friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id));

-- Chat threads
create table if not exists chat_threads (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('direct', 'event')),
  created_by uuid references profiles(id) on delete set null,
  event_id uuid references events(id) on delete cascade,
  direct_key text unique,
  title text,
  created_at timestamptz default now(),
  constraint event_threads_need_event check (
    (type = 'event' and event_id is not null)
    or (type = 'direct' and event_id is null)
  )
);

create unique index if not exists chat_threads_unique_event_id
  on chat_threads (event_id)
  where event_id is not null;

-- Chat participants
create table if not exists chat_participants (
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);

-- Messages
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  thread_id uuid not null references chat_threads(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz default now()
);

create index if not exists messages_thread_created_idx on messages (thread_id, created_at desc);
create index if not exists chat_participants_user_idx on chat_participants (user_id);

-- RLS
alter table profiles enable row level security;
alter table events enable row level security;
alter table friend_requests enable row level security;
alter table chat_threads enable row level security;
alter table chat_participants enable row level security;
alter table messages enable row level security;

-- Profiles policies
drop policy if exists "Profiles: public read" on profiles;
drop policy if exists "Profiles: own insert" on profiles;
drop policy if exists "Profiles: own update" on profiles;
create policy "Profiles: public read" on profiles for select using (true);
create policy "Profiles: own insert" on profiles for insert with check (auth.uid() = id);
create policy "Profiles: own update" on profiles for update using (auth.uid() = id);

-- Events policies
drop policy if exists "Events: public read" on events;
drop policy if exists "Events: auth insert" on events;
drop policy if exists "Events: auth update attendees" on events;
create policy "Events: public read" on events for select using (true);
create policy "Events: auth insert" on events for insert with check (auth.uid() = host_id);
create policy "Events: auth update attendees" on events
  for update
  using (auth.uid() = any(attendees) or auth.uid() = host_id);

-- Friend request policies
create policy "Friend requests: involved users read" on friend_requests
  for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Friend requests: sender insert" on friend_requests
  for insert
  with check (auth.uid() = sender_id);

create policy "Friend requests: involved users update" on friend_requests
  for update
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Chat thread policies
create policy "Chat threads: participant read" on chat_threads
  for select
  using (
    exists (
      select 1 from chat_participants cp
      where cp.thread_id = chat_threads.id and cp.user_id = auth.uid()
    )
  );

create policy "Chat threads: creator insert" on chat_threads
  for insert
  with check (auth.uid() = created_by);

-- Chat participant policies
create policy "Chat participants: participant read" on chat_participants
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from chat_participants self
      where self.thread_id = chat_participants.thread_id and self.user_id = auth.uid()
    )
  );

create policy "Chat participants: self insert direct" on chat_participants
  for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from chat_threads ct
      where ct.id = chat_participants.thread_id
        and ct.type = 'direct'
        and ct.created_by = auth.uid()
    )
    or exists (
      select 1
      from chat_threads ct
      join events e on e.id = ct.event_id
      where ct.id = chat_participants.thread_id
        and ct.type = 'event'
        and (auth.uid() = e.host_id or auth.uid() = any(e.attendees))
        and (chat_participants.user_id = e.host_id or chat_participants.user_id = any(e.attendees))
    )
  );

create policy "Chat participants: self update" on chat_participants
  for update
  using (user_id = auth.uid());

-- Message policies
create policy "Messages: participant read" on messages
  for select
  using (
    exists (
      select 1 from chat_participants cp
      where cp.thread_id = messages.thread_id and cp.user_id = auth.uid()
    )
  );

create policy "Messages: participant insert" on messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from chat_participants cp
      where cp.thread_id = messages.thread_id and cp.user_id = auth.uid()
    )
  );
