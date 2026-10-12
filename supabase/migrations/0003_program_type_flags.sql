-- プログラム種別に2つの設定を足す。どちらも「課題番号が無いが、学生の割り当てに近い扱いをする
-- プログラム」のためのもの(課題の無い実演など)。
--
-- これまで「助言者コメントの+1分」と「どの帳票に載るか」は、どちらも課題番号(teaching_point_id)
-- の有無だけで決まっていた。課題が無くても司会者がひと言述べる部分が出てきたため、
-- 時間の上乗せだけを切り離せるようにする。帳票の振り分けは今までどおり課題番号で決まる。
--
-- 既存のテーブルへの列追加なので、権限(grant)の付け直しは不要。

alter table program_types
  -- 課題番号が無くても、終了時刻に1分を足す(司会者のコメントの分)
  add column if not exists adds_comment_minute boolean not null default false,
  -- 候補を選ぶときに、参考として「このプールでの担当日」も各候補に出す。
  -- 並び順や候補の絞り込みには影響しない(表示だけ)。
  -- 例: 課題の無い実演の種別に '実演' を入れると、課題ありの実演の予定を見ながら選べる
  add column if not exists reference_pool text;

-- 確認: 2列が増えていればよい
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'program_types'
  and column_name in ('adds_comment_minute', 'reference_pool');
