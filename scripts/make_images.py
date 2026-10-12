"""Make the picture shown on each essay's card (public/images/<id>.jpg).

    python scripts/make_images.py

Essays that already contain a good picture reuse it (cropped from the
original PDF in source-pdfs/). The rest get a piece of generated maths
artwork that fits the topic, drawn in the site's warm palette.
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pymupdf
from matplotlib.patches import Circle, FancyBboxPatch, Rectangle
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "images"
SRC = ROOT / "source-pdfs"
W, H = 1200, 845  # 1.42 : 1, the card photo shape

INK = "#2c1810"
GOLD = "#daaa63"
CREAM = "#f6ead9"
PAPER = "#efe4d4"

pymupdf.TOOLS.mupdf_display_errors(False)

# Pictures taken from the essays themselves: n-th largest image in the PDF
FROM_PDF = {
    "gojo-infinity": 2,
    "lego-maths": 0,
    "planet-of-fractal-geometry": 0,
    "proof-for-the-unprovable": 3,
    "secret-santa": (0, 0.0, 0.52),  # top half only: ornaments, no title text
    "tale-of-two-infinities": 0,
}


def save(img: Image.Image, name: str):
    img = img.convert("RGB")
    # cover-crop to the card shape
    r = W / H
    w, h = img.size
    if w / h > r:
        nw = int(h * r)
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / r)
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    img = img.resize((W, H), Image.LANCZOS)
    img.save(OUT / f"{name}.jpg", quality=82, optimize=True, progressive=True)
    print(f"  {name}.jpg")


def from_pdf(name: str, spec):
    rank, y0, y1 = spec if isinstance(spec, tuple) else (spec, 0.0, 1.0)
    doc = pymupdf.open(SRC / f"{name}.pdf")
    best = {}  # xref -> (shown area, page, rect)
    for page in doc:
        for im in page.get_images(full=True):
            for r in page.get_image_rects(im[0]):
                if im[0] not in best or r.width * r.height > best[im[0]][0]:
                    best[im[0]] = (r.width * r.height, page.number, r)
    found = sorted(best.values(), key=lambda f: -f[0])
    _, pno, rect = found[rank]
    rect = pymupdf.Rect(rect.x0, rect.y0 + rect.height * y0, rect.x1, rect.y0 + rect.height * y1)
    pix = doc[pno].get_pixmap(clip=rect, dpi=220)
    save(Image.frombytes("RGB", (pix.width, pix.height), pix.samples), name)


def canvas(bg=PAPER):
    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    fig.patch.set_facecolor(bg)
    ax.set_facecolor(bg)
    return fig, ax


def finish(fig, name):
    tmp = OUT / f"_{name}.png"
    fig.savefig(tmp, dpi=100, facecolor=fig.get_facecolor())
    plt.close(fig)
    save(Image.open(tmp), name)
    tmp.unlink()


def serif():
    return {"family": "Georgia"}


# ---------- generated artwork ----------

def paradox():
    """0.999… = 1: each row gets closer to the line at 1."""
    fig, ax = canvas("#3a1d1a")
    ax.set_xlim(0, 1.0)
    ax.set_ylim(0, 1.0)
    x0, x1 = 0.10, 0.86
    rows = ["0.9", "0.99", "0.999", "0.9999"]
    shades = ["#7e5823", "#9c6f2c", "#c89545", GOLD]
    for i, (lab, c) in enumerate(zip(rows, shades)):
        y = 0.60 - i * 0.12
        frac = 1 - 10 ** -(i + 1)
        ax.add_patch(FancyBboxPatch((x0, y), (x1 - x0) * frac, 0.075, boxstyle="round,pad=0,rounding_size=0.012", color=c, lw=0))
        ax.text(x0 - 0.015, y + 0.037, lab, ha="right", va="center", color=CREAM, fontsize=17, **serif())
    ax.plot([x1, x1], [0.17, 0.72], color=CREAM, lw=1.5, ls=(0, (4, 4)))
    ax.text(x1, 0.12, "1", ha="center", color=CREAM, fontsize=26, **serif())
    ax.text(0.5, 0.80, "0.999… = 1", ha="center", color=GOLD, fontsize=60, **serif())
    ax.text(0.5, 0.04, "the gap shrinks by ten each time, until there is no gap at all", ha="center", color=CREAM, alpha=0.7, fontsize=15, style="italic", **serif())
    finish(fig, "a-paradox-that-isnt")


def glitch():
    """73 in an Ulam prime spiral."""
    fig, ax = canvas("#2a1d33")
    n = 29
    grid = np.zeros((n, n), dtype=int)
    x = y = n // 2
    dx, dy = 1, 0
    step, k = 1, 1
    pos = {}
    while k <= n * n:
        for _ in range(2):
            for _ in range(step):
                if 0 <= x < n and 0 <= y < n:
                    grid[y, x] = k
                    pos[k] = (x, y)
                k += 1
                x, y = x + dx, y + dy
            dx, dy = -dy, dx
        step += 1
    limit = n * n
    sieve = np.ones(limit + 1, bool)
    sieve[:2] = False
    for i in range(2, int(limit ** 0.5) + 1):
        if sieve[i]:
            sieve[i * i :: i] = False
    xs, ys = [], []
    for v, (px, py) in pos.items():
        if sieve[v]:
            xs.append(px)
            ys.append(py)
    ax.set_xlim(-10, n + 10)
    ax.set_ylim(-1, n)
    ax.scatter(xs, ys, s=70, color="#b48ccf", alpha=0.8, lw=0)
    for special in (73, 37, 21):
        px, py = pos[special]
        ax.add_patch(Circle((px, py), 0.9 if special == 73 else 0.6, color=GOLD if special == 73 else "#e8d2a6", lw=0, zorder=3))
    px, py = pos[73]
    ax.annotate("73", (px, py), xytext=(px - 9, py + 6), color=GOLD, fontsize=46, ha="center", **serif(),
                arrowprops=dict(arrowstyle="-", color=GOLD, lw=1.2))
    ax.text(n + 5, 3, "the 21st prime,\nmirror of 37", color=CREAM, alpha=0.75, fontsize=15, ha="center", style="italic", **serif())
    finish(fig, "glitch-in-the-fourth-wall")


def prisoners():
    """Payoff matrix as four tiles."""
    fig, ax = canvas("#2f2c28")
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 8.45)
    tiles = [
        (3.6, 4.2, "−1, −1", "#5e5a52"), (7.0, 4.2, "−3, 0", "#3e3b36"),
        (3.6, 0.9, "0, −3", "#3e3b36"), (7.0, 0.9, "−2, −2", GOLD),
    ]
    for x, y, txt, c in tiles:
        ax.add_patch(FancyBboxPatch((x, y), 3.1, 3.0, boxstyle="round,pad=0,rounding_size=0.25", color=c, lw=0))
        ax.text(x + 1.55, y + 1.5, txt, ha="center", va="center", fontsize=30, color=INK if c == GOLD else CREAM, **serif())
    ax.text(5.15, 7.55, "B stays silent", ha="center", color=CREAM, fontsize=16, alpha=0.8, **serif())
    ax.text(8.55, 7.55, "B betrays", ha="center", color=CREAM, fontsize=16, alpha=0.8, **serif())
    ax.text(3.2, 5.7, "A stays\nsilent", ha="right", va="center", color=CREAM, fontsize=16, alpha=0.8, **serif())
    ax.text(3.2, 2.4, "A\nbetrays", ha="right", va="center", color=CREAM, fontsize=16, alpha=0.8, **serif())
    ax.text(10.6, 2.4, "the Nash\nequilibrium", ha="left", va="center", color=GOLD, fontsize=14, style="italic", **serif())
    finish(fig, "prisoners-dilemma")


def turing():
    """Gray–Scott reaction–diffusion: the spots Turing predicted."""
    n = 220
    rng = np.random.default_rng(7)
    U = np.ones((n, n))
    V = np.zeros((n, n))
    for _ in range(26):
        cx, cy = rng.integers(10, n - 10, 2)
        U[cy - 4 : cy + 4, cx - 4 : cx + 4] = 0.5
        V[cy - 4 : cy + 4, cx - 4 : cx + 4] = 0.25
    Du, Dv, F, k = 0.16, 0.08, 0.035, 0.065

    def lap(Z):
        return np.roll(Z, 1, 0) + np.roll(Z, -1, 0) + np.roll(Z, 1, 1) + np.roll(Z, -1, 1) - 4 * Z

    for _ in range(9000):
        uvv = U * V * V
        U += Du * lap(U) - uvv + F * (1 - U)
        V += Dv * lap(V) + uvv - (F + k) * V
    from matplotlib.colors import LinearSegmentedColormap

    cmap = LinearSegmentedColormap.from_list("nature", ["#2a3a1d", "#4f6633", "#a7a85a", GOLD, "#f3dfb4"])
    fig, ax = canvas("#2a3a1d")
    tile = np.tile(V, (1, 2))[:, : int(n * W / H)]
    ax.imshow(tile, cmap=cmap, interpolation="bicubic", aspect="auto")
    finish(fig, "patterns-in-nature")


def music():
    """Harmonics on a stave: f, 2f, 3f … adding up to a violin tone."""
    fig, ax = canvas("#3b1528")
    t = np.linspace(0, 4 * np.pi, 1400)
    ax.set_xlim(0, 4 * np.pi)
    ax.set_ylim(-3.4, 3.4)
    for yy in np.linspace(-2.8, -1.6, 5):
        ax.plot(t, np.full_like(t, yy), color=CREAM, lw=0.6, alpha=0.18)
    cols = ["#f3dfb4", GOLD, "#c89545", "#b46a7a", "#8a3a62"]
    total = np.zeros_like(t)
    for h, c in zip(range(1, 6), cols):
        wave = np.sin(h * t) / h
        total += wave
        ax.plot(t, wave * 0.9 + 1.6 - h * 0.12, color=c, lw=1.6, alpha=0.75)
    ax.plot(t, total * 0.9 - 0.6, color=GOLD, lw=3)
    ax.text(0.4, 2.85, "f   2f   3f   4f   5f", color=CREAM, alpha=0.75, fontsize=17, style="italic", **serif())
    ax.text(4 * np.pi - 0.4, -3.05, "♪", color=GOLD, fontsize=58, ha="right")
    finish(fig, "absolute-cinema-of-math")


def ai():
    """Probability tree for three biased coins."""
    fig, ax = canvas("#1d3242")
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 8.45)

    def node(x, y, label, hi=False):
        ax.add_patch(Circle((x, y), 0.32, color=GOLD if hi else "#2f6280", ec=CREAM, lw=1, zorder=3))
        ax.text(x, y, label, ha="center", va="center", fontsize=12, color=INK if hi else CREAM, zorder=4, weight="bold")

    levels = [[(1.2, 4.2, "", "")]]
    for depth in range(3):
        nxt = []
        spread = 3.4 / (2 ** depth)
        for x, y, path, _ in levels[-1]:
            for side, lab in ((+1, "H"), (-1, "T")):
                nx, ny = x + 3.3, y + side * spread * 0.62
                p = path + lab
                ax.plot([x, nx], [y, ny], color=GOLD if p == "HHH"[: len(p)] else CREAM, lw=2.2 if p == "HHH"[: len(p)] else 1, alpha=0.95 if p == "HHH"[: len(p)] else 0.35)
                ax.text((x + nx) / 2, (y + ny) / 2 + 0.18, "⅓" if lab == "H" else "⅔", fontsize=11, color=CREAM, alpha=0.6, ha="center")
                nxt.append((nx, ny, p, lab))
        levels.append(nxt)
    for lvl in levels[1:]:
        for x, y, p, lab in lvl:
            node(x, y, lab, hi=(p == "HHH"[: len(p)]))
    node(1.2, 4.2, "•")
    ax.text(6.0, 7.9, "P(HHH | even number of tails)", ha="center", color=GOLD, fontsize=24, **serif())
    finish(fig, "ai-is-unintelligent")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, spec in FROM_PDF.items():
        from_pdf(name, spec)
    paradox()
    glitch()
    prisoners()
    turing()
    music()
    ai()


if __name__ == "__main__":
    main()
