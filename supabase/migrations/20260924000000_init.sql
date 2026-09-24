-- Initial schema for the node-based property walkthrough (spec §6).
-- Deviations from the spec's starting point:
--   * users -> public.profiles, keyed to auth.users.
--   * *_url columns hold storage object paths (e.g. floor_plan_path), not full URLs,
--     so the data survives a change of project URL.
--   * photos.order_index, and created_at/updated_at timestamps, were added.

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  brokerage text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, brokerage)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'brokerage', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Properties ----------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  address text not null,
  mls_number text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  slug text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  floor_plan_path text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_user_id_idx on public.properties (user_id);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  label text not null,
  order_index integer not null default 0,
  floorplan_x double precision check (floorplan_x between 0 and 1),
  floorplan_y double precision check (floorplan_y between 0 and 1),
  created_at timestamptz not null default now()
);
create index rooms_property_id_idx on public.rooms (property_id, order_index);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  storage_path text not null,
  is_primary boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index photos_room_id_idx on public.photos (room_id, order_index);

-- Later build steps (hotspots: step 4, staging: step 6, leads: step 7).
-- Created now so the data model is complete; no UI uses them yet.

create table public.hotspots (
  id uuid primary key default gen_random_uuid(),
  from_room_id uuid not null references public.rooms (id) on delete cascade,
  to_room_id uuid not null references public.rooms (id) on delete cascade,
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1)
);

create table public.staged_images (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  style text not null,
  output_path text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- Access helpers --------------------------------------------------------------

create function public.owns_property(pid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.properties p where p.id = pid and p.user_id = auth.uid());
$$;

create function public.property_is_published(pid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.properties p where p.id = pid and p.status = 'published');
$$;

create function public.room_property(rid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select r.property_id from public.rooms r where r.id = rid;
$$;

-- Row level security ----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.rooms enable row level security;
alter table public.photos enable row level security;
alter table public.hotspots enable row level security;
alter table public.staged_images enable row level security;
alter table public.leads enable row level security;

create policy "own profile read" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "owner manages properties" on public.properties
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "published properties are public" on public.properties
  for select to anon, authenticated using (status = 'published');

create policy "owner manages rooms" on public.rooms
  for all to authenticated
  using (public.owns_property(property_id)) with check (public.owns_property(property_id));
create policy "rooms of published properties are public" on public.rooms
  for select to anon, authenticated using (public.property_is_published(property_id));

create policy "owner manages photos" on public.photos
  for all to authenticated
  using (public.owns_property(public.room_property(room_id)))
  with check (public.owns_property(public.room_property(room_id)));
create policy "photos of published properties are public" on public.photos
  for select to anon, authenticated using (public.property_is_published(public.room_property(room_id)));

create policy "owner manages hotspots" on public.hotspots
  for all to authenticated
  using (public.owns_property(public.room_property(from_room_id)))
  with check (
    public.owns_property(public.room_property(from_room_id))
    and public.room_property(to_room_id) = public.room_property(from_room_id)
  );
create policy "hotspots of published properties are public" on public.hotspots
  for select to anon, authenticated using (public.property_is_published(public.room_property(from_room_id)));

create policy "owner manages staged images" on public.staged_images
  for all to authenticated
  using (public.owns_property(public.room_property((select room_id from public.photos where id = photo_id))))
  with check (public.owns_property(public.room_property((select room_id from public.photos where id = photo_id))));

create policy "owner reads leads" on public.leads
  for select to authenticated using (public.owns_property(property_id));
create policy "anyone can leave a lead on a published property" on public.leads
  for insert to anon, authenticated with check (public.property_is_published(property_id));

-- Storage ---------------------------------------------------------------------
-- One public bucket. Objects live under <user_id>/<property_id>/..., and only the
-- owner can write to their own folder. Paths contain random UUIDs, so draft media
-- is unguessable but not access-controlled; switch to signed URLs if that matters.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-media', 'listing-media', true, 26214400,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy "owners upload listing media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners update listing media" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete listing media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners list listing media" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
