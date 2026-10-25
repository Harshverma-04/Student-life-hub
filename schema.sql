-- Student Life Hub schema
-- Run in Supabase SQL Editor as the project owner.
create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  course text not null check (course in ('Polytechnic','ITI')),
  semester text not null check (semester in ('Semester 1','Semester 2','Semester 3','Semester 4','Semester 5','Semester 6','Trade')),
  subject text not null check (char_length(subject) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  file_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.student_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  saved_note_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.notes enable row level security;
alter table public.student_progress enable row level security;

-- Admin membership can be checked by authenticated users, but only project owner
-- can add/remove rows using SQL/dashboard. No client write policies for admins.
drop policy if exists "Authenticated users can check admin membership" on public.admins;
create policy "Authenticated users can check admin membership"
on public.admins for select to authenticated using (true);

drop policy if exists "Anyone can read published notes" on public.notes;
create policy "Anyone can read published notes"
on public.notes for select to anon, authenticated using (published = true);

drop policy if exists "Admins can read all notes" on public.notes;
create policy "Admins can read all notes"
on public.notes for select to authenticated
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can add notes" on public.notes;
create policy "Admins can add notes"
on public.notes for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
);

drop policy if exists "Admins can update notes" on public.notes;
create policy "Admins can update notes"
on public.notes for update to authenticated
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can delete notes" on public.notes;
create policy "Admins can delete notes"
on public.notes for delete to authenticated
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "Students read own progress" on public.student_progress;
create policy "Students read own progress"
on public.student_progress for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Students create own progress" on public.student_progress;
create policy "Students create own progress"
on public.student_progress for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Students update own progress" on public.student_progress;
create policy "Students update own progress"
on public.student_progress for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Private bucket: files are only downloadable through short-lived signed URLs
-- generated after the app has confirmed the user is signed in. For stricter
-- distribution, change this to admin-only downloads in the policy below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes-pdfs', 'notes-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

drop policy if exists "Admin can upload note PDFs" on storage.objects;
create policy "Admin can upload note PDFs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'notes-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
);

drop policy if exists "Admin can update note PDFs" on storage.objects;
create policy "Admin can update note PDFs"
on storage.objects for update to authenticated
using (
  bucket_id = 'notes-pdfs'
  and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
)
with check (
  bucket_id = 'notes-pdfs'
  and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
);

drop policy if exists "Admin can delete note PDFs" on storage.objects;
create policy "Admin can delete note PDFs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'notes-pdfs'
  and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
);

-- A signed-in user can create a short-lived signed URL for published files.
-- Storage signed-URL authorization checks SELECT policies. This policy lets
-- signed-in users read only paths referenced by published notes.
drop policy if exists "Signed-in users can read published note PDFs" on storage.objects;
create policy "Signed-in users can read published note PDFs"
on storage.objects for select to authenticated
using (
  bucket_id = 'notes-pdfs'
  and exists (
    select 1 from public.notes n
    where n.file_path = storage.objects.name and n.published = true
  )
);

-- Public visitors can browse note metadata, but PDF downloads require Google sign-in.
