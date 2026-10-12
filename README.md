# media-todoist

Personal watchlist: films, series and anime with posters, where each one streams in Ireland, and your own progress. Static site, no build step, no dependencies.

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
git add -A && git commit -m "add Frieren" && git push
```

**On the site**: the **Add** button looks the title up (AniList for anime, Wikipedia otherwise) and stores the entry in your browser. Use **Data → Export my additions** and paste the objects into `data/watchlist.json` to make them permanent. Pushing that file triggers the poster workflow.

**On github.com**: edit `data/watchlist.json` directly. The workflow fetches the poster and commits it.

## Posters

```sh
npm run posters                                        # entries without a poster
npm run posters:force                                  # redo all
node scripts/fetch-posters.mjs --id 95 --from https://…/poster.jpg   # set one by hand
```

Sources, in order: the entry's own Wikipedia or MyAnimeList link, AniList, TMDB, then a Wikipedia title search. TMDB is optional and only used when `TMDB_API_KEY` is set (locally in the shell, in Actions as a repository secret). It helps for films and series that have no Wikipedia page.

Posters are stored in `posters/<id>.jpg` and shrunk to 500px wide to keep the repo small.

## Data

`data/watchlist.json` is an array of entries:

| field | meaning |
| --- | --- |
| `id` | unique number, never reused |
| `title`, `noted_as` | canonical title, and what you originally wrote |
| `kind` | `Movie`, `TV series`, `Miniseries`, `Anime series`, `Anime movie`, `OVA/ONA`, `Other` |
| `year`, `episodes`, `seasons`, `runtime_min` | per episode for series |
| `release_status` | `Finished`, `Ongoing`, `Upcoming`, `Unknown` |
| `genres`, `synopsis` | |
| `content` | `none`, `ecchi`, `adult` (the site can hide the last two) |
| `services`, `availability` | streaming services you subscribe to; `confirmed`, `reported` (news only) or `unknown` |
| `url` | Wikipedia, MyAnimeList or TMDB page |
| `match_confidence` | `low` marks a guess at which title was meant |
| `notes`, `probably_watched`, `noted_on` | |
| `poster`, `poster_source` | local path and where it came from |

Progress (status, priority, rating) is per browser in `localStorage`. **Data → Export my progress** downloads it; **Import** restores it elsewhere.

`archive/original-artifact.html` is the Claude artifact this started from.
