// Shared helpers for the watchlist scripts. Node 18+ only, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_FILE = path.join(ROOT, 'data', 'watchlist.json');
export const POSTER_DIR = path.join(ROOT, 'posters');
const UA = 'media-todoist/0.1 (+https://github.com/Mormoran/media-todoist)';

export function loadList() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
export function saveList(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2) + '\n');
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function request(url, opts = {}, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const headers = Object.assign({ 'user-agent': UA }, opts.headers || {});
    return await fetch(url, Object.assign({}, opts, { headers, signal: ctl.signal }));
  } finally {
    clearTimeout(t);
  }
}
async function json(url, opts) {
  const r = await request(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// ---------------------------------------------------------------- Wikipedia
export function wikiTitleFromUrl(url) {
  const m = /wikipedia\.org\/wiki\/([^#?]+)/.exec(url || '');
  return m ? decodeURIComponent(m[1]) : null;
}
export async function wikiSummary(title) {
  const j = await json(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  const img = j.originalimage?.source || j.thumbnail?.source || null;
  return {
    title: j.title,
    url: j.content_urls?.desktop?.page,
    description: j.description,
    extract: j.extract,
    image: img ? img.split('?')[0] : null,
  };
}
export async function wikiSearch(q, limit = 5) {
  const j = await json(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(q)}`);
  return (j.query?.search || []).map((s) => ({ title: s.title, snippet: s.snippet.replace(/<[^>]+>/g, '') }));
}

// ------------------------------------------------------------------ AniList
const ANILIST_FIELDS = `id idMal title { romaji english } coverImage { extraLarge large } seasonYear episodes duration status format genres tags { name rank } description(asHtml: false) siteUrl`;

// Map AniList genres and tags onto our own vocabulary (data/tags.json).
export const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tags.json'), 'utf8'));
export function mapAnilist(media) {
  const genres = VOCAB.categories.filter((c) => c.anilist.some((a) => (media.genres || []).includes(a))).map((c) => c.id);
  const names = (media.tags || []).filter((t) => t.rank == null || t.rank >= 40).map((t) => t.name);
  const tags = VOCAB.tags.filter((t) => t.anilist.some((a) => names.includes(a))).map((t) => t.id);
  if (!tags.includes('isekai') && /Isekai/.test(names.join(' '))) tags.push('isekai');
  return { genres, tags };
}
async function anilist(query, variables) {
  const j = await json('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (j.errors) throw new Error(j.errors.map((e) => e.message).join('; '));
  return j.data;
}
export function malIdFromUrl(url) {
  const m = /myanimelist\.net\/anime\/(\d+)/.exec(url || '');
  return m ? Number(m[1]) : null;
}
export async function anilistByMal(idMal) {
  const d = await anilist(`query($m:Int){ Media(idMal:$m, type:ANIME){ ${ANILIST_FIELDS} } }`, { m: idMal });
  return d.Media;
}
export async function anilistSearch(q, perPage = 5) {
  const d = await anilist(`query($q:String,$n:Int){ Page(perPage:$n){ media(search:$q, type:ANIME, sort:SEARCH_MATCH){ ${ANILIST_FIELDS} } } }`, { q, n: perPage });
  return d.Page.media;
}
export const anilistImage = (m) => m?.coverImage?.extraLarge || m?.coverImage?.large || null;

// -------------------------------------------------------------- MyAnimeList
export async function malOgImage(idMal) {
  const r = await request(`https://myanimelist.net/anime/${idMal}`, { headers: { accept: 'text/html' } });
  if (!r.ok) throw new Error(`${r.status} myanimelist ${idMal}`);
  const m = /property="og:image" content="([^"]+)"/.exec(await r.text());
  return m ? m[1] : null;
}

// --------------------------------------------------------------------- TMDB
// Optional. Set TMDB_API_KEY (v3 key) to get posters for films and series
// that have no Wikipedia page. https://www.themoviedb.org/settings/api
export const TMDB_KEY = process.env.TMDB_API_KEY || '';
export async function tmdbSearch(q, kind, year) {
  if (!TMDB_KEY) return [];
  const type = /series|Miniseries|TV/i.test(kind) ? 'tv' : 'movie';
  const yearParam = year ? (type === 'tv' ? `&first_air_date_year=${year}` : `&year=${year}`) : '';
  const j = await json(`https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}${yearParam}`);
  return (j.results || []).map((r) => ({
    id: r.id,
    type,
    title: r.title || r.name,
    year: Number((r.release_date || r.first_air_date || '').slice(0, 4)) || null,
    overview: r.overview,
    image: r.poster_path ? `https://image.tmdb.org/t/p/w780${r.poster_path}` : null,
    url: `https://www.themoviedb.org/${type}/${r.id}`,
  }));
}

// ----------------------------------------------------------------- download
export async function downloadImage(url, id) {
  const r = await request(url, { headers: { accept: 'image/*' } }, 30000);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const ct = r.headers.get('content-type') || '';
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw new Error(`tiny image from ${url}`);
  fs.mkdirSync(POSTER_DIR, { recursive: true });
  const file = path.join(POSTER_DIR, `${id}.${ext}`);
  fs.writeFileSync(file, buf);
  return `posters/${id}.${ext}`;
}

export const isAnime = (kind) => /anime|OVA|ONA/i.test(kind || '');
export const nextId = (list) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
export const today = () => new Date().toISOString().slice(0, 10);
