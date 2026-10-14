-- Reviews for The Open Archive.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Anyone can read reviews and post a new one; nobody can change or delete one
-- through the website. To remove a review, open Table Editor → reviews in the
-- Supabase dashboard and delete the row.

create table if not exists public.reviews (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  essay_id    text not null,
  name        text not null,
  rating      smallint not null,
  body        text not null,
  constraint reviews_name_length   check (char_length(btrim(name)) between 1 and 60),
  constraint reviews_body_length   check (char_length(btrim(body)) between 10 and 1500),
  constraint reviews_rating_range  check (rating between 1 and 5),
  constraint reviews_essay_known   check (essay_id in (
    'gojo-infinity', 'tale-of-two-infinities', 'a-paradox-that-isnt',
    'proof-for-the-unprovable', 'glitch-in-the-fourth-wall', 'secret-santa',
    'ai-is-unintelligent', 'prisoners-dilemma', 'lego-maths',
    'planet-of-fractal-geometry', 'patterns-in-nature', 'absolute-cinema-of-math'
  ))
);

-- When you add a new essay, add its id to the list above:
--   alter table public.reviews drop constraint reviews_essay_known;
--   alter table public.reviews add constraint reviews_essay_known check (essay_id in ( …all ids… ));

alter table public.reviews enable row level security;

drop policy if exists "Anyone can read reviews" on public.reviews;
create policy "Anyone can read reviews"
  on public.reviews for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can post a review" on public.reviews;
create policy "Anyone can post a review"
  on public.reviews for insert
  to anon, authenticated
  with check (true);

-- No update or delete policies: the website can't change or remove reviews.

create index if not exists reviews_created_at on public.reviews (created_at desc);
