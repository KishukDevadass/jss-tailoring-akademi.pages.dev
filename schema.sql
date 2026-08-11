-- =====================================================================
--  JSS Tailoring Akademi — Supabase schema
--  Run this once in the Supabase dashboard → SQL Editor → New query.
--  It is idempotent: re-running it is safe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('lecturer', 'student');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- One row per signed-up user, created automatically by the trigger below.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null default '',
  email       text,
  role        public.user_role not null default 'student',
  created_at  timestamptz not null default now()
);

create table if not exists public.materials (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  subject         text,
  description     text,
  content         text,
  file_path       text,
  file_name       text,
  file_size       bigint,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_by_name text,
  created_at      timestamptz not null default now()
);

create table if not exists public.assignments (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  subject         text,
  description     text not null,
  due_date        date,
  total_marks     integer,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_by_name text,
  created_at      timestamptz not null default now()
);

create table if not exists public.submissions (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null references public.assignments(id) on delete cascade,
  assignment_title text,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  student_name     text,
  content          text,
  file_path        text,
  file_name        text,
  file_size        bigint,
  submitted_at     timestamptz not null default now(),
  -- a student turns in each assignment once
  unique (assignment_id, student_id)
);

create index if not exists materials_created_at_idx   on public.materials (created_at desc);
create index if not exists assignments_created_at_idx on public.assignments (created_at desc);
create index if not exists submissions_assignment_idx on public.submissions (assignment_id);
create index if not exists submissions_student_idx    on public.submissions (student_id);

-- ---------------------------------------------------------------------
-- Create a profile automatically when someone signs up.
-- The role and name come from the metadata the client sends to signUp().
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Role helpers.
-- SECURITY DEFINER so that reading `profiles` inside a policy on
-- `profiles` doesn't recurse into that same policy.
-- ---------------------------------------------------------------------
create or replace function public.is_lecturer()
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'lecturer'
  );
$$;

create or replace function public.is_student()
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'student'
  );
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.materials   enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

-- Profiles: everyone signed in can read names; you may only touch your own row.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated using (id = auth.uid());

-- Materials: readable by everyone signed in, written only by lecturers.
drop policy if exists "materials readable by authenticated" on public.materials;
create policy "materials readable by authenticated"
  on public.materials for select to authenticated using (true);

drop policy if exists "materials insert by lecturers" on public.materials;
create policy "materials insert by lecturers"
  on public.materials for insert to authenticated
  with check (public.is_lecturer() and created_by = auth.uid());

drop policy if exists "materials update own" on public.materials;
create policy "materials update own"
  on public.materials for update to authenticated using (created_by = auth.uid());

drop policy if exists "materials delete own" on public.materials;
create policy "materials delete own"
  on public.materials for delete to authenticated using (created_by = auth.uid());

-- Assignments: same shape as materials.
drop policy if exists "assignments readable by authenticated" on public.assignments;
create policy "assignments readable by authenticated"
  on public.assignments for select to authenticated using (true);

drop policy if exists "assignments insert by lecturers" on public.assignments;
create policy "assignments insert by lecturers"
  on public.assignments for insert to authenticated
  with check (public.is_lecturer() and created_by = auth.uid());

drop policy if exists "assignments update own" on public.assignments;
create policy "assignments update own"
  on public.assignments for update to authenticated using (created_by = auth.uid());

drop policy if exists "assignments delete own" on public.assignments;
create policy "assignments delete own"
  on public.assignments for delete to authenticated using (created_by = auth.uid());

-- Submissions: lecturers see all; students see and write only their own.
drop policy if exists "submissions readable" on public.submissions;
create policy "submissions readable"
  on public.submissions for select to authenticated
  using (public.is_lecturer() or student_id = auth.uid());

drop policy if exists "submissions insert own" on public.submissions;
create policy "submissions insert own"
  on public.submissions for insert to authenticated
  with check (public.is_student() and student_id = auth.uid());

drop policy if exists "submissions update own" on public.submissions;
create policy "submissions update own"
  on public.submissions for update to authenticated using (student_id = auth.uid());

drop policy if exists "submissions delete own" on public.submissions;
create policy "submissions delete own"
  on public.submissions for delete to authenticated using (student_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage buckets (private — the app serves files through signed URLs)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false), ('submissions', 'submissions', false)
on conflict (id) do nothing;

drop policy if exists "material files readable" on storage.objects;
create policy "material files readable"
  on storage.objects for select to authenticated
  using (bucket_id = 'materials');

drop policy if exists "material files writable by lecturers" on storage.objects;
create policy "material files writable by lecturers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.is_lecturer());

-- Lecturers can read every submission file; students only their own uploads.
--
-- Ownership is decided by the first path segment (the uploader's user id),
-- not by storage.objects.owner. Uploads are brokered by the /api/upload-url
-- Worker using the service-role key, so `owner` is the service role rather
-- than the student — the path is the reliable signal, and the Worker is what
-- guarantees a user can only ever be given a path under their own id.
drop policy if exists "submission files readable" on storage.objects;
create policy "submission files readable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'submissions'
    and (public.is_lecturer() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists "submission files writable by students" on storage.objects;
create policy "submission files writable by students"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.is_student());
