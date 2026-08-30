-- 閲覧者アカウント(ユーザー登録)を追加するためのマイグレーション。
--
-- このリポジトリには今までマイグレーションが無く、テーブルもRLSポリシーも
-- Supabaseのダッシュボードで直接作られていた。ここから履歴を残す。
--
-- 【実行前に必ず読むこと】
-- 一番下で、自分自身を管理者としてstaffに登録している。メールアドレスが今の
-- ログイン用のものと違うと0件になり、is_staff() が自分にも false を返して
-- 自分自身がアプリから締め出される。末尾の確認クエリで1行返ることを必ず確かめること。
-- 途中まで実行するのも同じ理由で危険なので、必ず全体を一度に実行する。

-- ---- staff (管理者・閲覧者アカウント) ----
create table if not exists staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'viewer')),
  display_name text not null,
  -- 一覧表示に使う。ここに持っておくことで、表示のたびにservice-role権限が必要な
  -- auth.admin API を呼ばずに済む(招待時にEdge Functionが書き込む)
  email text
);

-- ---- RLS判定用の関数 ----
-- security definer なので、staff 自身のRLSに邪魔されずに参照できる
create or replace function is_staff() returns boolean
  language sql security definer stable as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;

create or replace function is_admin() returns boolean
  language sql security definer stable as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'admin');
$$;

-- ---- 既存ポリシーの一括削除 ----
-- これまでのポリシーはダッシュボードで作られていて名前が定まっていないため、
-- 対象テーブルのものを全て落としてから貼り直す
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'members', 'program_types', 'programs', 'songs',
        'teaching_points', 'settings', 'assignments', 'staff'
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---- RLSの有効化 ----
alter table members enable row level security;
alter table program_types enable row level security;
alter table programs enable row level security;
alter table songs enable row level security;
alter table teaching_points enable row level security;
alter table settings enable row level security;
alter table assignments enable row level security;
alter table staff enable row level security;

-- ---- ポリシー ----
-- 閲覧はスタッフ(管理者・閲覧者)全員、変更は管理者のみ
create policy members_select on members for select using (is_staff());
create policy members_write on members for all using (is_admin()) with check (is_admin());

create policy program_types_select on program_types for select using (is_staff());
create policy program_types_write on program_types for all using (is_admin()) with check (is_admin());

create policy programs_select on programs for select using (is_staff());
create policy programs_write on programs for all using (is_admin()) with check (is_admin());

create policy songs_select on songs for select using (is_staff());
create policy songs_write on songs for all using (is_admin()) with check (is_admin());

create policy teaching_points_select on teaching_points for select using (is_staff());
create policy teaching_points_write on teaching_points for all using (is_admin()) with check (is_admin());

create policy settings_select on settings for select using (is_staff());
create policy settings_write on settings for all using (is_admin()) with check (is_admin());

create policy assignments_select on assignments for select using (is_staff());
create policy assignments_write on assignments for all using (is_admin()) with check (is_admin());

-- 閲覧者も一覧は見られるが、変更・削除・招待はできない
create policy staff_select on staff for select using (is_staff());
create policy staff_write on staff for all using (is_admin()) with check (is_admin());

-- ---- 最初の管理者(自分自身) ----
-- 今ログインに使っているメールアドレスから auth.users を引いて登録する。
-- メールアドレスが違えば0件になり、そのまま実行すると自分が締め出されるので、
-- 下の確認クエリで「1行返ること」を必ず確かめること。
insert into staff (user_id, role, display_name, email)
select id, 'admin', '井田 陽介', email from auth.users where email = 'yida1990jw@gmail.com'
on conflict (user_id) do update set role = 'admin';

-- 確認: ここで1行(自分がadmin)返ればよい。0行なら上のメールアドレスを見直すこと
select user_id, role, display_name, email from staff;
