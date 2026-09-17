-- 講演(週末の集会)の担当日を登録するためのマイグレーション。
--
-- 講演者かどうかは名簿の特別承認「講演」で持つ(列は増やさない)。
-- ここでは担当日そのものを入れる talk_dates テーブルを作る。
-- 1人に先々の日付が複数入るので、名簿とは別のテーブルにしている。
--
-- 講演日付のページは管理者専用なので、閲覧も管理者だけに絞る
-- (他のテーブルは閲覧者も読めるが、これは閲覧者の画面のどこにも出ない)。
-- 必ず全体を一度に実行すること。

-- ---- talk_dates ----
create table if not exists talk_dates (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  -- 同じ人に同じ日を二重に入れない
  unique (member_id, date)
);

alter table talk_dates enable row level security;

create policy talk_dates_select on talk_dates for select using (is_admin());
create policy talk_dates_write on talk_dates for all using (is_admin()) with check (is_admin());

-- ---- 特別承認に「講演」を足す ----
-- 特別承認の選択肢をDB側の制約でも縛っている場合だけ、その制約を「講演」入りで張り直す。
-- 制約が無ければ何もしない(アプリ側の選択肢を増やすだけで保存できる)
do $$
declare
  r record;
  col_type text;
  dropped boolean := false;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%qualifications%'
  loop
    select data_type into col_type from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'qualifications';
    if col_type <> 'ARRAY' then
      raise exception '特別承認の列が配列ではありません(%)。制約 % を手で確認してください', col_type, r.conname;
    end if;
    execute format('alter table public.members drop constraint %I', r.conname);
    raise notice '制約 % を張り直しました', r.conname;
    dropped := true;
  end loop;

  if dropped then
    alter table public.members add constraint members_qualifications_check check (
      qualifications::text[] <@ array['祈り', '聖書研究朗読者', '聖書研究司会', '全体司会', '朗読', '話', '講演']::text[]
    );
  end if;
end $$;

-- 確認: talk_dates のポリシーが2行返ればよい
select policyname, cmd from pg_policies where tablename = 'talk_dates';
