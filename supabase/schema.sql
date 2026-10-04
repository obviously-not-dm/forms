-- Выполнить один раз: Supabase → SQL Editor → вставить → Run.
-- Повторный запуск безопасен: существующие данные не трогает.

create table if not exists public.attempts (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  quiz_id      text not null check (quiz_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  group_name   text check (char_length(group_name) <= 16),
  mode         text check (mode in ('exam', 'practice')),
  answers      jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 32000),
  hints        jsonb check (jsonb_typeof(hints) = 'object' and pg_column_size(hints) < 4000),
  score        int check (score >= 0),
  max_score    int check (max_score >= 0),
  feedback     text check (char_length(feedback) <= 2000),
  duration_sec int check (duration_sec >= 0)
);

alter table public.attempts add column if not exists mode text check (mode in ('exam', 'practice'));
alter table public.attempts add column if not exists hints jsonb
  check (jsonb_typeof(hints) = 'object' and pg_column_size(hints) < 4000);

create index if not exists attempts_quiz_idx on public.attempts (quiz_id, created_at);

-- Кто видит статистику:
-- insert into public.admins (user_id) select id from auth.users where email = 'почта@itmo.ru';
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.attempts enable row level security;
alter table public.admins enable row level security;

-- Студенты без входа могут только добавить свою попытку.
drop policy if exists "anyone can submit" on public.attempts;
create policy "anyone can submit" on public.attempts
  for insert to anon, authenticated with check (true);

drop policy if exists "admins read attempts" on public.attempts;
create policy "admins read attempts" on public.attempts
  for select to authenticated using (public.is_admin());

drop policy if exists "admins delete attempts" on public.attempts;
create policy "admins delete attempts" on public.attempts
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins
  for select to authenticated using (public.is_admin());

revoke all on public.attempts from anon;
grant insert on public.attempts to anon;
revoke all on public.admins from anon;

-- Таблица тестов (для хранения и редактирования тестов в облаке)
create table if not exists public.quizzes (
  id              text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  title           text not null check (char_length(title) <= 255),
  description     text,
  feedback_prompt text check (char_length(feedback_prompt) <= 255),
  sort_order      int default 0,
  hidden          boolean not null default false,
  content_md      text not null,
  schema_json     jsonb
);

alter table public.quizzes enable row level security;

drop policy if exists "anyone can read public quizzes" on public.quizzes;
create policy "anyone can read public quizzes" on public.quizzes
  for select to anon, authenticated using (not hidden or public.is_admin());

drop policy if exists "admins insert quizzes" on public.quizzes;
create policy "admins insert quizzes" on public.quizzes
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins update quizzes" on public.quizzes;
create policy "admins update quizzes" on public.quizzes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete quizzes" on public.quizzes;
create policy "admins delete quizzes" on public.quizzes
  for delete to authenticated using (public.is_admin());

grant select on public.quizzes to anon, authenticated;
grant insert, update, delete on public.quizzes to authenticated;
