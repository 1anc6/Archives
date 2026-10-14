"""Build the essay pages, link-preview images and tags.

    python scripts/build_pages.py

Reads public/data/books.json and public/data/site.json and writes:
  public/essays/<id>/index.html   one page per essay (shareable link)
  public/og/*.jpg                 1200x630 images shown when a link is shared
  the <!-- og:start --> … <!-- og:end --> block in public/index.html
  public/sitemap.xml + robots.txt (only when site.json has a "url")

Re-run it after editing books.json or site.json. Set "url" in site.json once
the site is online so link previews use full web addresses.
"""
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
VERSION = "28"  # bump to make browsers fetch new CSS/JS

books = json.loads((PUBLIC / "data/books.json").read_text(encoding="utf-8"))
site = json.loads((PUBLIC / "data/site.json").read_text(encoding="utf-8"))
BASE = site.get("url", "").rstrip("/")
TITLE = site["title"]
AUTHOR = site["author"]
CURATOR = site.get("curator", AUTHOR)
EMAIL = site.get("email", "")
GOATCOUNTER = site.get("goatcounter", "").strip()  # e.g. "lance" -> lance.goatcounter.com
GISCUS = site.get("giscus", {})  # comments; only shown once repoId and categoryId are filled in


def stats_tag():
    """GoatCounter visitor stats (no cookies). Empty until site.json has a code."""
    if not GOATCOUNTER:
        return ""
    return f'<script data-goatcounter="https://{e(GOATCOUNTER)}.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>'
for i, b in enumerate(books, start=1):
    b["num"] = i

e = lambda s: html.escape(str(s), quote=True)


def absolute(path):
    """Full URL when the site address is known, otherwise a site-relative path."""
    return f"{BASE}/{path}" if BASE else f"/{path}"


# ---------------------------------------------------------------- preview images
FONTS = Path("C:/Windows/Fonts")


def font(name, size):
    try:
        return ImageFont.truetype(str(FONTS / name), size)
    except OSError:
        return ImageFont.load_default(size)


SERIF = lambda s: font("GeorgiaPro-Regular.ttf", s)
SERIF_I = lambda s: font("GeorgiaPro-Italic.ttf", s)
MONO = lambda s: font("consola.ttf", s)


def MATH(s):
    """Cambria Math (inside cambria.ttc) draws the essays' notation."""
    try:
        return ImageFont.truetype(str(FONTS / "cambria.ttc"), s, index=1)
    except OSError:
        return SERIF_I(s)


# The site's light "notebook" palette
PAPER, BG, INK, MUTED, HI, LINE = (247, 243, 237), (238, 233, 227), (84, 76, 64), (101, 92, 80), (164, 85, 63), (215, 206, 194)
GRID = (231, 224, 214)
MARGIN_X = 92


def wrap(draw, text, fnt, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        test = f"{line} {w}".strip()
        if draw.textlength(test, font=fnt) <= width:
            line = test
        else:
            lines.append(line)
            line = w
    lines.append(line)
    return lines


def cover_fit(img, w, h):
    r = w / h
    iw, ih = img.size
    if iw / ih > r:
        nw = int(ih * r)
        img = img.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = int(iw / r)
        img = img.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    return img.resize((w, h), Image.LANCZOS)


def framed(photo, w, h, border=12, radius=16, angle=0):
    """Photo in a light frame with a soft shadow, like the featured essay on the site."""
    card = Image.new("RGBA", (w + 2 * border, h + 2 * border), (0, 0, 0, 0))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *card.size), radius=radius, fill=255)
    card.paste(Image.new("RGBA", card.size, (*PAPER, 255)), (0, 0), mask)
    inner = Image.new("L", (w, h), 0)
    ImageDraw.Draw(inner).rounded_rectangle((0, 0, w, h), radius=radius - 6, fill=255)
    card.paste(cover_fit(photo, w, h), (border, border), inner)
    pad = 60
    out = Image.new("RGBA", (card.width + 2 * pad, card.height + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(out).rounded_rectangle((pad, pad + 16, pad + card.width, pad + 16 + card.height), radius=radius, fill=(84, 66, 43, 70))
    out = out.filter(ImageFilter.GaussianBlur(16))
    out.alpha_composite(card, (pad, pad))
    return out.rotate(angle, resample=Image.BICUBIC, expand=True) if angle else out


def base_canvas():
    """Squared notebook paper with a terracotta margin rule."""
    img = Image.new("RGBA", (1200, 630), (*PAPER, 255))
    d = ImageDraw.Draw(img)
    for x in range(0, 1200, 30):
        d.line((x, 0, x, 630), fill=GRID, width=1)
    for y in range(0, 630, 30):
        d.line((0, y, 1200, y), fill=GRID, width=1)
    d.line((MARGIN_X, 0, MARGIN_X, 630), fill=(214, 168, 150), width=2)
    return img


def draw_glyph(d, xy, glyph, size, fill=HI):
    """Notation with superscripts/subscripts drawn small and raised/lowered."""
    sup, sub = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻", "₀₁₂₃₄₅₆₇₈₉"
    plain = "0123456789n+-"
    x, y = xy
    big, small = MATH(size), MATH(int(size * .6))
    for ch in glyph:
        if ch in sup:
            c = plain[sup.index(ch)]
            d.text((x, y - size * .02), c, font=small, fill=fill)
            x += d.textlength(c, font=small)
        elif ch in sub:
            c = plain[sub.index(ch)]
            d.text((x, y + size * .42), c, font=small, fill=fill)
            x += d.textlength(c, font=small)
        else:
            d.text((x, y), ch, font=big, fill=fill)
            x += d.textlength(ch, font=big)


def og_essay(b):
    img = base_canvas()
    photo = Image.open(PUBLIC / b["image"]).convert("RGB")
    card = framed(photo, 400, 282, angle=-2.5)
    img.alpha_composite(card, (1200 - card.width + 20, (630 - card.height) // 2 + 6))
    d = ImageDraw.Draw(img)
    x, w = MARGIN_X + 44, 560
    draw_glyph(d, (x, 52), b["glyph"], 58)
    y = 150
    title = b["shortTitle"]
    size = 70 if len(title) < 24 else 60
    for line in wrap(d, title, SERIF(size), w)[:3]:
        d.text((x, y), line, font=SERIF(size), fill=INK)
        y += int(size * 1.08)
    y += 12
    if b["title"] != b["shortTitle"]:
        for line in wrap(d, b["title"], SERIF_I(26), w)[:2]:
            d.text((x, y), line, font=SERIF_I(26), fill=MUTED)
            y += 34
    d.text((x, 512), f"No. {b['num']:02d}  ·  {b['category']}  ·  {b['pages']} pages", font=MONO(22), fill=MUTED)
    d.text((x, 550), f"By {b['author']}  ·  {TITLE}", font=SERIF(24), fill=INK)
    out = PUBLIC / "og" / f"{b['id']}.jpg"
    img.convert("RGB").save(out, quality=86, optimize=True, progressive=True)


def og_home():
    img = base_canvas()
    picks = [books[0], books[5], books[8]]
    spots = [(800, 20, 3), (880, 230, -4), (730, 340, 2)]
    for b, (px, py, a) in zip(picks, spots):
        photo = Image.open(PUBLIC / b["image"]).convert("RGB")
        img.alpha_composite(framed(photo, 270, 190, border=9, radius=14, angle=a), (px, py))
    d = ImageDraw.Draw(img)
    x = MARGIN_X + 44
    draw_glyph(d, (x, 60), "Σ ½ⁿ", 54)
    y = 150
    for line in ["The Open", "Archive"]:
        d.text((x, y), line, font=SERIF(68), fill=INK)
        y += 76
    y += 20
    for line in wrap(d, "Mathematical essays about infinity, proof, probability and patterns, to read online.", SERIF_I(28), 520):
        d.text((x, y), line, font=SERIF_I(28), fill=MUTED)
        y += 38
    d.text((x, 550), f"By {AUTHOR}  ·  {len(books)} essays", font=MONO(22), fill=MUTED)
    img.convert("RGB").save(PUBLIC / "og" / "home.jpg", quality=86, optimize=True, progressive=True)


# ---------------------------------------------------------------- page parts
def og_tags(title, desc, path, image, kind="website"):
    tags = []
    if BASE:
        tags.append(f'<link rel="canonical" href="{e(absolute(path))}">')
        tags.append(f'<meta property="og:url" content="{e(absolute(path))}">')
    tags += [
        f'<meta property="og:type" content="{kind}">',
        f'<meta property="og:site_name" content="{e(TITLE)}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:image" content="{e(absolute(image))}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{e(title)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{e(title)}">',
        f'<meta name="twitter:description" content="{e(desc)}">',
        f'<meta name="twitter:image" content="{e(absolute(image))}">',
    ]
    return "\n  ".join(tags)


def head(title, desc, prefix, og, author=None):
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#eee9e3">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <meta name="author" content="{e(author or AUTHOR)}">
  <!-- og:start -->
  {og}
  <!-- og:end -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23544c40'/><path d='M8 10c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z' fill='none' stroke='%23f7f3ed' stroke-width='1.6'/></svg>">
  <script>
    try {{
      const t = localStorage.getItem("books.theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.dataset.theme = t;
    }} catch (e) {{}}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=STIX+Two+Text:ital@0;1&family=Noto+Sans+Math&display=swap" rel="stylesheet">
  <link rel="alternate" type="application/rss+xml" title="{e(TITLE)}" href="{prefix}feed.xml">
  <link rel="stylesheet" href="{prefix}css/styles.css?v={VERSION}">
  {stats_tag()}
</head>"""


def header(prefix, active):
    def item(label, href, key, arrow=False):
        cls = ' class="active" aria-current="page"' if key == active else ""
        tail = '<span aria-hidden="true">↗</span>' if arrow else ""
        return f'<a href="{href}"{cls}>{label}{tail}</a>'

    return f"""
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="stage">
    <header class="site-header">
      <a class="brand" href="{prefix}" aria-label="The Open Archive, home">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 8c4-1.6 8-1.4 12 1.4C20 6.6 24 6.4 28 8v17c-4-1.6-8-1.4-12 1.4C12 23.6 8 23.4 4 25z"/><path d="M16 9.4v17"/><path d="M8 13c1.8-.5 3.6-.4 5 .4M8 17c1.8-.5 3.6-.4 5 .4M19 13.4c1.4-.8 3.2-.9 5-.4"/></svg>
        <span><strong>THE OPEN</strong><small>ARCHIVE</small></span>
      </a>
      <nav class="main-nav" aria-label="Main navigation">
        {item("Essays", prefix, "essays")}
        {item("Library", prefix + "#room", "room")}
        {item("Reviews", prefix + "#reviews", "reviews")}
        {item("About", prefix + "#about", "about")}
      </nav>
      <span class="acts">
        <button class="ib music-btn" data-music aria-pressed="false" aria-label="Background music" title="Music">
          <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        </button>
        <button class="ib" id="sfxBtn" aria-label="Sound effects" aria-pressed="true" title="Sound effects on">
          <svg class="ic-sound" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5a4 4 0 0 1 0 5"/></svg>
          <svg class="ic-mute" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="m17 10 4 4m0-4-4 4"/></svg>
        </button>
        <button class="ib" id="shareBtn" aria-label="Share" title="Share">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
        </button>
        <button class="ib" id="themeBtn" aria-label="Toggle theme" title="Toggle theme">
          <svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>
        </button>
      </span>
    </header>"""


def footer(prefix, scripts):
    tags = "\n".join(f'  <script src="{prefix}js/{s}?v={VERSION}"></script>' for s in ["common.js", "sfx.js", "site.js", *scripts, "request.js", "music.js"])
    return f"""
    <footer class="site-footer">
      <span>© 2026 {e(AUTHOR)} · {e(TITLE)}</span>
      <a href="{prefix}#about">About the author</a>
    </footer>
    <div class="toast" id="toast" role="status" hidden></div>
  </div>
{tags}
</body>
</html>
"""


def photo(b, prefix, eager=False, name=False, sizes="(max-width: 650px) 80vw, 420px"):
    """Card picture: small copy for phones, full size for large screens, blurred
    placeholder while loading, and an optional view-transition name."""
    small = b["image"].replace(".jpg", "-640.jpg")
    style = f"background-image:url({b['placeholder']})" if b.get("placeholder") else ""
    if name:
        style += f";view-transition-name:ph-{b['id']}"
    return (f'<span class="photo" style="{style}"><img src="{prefix}{e(small)}" '
            f'srcset="{prefix}{e(small)} 640w, {prefix}{e(b["image"])} 1200w" sizes="{sizes}" '
            f'alt="{e(b.get("imageAlt", ""))}" loading="{"eager" if eager else "lazy"}" decoding="async" '
            f'onload="this.classList.add(\'loaded\')"></span>')


# ---------------------------------------------------------------- essay pages
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def permission_note(b):
    if not b.get("permission"):
        return ""
    return f'<p class="permission-note">Published with the author\'s permission · curated by {e(CURATOR)}</p>'


def added_line(b):
    if not b.get("added"):
        return ""
    y, m, d = map(int, b["added"].split("-"))
    return f' · Added {d} {MONTHS[m - 1]} {y}<span class="new-badge" data-added="{b["added"]}" hidden>NEW</span>'


def excerpt(b):
    if not b.get("excerpt"):
        return ""
    x = b["excerpt"]
    return (f'\n          <blockquote class="excerpt"><p>{e(x["text"])}</p>'
            f'<footer>From page {x["page"]}</footer></blockquote>')


def notation(glyph):
    """Essay symbol as HTML: superscript/subscript characters become <sup>/<sub>
    so the math font draws them (no font has e.g. a superscript n in italic)."""
    sup, sub, plain = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻", "₀₁₂₃₄₅₆₇₈₉", "0123456789n+-"
    out = ""
    for ch in glyph:
        if ch in sup:
            out += f"<sup>{plain[sup.index(ch)]}</sup>"
        elif ch in sub:
            out += f"<sub>{plain[sub.index(ch)]}</sub>"
        else:
            out += e(ch)
    return out.replace("</sup><sup>", "").replace("</sub><sub>", "")


def comments(b):
    """Comments stored in the GitHub repository's Discussions, via giscus.
    Hidden until site.json has giscus.repoId and giscus.categoryId."""
    g = GISCUS
    if not (g.get("repo") and g.get("repoId") and g.get("categoryId")):
        return ""
    attrs = {
        "src": "https://giscus.app/client.js", "data-repo": g["repo"], "data-repo-id": g["repoId"],
        "data-category": g.get("category", "Comments"), "data-category-id": g["categoryId"],
        "data-mapping": "specific", "data-term": b["id"], "data-strict": "1",
        "data-reactions-enabled": "1", "data-emit-metadata": "0", "data-input-position": "top",
        "data-theme": "preferred_color_scheme", "data-lang": "en", "data-loading": "lazy",
        "crossorigin": "anonymous",
    }
    tag = " ".join(f'{k}="{e(v)}"' for k, v in attrs.items())
    return f"""    <section class="page-wrap essay-section comments" aria-labelledby="commentsTitle">
      <div class="section-heading plain"><h2 id="commentsTitle">Comments</h2><span class="section-note">Sign in with GitHub to join in</span></div>
      <script {tag} async></script>
    </section>"""


def related(b):
    same = [x for x in books if x["category"] == b["category"] and x["id"] != b["id"]]
    others = [x for x in books[b["num"]:] + books[: b["num"] - 1] if x not in same and x["id"] != b["id"]]
    return (same + others)[:3]


def essay_page(b):
    prefix = "../../"
    minutes = b["pages"] * 2
    title = f"{b['title']} · {AUTHOR}"
    og = og_tags(b["title"], b["description"], f"essays/{b['id']}/", f"og/{b['id']}.jpg", kind="article")
    ld = {
        "@context": "https://schema.org",
        "@type": "ScholarlyArticle",
        "headline": b["title"],
        "author": {"@type": "Person", "name": b["author"]},
        "datePublished": str(b.get("year", "")),
        "description": b["description"],
        "about": b["topics"],
        "isPartOf": {"@type": "CreativeWorkSeries", "name": TITLE, "author": {"@type": "Person", "name": AUTHOR}},
        "image": absolute(b["image"]),
        "encoding": {"@type": "MediaObject", "encodingFormat": "application/pdf", "contentUrl": absolute(b["file"])},
    }
    if BASE:
        ld["url"] = absolute(f"essays/{b['id']}/")
    data = {k: b[k] for k in ("id", "title", "author", "year")}
    topics = "\n".join(
        f'          <li style="--i:{i}"><a href="{prefix}reader.html?id={b["id"]}&amp;page={sec["page"]}">'
        f'<span class="n">{i + 1:02d}</span><span class="t">{e(sec["title"])}</span><span class="p">p. {sec["page"]}</span></a></li>'
        for i, sec in enumerate(b.get("sections", [])))
    rel = "\n".join(
        f"""          <a class="related-card" href="../{x['id']}/" style="--i:{i}">
            {photo(x, prefix, name=True)}
            <span class="meta"><span>{e(x['category'])}</span><span class="num">{x['num']:02d}</span></span>
            <span class="related-name">{e(x['shortTitle'])}</span>
          </a>"""
        for i, x in enumerate(related(b))
    )
    return f"""{head(title, b['description'], prefix, og, author=b['author'])}
<body>
{header(prefix, "essays")}
    <main class="page-wrap essay-page" id="content" tabindex="-1">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="{prefix}">Essays</a><span>/</span><span>{e(b['category'])}</span><span>/</span><span>No. {b['num']:02d}</span></nav>

      <article class="essay-hero">
        <div class="essay-copy">
          <h1>{e(b['title'])}</h1>
          <p class="byline">By {e(b['author'])} · {b.get('year', '')}{added_line(b)}</p>
          {permission_note(b)}
          <p class="summary">{e(b['description'])}</p>{excerpt(b)}
          <div class="hero-numbers left">
            <span><b>{b['pages']}</b><small>pages</small></span>
            <span><b>~{minutes}</b><small>min read</small></span>
            <span><b>PDF</b><small>format</small></span>
          </div>
          <div class="essay-actions">
            <a class="btn primary" data-read href="{prefix}reader.html?id={b['id']}">Read essay<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
            <a class="btn ghost" href="{prefix}{e(b['file'])}" download data-title="{e(b['title'])}">Request PDF</a>
            <button class="btn ghost" data-cite>Cite</button>
            <button class="btn ghost" data-share>Share</button>
          </div>
          <p class="progress-note" id="progressNote" hidden></p>
        </div>
        <figure class="essay-sheet">
          <span class="sheet-glyph" aria-hidden="true">{notation(b["glyph"])}</span>
          <span class="sheet-photo">{photo(b, prefix, eager=True, name=True, sizes="(max-width: 1000px) 50vw, 280px")}</span>
        </figure>
      </article>

      <section class="essay-section">
        <div class="section-heading plain"><h2>Inside this essay</h2><span class="section-note">Open any section in the reader</span></div>
        <ol class="topic-list toc-links">
{topics}
        </ol>
      </section>

      <section class="essay-section essay-reviews" id="essayReviews" data-essay-id="{b['id']}" aria-labelledby="reviewsTitle" hidden>
        <div class="section-heading plain"><h2 id="reviewsTitle">Reviews</h2><a class="link small" href="{prefix}#reviews">All reviews</a></div>
        <p class="er-sum" id="erSum"></p>
        <ul class="rev-list" id="erList"></ul>
        <div class="er-actions">
          <button class="btn primary" type="button" data-write-review="{b['id']}">Write a review</button>
          <a class="btn ghost" id="erAll" href="{prefix}#reviews" hidden>See all reviews</a>
        </div>
      </section>

      <section class="essay-section">
        <div class="section-heading plain"><h2>Further reading</h2><a class="link small" href="{prefix}">All essays</a></div>
        <div class="related-grid">
{rel}
        </div>
      </section>
    </main>
{comments(b)}
    <script type="application/json" id="essayData">{json.dumps(data, ensure_ascii=False)}</script>
    <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{footer(prefix, ["reviews.js"])}"""


# ---------------------------------------------------------------- 404 page
def page_404():
    """Served by Render for any missing address, so every link is absolute."""
    prefix = "/"
    og = og_tags(f"Page not found · {TITLE}", site["description"], "", "og/home.jpg")
    return f"""{head(f"Page not found · {TITLE}", site["description"], prefix, og)}
<body>
{header(prefix, "")}
    <main class="page-wrap lost" id="content" tabindex="-1">
      <p class="lost-glyph" aria-hidden="true">∞</p>
      <h1>This page wandered off to infinity</h1>
      <p class="lost-lead">Like Zeno's runner, you got halfway there… and then halfway again. The address might be mistyped, or the page has moved. Happens to the best of us lol.</p>
      <div class="lost-actions">
        <a class="btn primary" href="/">Back to the essays<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
        <a class="btn ghost" id="lostRandom" href="/essays/{books[0]['id']}/">Take me to a random essay</a>
      </div>
    </main>
    <script>
      (function () {{
        var ids = {json.dumps([b["id"] for b in books])};
        document.getElementById("lostRandom").href = "/essays/" + ids[Math.floor(Math.random() * ids.length)] + "/";
      }})();
    </script>
{footer(prefix, [])}"""


# ---------------------------------------------------------------- RSS feed
def feed_xml():
    """RSS 2.0 feed of every essay, newest first, for feed readers."""
    from email.utils import format_datetime
    from datetime import datetime, timezone

    def date(b):
        y, m, d = map(int, (b.get("added") or f"{b.get('year', 2026)}-01-01").split("-"))
        return datetime(y, m, d, 9, 0, tzinfo=timezone.utc)

    items = []
    for b in sorted(books, key=lambda x: (date(x), -x["num"]), reverse=True):
        link = absolute(f"essays/{b['id']}/")
        text = b["description"] + (f" “{b['excerpt']['text']}”" if b.get("excerpt") else "")
        items.append(f"""    <item>
      <title>{e(b['title'])}</title>
      <link>{e(link)}</link>
      <guid isPermaLink="true">{e(link)}</guid>
      <description>{e(text)}</description>
      <category>{e(b['category'])}</category>
      <pubDate>{format_datetime(date(b))}</pubDate>
    </item>""")
    newest = max(date(b) for b in books)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{e(TITLE)}</title>
    <link>{e(absolute(''))}</link>
    <atom:link href="{e(absolute('feed.xml'))}" rel="self" type="application/rss+xml"/>
    <description>{e(site['description'])}</description>
    <language>en</language>
    <lastBuildDate>{format_datetime(newest)}</lastBuildDate>
{chr(10).join(items)}
  </channel>
</rss>
"""


def replace_stats_block(path):
    """Keep the visitor-stats tag in the hand-written pages in step with site.json."""
    s = path.read_text(encoding="utf-8")
    start, end = s.index("<!-- stats:start -->"), s.index("<!-- stats:end -->")
    tag = stats_tag()
    s = s[: start + len("<!-- stats:start -->")] + (f"\n  {tag}\n  " if tag else "") + s[end:]
    path.write_text(s, encoding="utf-8")


# ---------------------------------------------------------------- write everything
def replace_og_block(path, block):
    s = path.read_text(encoding="utf-8")
    start, end = s.index("<!-- og:start -->"), s.index("<!-- og:end -->")
    s = s[: start + len("<!-- og:start -->")] + "\n  " + block + "\n  " + s[end:]
    path.write_text(s, encoding="utf-8")


def make_variants():
    """640px copies for phones and a tiny blurred placeholder for every card picture."""
    import base64, io
    for b in books:
        src = PUBLIC / b["image"]
        img = Image.open(src).convert("RGB")
        small = PUBLIC / b["image"].replace(".jpg", "-640.jpg")
        img.resize((640, round(640 * img.height / img.width)), Image.LANCZOS).save(small, quality=78, optimize=True, progressive=True)
        tiny = img.resize((24, round(24 * img.height / img.width)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1))
        buf = io.BytesIO()
        tiny.save(buf, "JPEG", quality=60)
        b["placeholder"] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    data = json.loads((PUBLIC / "data/books.json").read_text(encoding="utf-8"))
    for d in data:
        d["placeholder"] = next(x["placeholder"] for x in books if x["id"] == d["id"])
    (PUBLIC / "data/books.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    make_variants()
    (PUBLIC / "og").mkdir(exist_ok=True)
    for b in books:
        og_essay(b)
        out = PUBLIC / "essays" / b["id"]
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(essay_page(b), encoding="utf-8")
        print(f"  essays/{b['id']}/")
    og_home()
    replace_og_block(PUBLIC / "index.html", og_tags(TITLE, site["description"], "", "og/home.jpg"))
    print("  index.html preview tags")
    for page in ("index.html", "reader.html"):
        replace_stats_block(PUBLIC / page)
    (PUBLIC / "404.html").write_text(page_404(), encoding="utf-8")
    (PUBLIC / "feed.xml").write_text(feed_xml(), encoding="utf-8")
    print("  404.html, feed.xml" + ("" if GOATCOUNTER else "  (visitor stats off: no goatcounter code in site.json)"))

    if BASE:
        urls = [""] + [f"essays/{b['id']}/" for b in books]
        xml = "\n".join(f"  <url><loc>{e(absolute(u))}</loc></url>" for u in urls)
        (PUBLIC / "sitemap.xml").write_text(
            f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{xml}\n</urlset>\n', encoding="utf-8")
        (PUBLIC / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {absolute('sitemap.xml')}\n", encoding="utf-8")
        print("  sitemap.xml, robots.txt")
    else:
        print('Note: "url" in public/data/site.json is empty, so preview images use relative links.\n'
              "      Set it once the site is online and run this script again.")


if __name__ == "__main__":
    main()
