# media-todoist

Personal watchlist: films, series, anime, manga and books with posters, where each one streams in Ireland, and your own progress. Static site, no build step, no dependencies.

## Run it

```sh
npm start          # serves the folder at http://localhost:8080
```

Or open the GitHub Pages build, which updates on every push to `main`: https://mormoran.github.io/media-todoist/

Opening `index.html` as a file does not work because the browser blocks loading the JSON.

## Add something to watch

**From the terminal** (metadata and poster fetched automatically):

```sh
npm run add -- "Frieren"                              # anime: looked up on AniList
npm run add -- "Dune Part Two" --kind movie --year 2024
npm run add -- "Severance" --kind series --note "S2 out"
npm run add -- "Frieren" --pick 2                     # take the 2nd match instead
npm run add -- "Thing" --url https://en.wikipedia.org/wiki/Thing
npm run add -- "Thing" --manual                       # no lookup
npm run add -- "Alien: Earth" --kind series --tags "aliens,corporate" --genres "Sci-fi,Horror"
npm run add -- "Berserk" --kind manga                 # AniList manga, light novels, webtoons
npm run add -- "Dune" --kind book --author "Frank Herbert"   # Open Library
npm run add -- "Gantz" --date 2026-03-20 --note "from a reel"  # when you noted it
git add -A && git commit -m "add Frieren" && git push
```

**On the site**: sign in with Google, then the **Add** button looks the title up (AniList for anime and manga, Open Library for books, Wikipedia otherwise) and writes it to Firestore. Status, priority and rating save there too and sync live to every device you are signed in on. Signed out, the page shows the repo's `data/watchlist.json` read-only.

## Backend: Firebase

GitHub Pages serves static files only, so the data lives in a Firebase project (`media-todoist`) under the same Google account:

- **Auth**: Google sign-in, nothing else enabled.
- **Firestore**: one document per title at `users/{uid}/titles/{id}`, holding the same fields as `data/watchlist.json` plus `status`, `priority`, `rating`, `updated`. Existing posters point at `https://mormoran.github.io/media-todoist/posters/<id>.jpg`; titles added on the site keep the AniList or Wikipedia image URL.
- **Rules**: `firestore.rules` in this repo. Only the signed-in owner of a `users/{uid}` subtree can read or write it. Paste it into Firebase console → Firestore → Rules, or `firebase deploy --only firestore:rules`.
- **Seed**: after the first sign-in the page offers to import the repo list. **Data → Import new titles from the repo** later pulls in anything with an id Firestore does not have yet, so `npm run add` on this machine followed by a push and an Import still works. **Data → Export everything as JSON** downloads the Firestore copy in `watchlist.json` format for backup or to refresh the repo file.
- **Cost**: Spark plan, free. A page load reads one document per title; the SDK keeps a local cache so repeat loads read only changes.

The `firebaseConfig` block in `index.html` is public by design; the rules are what protect the data.

**On github.com**: edit `data/watchlist.json` directly. The workflow fetches the poster and commits it.

## Tags

`data/tags.json` holds the vocabulary: 20 genre categories and about 80 granular tags in six groups (setting, creatures, powers, isekai and co, people and plots, tone and origin). Each tag lists the AniList tag names it maps from, so anime added through the CLI or the site's lookup get tagged automatically. Films and series need tags by hand (`--tags` on the CLI, the Tags field on the site, or edit the JSON). Add a new tag by appending to `tags.json`; the site picks it up on reload.

## Posters

```sh
npm run posters                                        # entries without a poster
npm run posters:force                                  # redo all
node scripts/fetch-posters.mjs --id 95 --from https://…/poster.jpg   # set one by hand
```

Sources, in order: the entry's own Wikipedia or MyAnimeList link, AniList, TMDB, then a Wikipedia title search. Manga use AniList, books use Open Library covers. TMDB is optional and only used when `TMDB_API_KEY` is set (locally in the shell, in Actions as a repository secret). It helps for films and series that have no Wikipedia page.

Posters are stored in `posters/<id>.jpg` and shrunk to 500px wide to keep the repo small. If a title keeps getting the wrong poster, set its `"poster_source": "skip"` and it is left alone until you pass `--from`.

## Data

`data/watchlist.json` is an array of entries:

| field | meaning |
| --- | --- |
| `id` | unique number, never reused |
| `title`, `noted_as` | canonical title, and what you originally wrote |
| `kind` | `Movie`, `TV series`, `Miniseries`, `Anime series`, `Anime movie`, `OVA/ONA`, `Manga`, `Light novel`, `Book`, `Other` |
| `year`, `episodes`, `seasons`, `runtime_min` | per episode for series |
| `author`, `chapters`, `volumes`, `pages` | manga and books only |
| `release_status` | `Finished`, `Ongoing`, `Upcoming`, `Unknown` |
| `genres` | broad categories from `data/tags.json` (Sci-fi, Fantasy, Crime, ...) |
| `tags` | granular tags from `data/tags.json` (aliens, heist, medieval, isekai, cozy, ...). The site filters with AND, so picking "space" and "military" narrows to both. |
| `synopsis` | |
| `content` | `none`, `ecchi`, `adult` (the site can hide the last two) |
| `services`, `availability` | streaming services you subscribe to; `confirmed`, `reported` (news only) or `unknown` |
| `url` | Wikipedia, MyAnimeList or TMDB page |
| `match_confidence` | `low` marks a guess at which title was meant |
| `notes`, `probably_watched`, `noted_on` | |
| `poster`, `poster_source` | local path and where it came from |

Progress (status, priority, rating) lives in Firestore once you sign in. Anything rated in a browser before signing in is carried over by the first Import.

`archive/original-artifact.html` is the Claude artifact this started from.
