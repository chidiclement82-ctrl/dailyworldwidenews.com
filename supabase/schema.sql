-- Database for the news site.
-- Anyone may read published stories. Only the editor may write.

-- The editor -----------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- No policies on purpose: only the two functions below touch this table.

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- The first signed-in account to call this becomes the editor. After that it
-- only reports whether the caller is the editor.
create function public.claim_admin() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  lock table public.admins in exclusive mode;
  if not exists (select 1 from public.admins) then
    insert into public.admins (user_id) values ((select auth.uid()));
  end if;
  return exists (select 1 from public.admins where user_id = (select auth.uid()));
end;
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.claim_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.claim_admin() to authenticated;

-- Stories --------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null default '',
  body text not null default '',
  category text not null default '',
  author text not null default '',
  cover_url text not null default '',
  cover_alt text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_status_published_at_idx on public.posts (status, published_at desc);
alter table public.posts enable row level security;

create policy "Anyone can read published stories" on public.posts
  for select to anon, authenticated using (status = 'published');
create policy "Editor can read everything" on public.posts
  for select to authenticated using ((select public.is_admin()));
create policy "Editor can add stories" on public.posts
  for insert to authenticated with check ((select public.is_admin()));
create policy "Editor can change stories" on public.posts
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Editor can delete stories" on public.posts
  for delete to authenticated using ((select public.is_admin()));

grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

-- Site settings (a single row) -----------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  site_name text not null default 'ICONDAILY',
  tagline text not null default 'Global Celebrity news, entertainment and culture',
  author text not null default '',
  google_verification text not null default ''
);
insert into public.settings (id) values (1);
alter table public.settings enable row level security;

create policy "Anyone can read settings" on public.settings
  for select to anon, authenticated using (true);
create policy "Editor can change settings" on public.settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;

-- Pictures -------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy "Editor can upload pictures" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and (select public.is_admin()));
create policy "Editor can delete pictures" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and (select public.is_admin()));

-- Lets the sign-in page know whether the site already has its editor, so it
-- only offers "create account" on a brand new site. Reveals nothing else.
create function public.has_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins);
$$;
revoke execute on function public.has_editor() from public;
grant execute on function public.has_editor() to anon, authenticated;
