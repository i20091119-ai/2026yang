-- 백호장군 안이명: 숫자 베기 - 공용 점수판 테이블
-- Supabase 프로젝트의 SQL Editor 에서 그대로 실행하세요.

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  difficulty text        not null check (difficulty in ('uibyeong', 'jangsu', 'baekho')),
  score      integer     not null check (score >= 0 and score <= 100000),
  created_at timestamptz not null default now()
);

create index if not exists scores_difficulty_score_idx
  on public.scores (difficulty, score desc, created_at asc);

-- 익명(anon) 키로는 읽기와 추가만 가능. 수정/삭제 정책은 두지 않습니다.
alter table public.scores enable row level security;

drop policy if exists "scores_anon_select" on public.scores;
create policy "scores_anon_select"
  on public.scores for select
  to anon
  using (true);

drop policy if exists "scores_anon_insert" on public.scores;
create policy "scores_anon_insert"
  on public.scores for insert
  to anon
  with check (true);
