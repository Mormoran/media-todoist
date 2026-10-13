// Download a poster for every entry in data/watchlist.json that has none.
//   node scripts/fetch-posters.mjs            only entries without a poster
//   node scripts/fetch-posters.mjs --force    redo every entry
//   node scripts/fetch-posters.mjs --id 42    one entry
// Sources, in order: the entry's own Wikipedia or MyAnimeList link, AniList
// (anime), TMDB (if TMDB_API_KEY is set), then a Wikipedia title search.
import {
  loadList, saveList, sleep, isAnime,
  wikiTitleFromUrl, wikiSummary, wikiSearch,
  malIdFromUrl, anilistByMal, anilistSearch, anilistImage, malOgImage,
  tmdbSearch, downloadImage,
} from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyId = args.includes('--id') ? Number(args[args.indexOf('--id') + 1]) : null;
//   node scripts/fetch-posters.mjs --id 95 --from https://example.com/poster.jpg   use this exact image
const fromUrl = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
if (fromUrl && onlyId == null) { console.error('--from needs --id'); process.exit(1); }

async function candidates(e) {
  const out = [];
  if (fromUrl) return [{ source: 'manual', img: fromUrl }];
  // the site stores a remote URL in `poster` when it adds a title; download it
  if (/^https?:/.test(e.poster || '')) return [{ source: e.poster_source || 'url', img: e.poster }];
  const tryAdd = async (source, fn) => {
    try {
      const img = await fn();
      if (img) out.push({ source, img });
    } catch (err) {
      process.stdout.write(`    ${source}: ${err.message}\n`);
    }
  };

  const wikiTitle = wikiTitleFromUrl(e.url);
  const malId = malIdFromUrl(e.url);
  if (wikiTitle) await tryAdd('wikipedia', async () => (await wikiSummary(wikiTitle)).image);
  if (malId) {
    await tryAdd('anilist', async () => anilistImage(await anilistByMal(malId)));
    if (!out.length) await tryAdd('myanimelist', () => malOgImage(malId));
  }
  if (!out.length && isAnime(e.kind)) {
    await tryAdd('anilist-search', async () => anilistImage((await anilistSearch(e.title, 1))[0]));
  }
  if (!out.length && !isAnime(e.kind)) {
    await tryAdd('tmdb', async () => (await tmdbSearch(e.title, e.kind, e.year))[0]?.image);
  }
  // Title search on Wikipedia is only trusted for anime: for films and series
  // it returned the wrong poster most of the time. Set TMDB_API_KEY for those.
  if (!out.length && isAnime(e.kind)) {
    await tryAdd('wikipedia-search', async () => {
      const q = `${e.title} ${e.year || ''} anime`;
      const hits = await wikiSearch(q, 3);
      for (const h of hits) {
        const s = await wikiSummary(h.title);
        if (s.image) return s.image;
      }
      return null;
    });
  }
  return out;
}

const list = loadList();
let done = 0, failed = [];
for (const e of list) {
  if (onlyId != null && e.id !== onlyId) continue;
  if (e.poster_source === 'skip' && !fromUrl) continue; // set "poster_source": "skip" to stop retrying a title
  if (e.poster && !/^https?:/.test(e.poster) && !force) continue;
  process.stdout.write(`#${e.id} ${e.title}\n`);
  const c = await candidates(e);
  let ok = false;
  for (const { source, img } of c) {
    try {
      e.poster = await downloadImage(img, e.id);
      e.poster_source = source;
      process.stdout.write(`    ok  ${e.poster}  (${source})\n`);
      ok = true;
      break;
    } catch (err) {
      process.stdout.write(`    download failed: ${err.message}\n`);
    }
  }
  if (!ok) failed.push(`#${e.id} ${e.title}`);
  done++;
  saveList(list); // save as we go so a crash loses nothing
  await sleep(700); // be polite to the APIs
}
console.log(`\n${done} processed, ${failed.length} without a poster.`);
if (failed.length) console.log(failed.join('\n'));
