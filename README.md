# Books: a shelf of mathematical essays

A static website that shows a set of PDF essays as books on a shelf. Visitors can read them in the browser or download them.

```
public/
  index.html        shelf (home page)
  reader.html       PDF reader (PDF.js)
  css/              styles.css (shelf), reader.css
  js/               common.js (shared), app.js (shelf), reader.js (reader)
  data/books.json   the catalog: every book on the shelf is listed here
  books/*.pdf       the books themselves (shrunk for the web)
  images/*.jpg      the picture on each essay's card
  essays/<id>/      one page per essay (generated, see below)
  og/*.jpg          link-preview images (generated)
  data/site.json    site address, title and description
design/             the original UI mockups
render.yaml         Render deploy config
```

## Run locally

```bash
python -m http.server 8080 --directory public
```

Then open http://localhost:8080. Opening `index.html` by double-clicking won't work, because the page loads `data/books.json` over HTTP.

## Add or update a book

1. Put the PDF in `public/books/` (and a copy in `source-pdfs/`).
2. Add an entry to `public/data/books.json`:

```json
{
  "id": "my-essay",
  "title": "Full Title",
  "shortTitle": "Short Title",
  "author": "Author Name",
  "file": "books/my-essay.pdf",
  "pages": 8,
  "category": "Geometry",
  "glyph": "π r²",
  "colors": ["#1e4a52", "#2f7a7a"],
  "image": "images/my-essay.jpg",
  "description": "One or two sentences."
}
```

- `author` is the essay's real writer. It shows on the card, the essay page, citations and link previews. Set `"permission": true` for essays by other writers; the essay page then says "Published with the author's permission".
- `image` is the card picture, e.g. `"image": "images/my-essay.jpg"`. See "Card pictures" below.
- To add a new book, put its PDF in `source-pdfs/` as well and run `python scripts/build_pdfs.py <id>`. That shrinks it and sets `pages` for you.

## Essay pages, link previews and citations

Run this after changing `books.json` or `site.json`:

```bash
python scripts/build_pages.py
```

It writes a page for each essay at `essays/<id>/`, with a summary, the topics covered, related essays, and Read, Download, Cite and Share buttons. It also makes the 1200×630 images that appear when a link is shared on WhatsApp, Instagram, LinkedIn and so on.

**Once the site is online,** put its address in `public/data/site.json` as `"url"` (for example `https://your-site.onrender.com`) and run the script again. Link previews need the full web address. With the address set, the script also writes `sitemap.xml` and `robots.txt` for search engines.

The Cite button offers APA, MLA, Chicago, Harvard and BibTeX.

## About the author

The About page lives in `public/index.html`, in the section marked `<!-- ============ About ============ -->`. Edit the name, the introduction (`<p class="lead">`) and the cards below it directly.

## Card pictures

`python scripts/make_images.py` rebuilds `public/images/`. Six essays reuse a picture from inside the PDF. The other six get maths artwork generated in the site's colours. To use your own picture, save it as `public/images/<id>.jpg`, ideally 1200×845.

When you change CSS or JS, bump the `?v=10` tags in `index.html` and `reader.html` so phones load the new files instead of old cached copies.

## Making the PDFs smaller

The PDFs in `public/books/` are web copies of the untouched originals kept in `source-pdfs/`. Their images are downsampled to 150 dpi and their fonts are trimmed to the characters actually used.

- To change an essay, edit its file in `source-pdfs/`, then run:
  ```bash
  python scripts/build_pdfs.py
  ```
  To rebuild only some essays, add their ids: `python scripts/build_pdfs.py gojo-infinity`.
- The script also updates each essay's page count in `books.json`. It needs `pip install pymupdf`.

## Sound effects

Tapping a card plays a short tick, saving an essay plays a pop, and opening one plays a two-note ding. On phones you also feel a small vibration. The sounds are generated in the browser (`public/js/sfx.js`), so there are no audio files. The speaker button in the header turns them off.

## Background music

The Music button (on the shelf page and in the reader) plays soft music generated in the browser, so no audio file is needed. To use your own track instead, put it at `public/audio/background.mp3`. Make sure you have the rights to any music you upload. Browsers don't allow sound until the visitor clicks, so music starts when the visitor presses the button. If they left it on, it starts again on their first click on the next page.

## Deploy on Render

1. Push this folder to a GitHub (or GitLab) repo.
2. In Render, go to **New → Blueprint**, pick the repo, and apply. `render.yaml` creates a free static site that serves `public/`.
   - Without the Blueprint: **New → Static Site**, leave Build Command empty, and set Publish Directory to `public`.
3. Every push to the repo redeploys the site automatically.

## Reviews and visitor counts

The Reviews screen (`#reviews`) shows readers' reviews and how many people have visited.

**Reviews (Supabase, free):**
1. Create a project at supabase.com.
2. In the project, open SQL Editor → New query, paste `supabase/reviews.sql`, and run it.
3. In Project Settings → API, copy the Project URL and the `anon` `public` key into `public/data/site.json` under `"supabase"`.

Anyone can read and post reviews (1–5 stars, a name up to 60 characters, 10–1500 characters of text). Nobody can edit or delete them from the site. To remove one, open Table Editor → `reviews` in Supabase and delete the row. Until the settings are filled in, the page says reviews are coming soon.

**Visitor counts (GoatCounter):** in GoatCounter, open Settings and tick "Allow adding visitor counts on your website". The page then shows total visits and views per essay page.
