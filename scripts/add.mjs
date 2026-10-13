// Add something to the watchlist from the terminal.
//   node scripts/add.mjs "Frieren"                       anime? decided by the best match
//   node scripts/add.mjs "Dune Part Two" --kind movie --year 2024
//   node scripts/add.mjs "Severance" --kind series --note "recommended by Sam"
//   node scripts/add.mjs "Frieren" --pick 2                take the 2nd search result
//   node scripts/add.mjs "Some Title" --url https://en.wikipedia.org/wiki/Some_Title
//   node scripts/add.mjs "Thing" --manual                  no lookup, just add it
// Kinds: anime | movie | series (free text also allowed).
// Metadata and a poster come from AniList for anime, otherwise TMDB (if
// TMDB_API_KEY is set) or Wikipedia. The entry is appended to data/watchlist.json.
import {
  loadList, saveList, nextId, today, isAnime,
  wikiTitleFromUrl, wikiSummary, wikiSearch,
  anilistSearch, anilistImage, mapAnilist, tmdbSearch, downloadImage, TMDB_KEY, VOCAB,
} from './lib.mjs';

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const has = (name) => argv.includes(name);
//   --tags "aliens,space"   granular tags from data/tags.json (added to any AniList ones)
//   --genres "Sci-fi,Drama" categories from data/tags.json
const VALUE_FLAGS = ['--kind', '--year', '--note', '--pick', '--url', '--tags', '--genres'];
let title = null;
for (let i = 0; i < argv.length; i++) {
  if (VALUE_FLAGS.includes(argv[i])) { i++; continue; }
  if (argv[i].startsWith('--')) continue;
  title = argv[i]; break;
}
if (!title) {
  console.error('Usage: node scripts/add.mjs "Title" [--kind anime|movie|series] [--year 2024] [--note "..."] [--pick N] [--url ...] [--manual]');
  process.exit(1);
}
const kindArg = (flag('--kind') || '').toLowerCase();
const year = flag('--year') ? Number(flag('--year')) : null;
const pick = Number(flag('--pick', 1)) - 1;
const note = flag('--note', '');
const forceUrl = flag('--url');

const list = loadList();
const entry = {
  id: nextId(list),
  title,
  noted_as: title,
  kind: kindArg === 'anime' ? 'Anime series' : kindArg === 'movie' ? 'Movie' : kindArg === 'series' ? 'TV series' : kindArg ? kindArg : 'Unknown',
  year,
  episodes: null,
  seasons: null,
  runtime_min: null,
  release_status: 'Unknown',
  genres: [],
  tags: [],
  synopsis: '',
  content: 'none',
  services: [],
  availability: 'unknown',
  url: forceUrl || null,
  match_confidence: 'high',
  notes: note,
  probably_watched: false,
  noted_on: today(),
  poster: null,
  poster_source: null,
};

const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
let image = null, source = null;

if (has('--manual')) {
  console.log('Manual entry, no lookup.');
} else if (forceUrl && wikiTitleFromUrl(forceUrl)) {
  const s = await wikiSummary(wikiTitleFromUrl(forceUrl));
  entry.title = s.title; entry.synopsis = s.extract || ''; entry.url = s.url || forceUrl;
  image = s.image; source = 'wikipedia';
} else {
  const wantAnime = kindArg === 'anime' || (!kindArg && /anime|OVA|ONA/i.test(entry.kind));
  let matched = false;

  if (wantAnime || !kindArg) {
    const hits = await anilistSearch(title, 5);
    const q = title.toLowerCase();
    const near = (s) => s && (s.toLowerCase().includes(q) || q.includes(s.toLowerCase()));
    if (hits.length && (wantAnime || near(hits[0].title.romaji) || near(hits[0].title.english))) {
      console.log('AniList matches:');
      hits.forEach((h, i) => console.log(`  ${i + 1}. ${h.title.english || h.title.romaji} (${h.seasonYear || '?'}, ${h.format}, ${h.episodes || '?'} ep)`));
      const m = hits[pick] || hits[0];
      entry.title = m.title.english || m.title.romaji;
      entry.kind = m.format === 'MOVIE' ? 'Anime movie' : /OVA|ONA|SPECIAL/.test(m.format) ? 'OVA/ONA' : 'Anime series';
      entry.year = m.seasonYear || year;
      entry.episodes = m.episodes;
      entry.runtime_min = m.duration;
      entry.release_status = m.status === 'FINISHED' ? 'Finished' : m.status === 'RELEASING' ? 'Ongoing' : m.status === 'NOT_YET_RELEASED' ? 'Upcoming' : 'Unknown';
      const mapped = mapAnilist(m);
      entry.genres = mapped.genres; entry.tags = mapped.tags;
      entry.synopsis = stripHtml(m.description).slice(0, 600);
      entry.url = m.idMal ? `https://myanimelist.net/anime/${m.idMal}` : m.siteUrl;
      image = anilistImage(m); source = 'anilist'; matched = true;
    }
  }

  if (!matched && TMDB_KEY) {
    const hits = await tmdbSearch(title, kindArg === 'series' ? 'TV series' : 'Movie', year);
    if (hits.length) {
      console.log('TMDB matches:');
      hits.slice(0, 5).forEach((h, i) => console.log(`  ${i + 1}. ${h.title} (${h.year || '?'}, ${h.type})`));
      const m = hits[pick] || hits[0];
      entry.title = m.title; entry.year = m.year; entry.kind = m.type === 'tv' ? 'TV series' : 'Movie';
      entry.synopsis = m.overview || ''; entry.url = m.url;
      image = m.image; source = 'tmdb'; matched = true;
    }
  }

  if (!matched) {
    const q = `${title} ${year || ''} ${kindArg === 'series' ? 'TV series' : kindArg === 'movie' ? 'film' : ''}`.trim();
    const hits = await wikiSearch(q, 5);
    if (hits.length) {
      console.log('Wikipedia matches:');
      hits.forEach((h, i) => console.log(`  ${i + 1}. ${h.title}  -  ${h.snippet.slice(0, 80)}`));
      const m = hits[pick] || hits[0];
      const s = await wikiSummary(m.title);
      entry.title = s.title.replace(/ \((\d{4} )?(film|TV series|miniseries)\)$/i, '');
      entry.synopsis = s.extract || '';
      entry.url = s.url;
      const yr = /(\d{4})/.exec(s.description || '');
      if (!entry.year && yr) entry.year = Number(yr[1]);
      if (entry.kind === 'Unknown') entry.kind = /series/i.test(s.description || '') ? 'TV series' : /film/i.test(s.description || '') ? 'Movie' : 'Unknown';
      image = s.image; source = 'wikipedia'; matched = true;
    }
  }
  if (!matched) console.log('No match found anywhere. Added as a bare entry; edit data/watchlist.json by hand.');
}

const splitList = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
for (const t of splitList(flag('--tags'))) {
  if (!VOCAB.tags.some((v) => v.id === t)) { console.error(`Unknown tag "${t}". Known: ${VOCAB.tags.map((v) => v.id).join(', ')}`); process.exit(1); }
  if (!entry.tags.includes(t)) entry.tags.push(t);
}
for (const g of splitList(flag('--genres'))) {
  if (!VOCAB.categories.some((v) => v.id === g)) { console.error(`Unknown genre "${g}". Known: ${VOCAB.categories.map((v) => v.id).join(', ')}`); process.exit(1); }
  if (!entry.genres.includes(g)) entry.genres.push(g);
}

if (image) {
  try {
    entry.poster = await downloadImage(image, entry.id);
    entry.poster_source = source;
  } catch (err) {
    console.log(`Poster download failed: ${err.message}`);
  }
}

list.push(entry);
saveList(list);
console.log(`\nAdded #${entry.id}: ${entry.title} (${entry.kind}, ${entry.year || '?'})${entry.poster ? `  poster: ${entry.poster}` : '  no poster'}`);
console.log('Wrong match? Re-run with --pick N, or delete the entry and use --url / --manual.');
