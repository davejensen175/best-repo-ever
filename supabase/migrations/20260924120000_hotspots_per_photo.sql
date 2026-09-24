-- Hotspots belong to a photo, not a room (build step 4).
-- The spec stores x/y "normalized on source photo", but a room can hold several
-- photos, so a room-level hotspot has no single image to be positioned on. The
-- step-1 table had no UI and holds no data, so it is replaced rather than altered.
-- The source room is the photo's room, so moving a photo takes its hotspots along.

drop table public.hotspots;

create table public.hotspots (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  to_room_id uuid not null references public.rooms (id) on delete cascade,
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  created_at timestamptz not null default now()
);
create index hotspots_photo_id_idx on public.hotspots (photo_id);
create index hotspots_to_room_id_idx on public.hotspots (to_room_id);

create function public.photo_property(pid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select r.property_id from public.photos ph join public.rooms r on r.id = ph.room_id where ph.id = pid;
$$;

alter table public.hotspots enable row level security;

create policy "owner manages hotspots" on public.hotspots
  for all to authenticated
  using (public.owns_property(public.photo_property(photo_id)))
  with check (
    public.owns_property(public.photo_property(photo_id))
    and public.room_property(to_room_id) = public.photo_property(photo_id)
  );
create policy "hotspots of published properties are public" on public.hotspots
  for select to anon, authenticated using (public.property_is_published(public.photo_property(photo_id)));
