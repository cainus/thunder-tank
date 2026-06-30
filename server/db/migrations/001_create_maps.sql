create table if not exists maps (
  id text primary key,
  title text not null,
  author_label text not null,
  map_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_updated_at_idx on maps (updated_at desc);
