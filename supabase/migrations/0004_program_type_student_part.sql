-- プログラム種別に、帳票の載せ方を決める印を2つ足す。
--
-- 帳票の振り分けは、これまで課題番号(teaching_point_id)の有無だけで決まっていた。
-- 課題番号の無いプログラム(教えて育てる(サンプルシーン)・教えて育てる(話))が出てきたため、
-- 課題番号とは別のしるしを持たせる。2つは別々の軸で、組み合わせて使う。
--
--   student_part(学生の割り当て)      … 割当予定表とスリップに載る。その分、集会予定表からは外れる
--   on_counselor_sheet(助言者用紙に載せる) … 助言者用紙に載る
--
--   課題番号があるものは、印が無くても両方に載る(今までどおり)
--   教えて育てる(サンプルシーン) … 両方にチェック
--   教えて育てる(話)             … 助言者用紙だけにチェック(集会予定表側に残す)
--
-- 助言者用紙に課題の無いものも載せるのは、3．聖書朗読から「伝道を楽しもう」の間は
-- 助言者用紙を見ながら進行するため、その間だけ別の用紙を見に行かなくて済むようにするもの。
--
-- 既存のテーブルへの列追加なので、権限(grant)の付け直しは不要。
-- すでに一度実行していても、そのまま流し直して構わない(if not exists)。

alter table program_types
  add column if not exists student_part boolean not null default false,
  add column if not exists on_counselor_sheet boolean not null default false;

-- 確認: 2行返ればよい
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'program_types'
  and column_name in ('student_part', 'on_counselor_sheet');
