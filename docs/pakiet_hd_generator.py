"""Generator pakietu HD dla "Za labiryntem".
Wszystkie tekstury kafelkują się w poziomie (ściany) albo w obu osiach (podłoga, niebo w poziomie).
Paleta: popiół, kość, przygaszona miedź, bursztyn tylko przy pieczęciach i runach.

Wspólna krawędź ścian: każda ściana (wall_a…d, rune, seal) ma te same rzędy kamieni (COURSES)
i pionową spoinę dokładnie na brzegu kafla. Dowolne dwie tekstury postawione obok siebie,
także w lustrze i w narożniku, stykają się spoiną, a poziome spoiny przechodzą dalej.
Zapis: WebP (mniejszy transfer); PNG tylko z flagą --png.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)
S = 512
# Wspólne rzędy kamieni dla wszystkich ścian. Granice: 0, 118, 254, 358, 512.
COURSES = [118, 136, 104, 154]
COURSE_EDGES = np.cumsum([0] + COURSES)
# Szerokość pasa przy brzegu, w którym znika falowanie spoin (krawędź ma być prosta).
EDGE_CALM = 44
WEBP_Q = int(os.environ.get("WEBP_Q", "86"))
USE_PNG = "--png" in sys.argv
if USE_PNG:
    sys.argv.remove("--png")


def fbm(h, w, beta=2.0, seed=0, lo=1.0):
    """Periodyczny szum 1/f^beta przez FFT (bez szwów)."""
    rng = np.random.default_rng(seed)
    wn = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / np.maximum(f, lo) ** (beta / 2 * 2) ** 0.5
    amp = 1.0 / np.maximum(f, lo) ** beta
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * amp))
    out -= out.min()
    out /= out.max() + 1e-9
    return out


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def shade(height, strength=6.0, light=(-0.45, 0.6, 0.66), wrap_y=False):
    """Normalne z mapy wysokości i wypalone światło z lewej góry."""
    mode_y = "wrap" if wrap_y else "nearest"
    gx = ndi.sobel(height, axis=1, mode="wrap")
    gy = ndi.sobel(height, axis=0, mode=mode_y if not wrap_y else "wrap")
    nx = -gx * strength
    ny = gy * strength  # obraz ma y w dół, światło ma y w górę
    nz = np.ones_like(height)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / n, ny / n, nz / n
    L = np.array(light, dtype=float)
    L /= np.linalg.norm(L)
    diff = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    return diff, ny


def ao(height, sigma=6, k=2.2, wrap_y=False):
    mode = ["wrap" if wrap_y else "nearest", "wrap"]
    blur = ndi.gaussian_filter(height, sigma, mode=mode)
    return np.clip(1 + (height - blur) * k, 0.35, 1.15)


def out_name(name):
    return name if USE_PNG else os.path.splitext(name)[0] + ".webp"


def write_img(img, name):
    path = os.path.join(OUT, out_name(name))
    if USE_PNG:
        img.save(path, optimize=True)
    else:
        img.save(path, "WEBP", quality=WEBP_Q, method=6, alpha_quality=100)
    return img


def save(name, rgb):
    img = Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8), "RGB")
    return write_img(img, name)


def edge_calm(xs):
    """0 na lewym i prawym brzegu kafla, 1 w środku. Wycisza falowanie przy styku."""
    e = np.minimum(xs, S - 1 - xs)
    return smooth(0, EDGE_CALM, e)


def crack_mask(h, w, n, rng, length=(60, 180), width=1.6, wrap=True):
    big = 2
    im = Image.new("L", (w * big, h * big), 0)
    d = ImageDraw.Draw(im)
    for _ in range(n):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        ang = rng.uniform(0, np.pi * 2)
        L = rng.uniform(*length)
        pts = [(x, y)]
        steps = int(L / 6)
        wd = width
        for s in range(steps):
            ang += rng.normal(0, 0.45)
            x += np.cos(ang) * 6
            y += np.sin(ang) * 6
            pts.append((x, y))
            if rng.random() < 0.08:  # odgałęzienie
                a2 = ang + rng.choice([-1, 1]) * rng.uniform(0.6, 1.2)
                bx, by = x, y
                br = [(bx, by)]
                for _ in range(rng.integers(3, 8)):
                    a2 += rng.normal(0, 0.4)
                    bx += np.cos(a2) * 5
                    by += np.sin(a2) * 5
                    br.append((bx, by))
                for ox in ([-w, 0, w] if wrap else [0]):
                    d.line([((px + ox) * big, py * big) for px, py in br], fill=150, width=max(1, int(wd * big * 0.6)))
        for ox in ([-w, 0, w] if wrap else [0]):
            for oy in ([-h, 0, h] if wrap else [0]):
                for i in range(len(pts) - 1):
                    t = 1 - i / len(pts)
                    d.line([((pts[i][0] + ox) * big, (pts[i][1] + oy) * big),
                            ((pts[i + 1][0] + ox) * big, (pts[i + 1][1] + oy) * big)],
                           fill=255, width=max(1, int(wd * big * (0.5 + t))))
    m = np.asarray(im.resize((w, h), Image.LANCZOS), dtype=float) / 255
    return m


# ---------------------------------------------------------------- ŚCIANY

STONES = np.array([
    [150, 138, 120],  # popiół
    [172, 157, 132],  # kość
    [154, 131, 104],  # piaskowiec przygaszony
    [146, 132, 114],  # szary ciepły
    [164, 140, 110],  # ciepła kość
], float)


def wall_layout(rng, rows_h, mortar=5.0, fixed=None):
    """Zwraca id bloku, odległość do krawędzi, ton bloku. Kafelkuje się w poziomie.
    Każdy rząd zaczyna się blokiem od x = 0, więc brzeg kafla jest zawsze spoiną.
    fixed = {indeks rzędu: [szerokości]} ustawia bloki ręcznie (np. fryz z glifami)."""
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    calm = edge_calm(xs)
    warp_x = (fbm(S, S, 2.2, rng.integers(1e6)) - 0.5) * 7 * calm
    warp_y = (fbm(S, S, 2.2, rng.integers(1e6)) - 0.5) * 7 * calm
    wx = (xs + warp_x) % S
    wy = np.clip(ys + warp_y, 0, S - 1)
    bid = np.zeros((S, S), int)
    dist = np.full((S, S), 99.0)
    tilt = np.zeros((S, S))
    y0 = 0
    nid = 0
    edges_y = np.cumsum([0] + rows_h)
    for r, rh in enumerate(rows_h):
        y0, y1 = edges_y[r], edges_y[r + 1]
        widths = []
        rem = S
        while rem > 0:
            wv = int(rng.uniform(120, 270))
            if rem - wv < 100:
                wv = rem
            widths.append(wv)
            rem -= wv
        rng.uniform(0, S)  # dawny losowy offset rzędu; zostaje, żeby nie przesuwać reszty losowania
        if fixed and r in fixed:
            widths = list(fixed[r])
        xe = np.cumsum([0] + widths).astype(float)
        rowmask = (wy >= y0) & (wy < y1)
        for i in range(len(widths)):
            a, b = xe[i], xe[i + 1]
            # pozycja względem bloku z zawinięciem
            rel = (wx - a) % S
            inb = rowmask & (rel < (b - a))
            dx = np.minimum(rel + 0.5, (b - a) - rel - 0.5)
            dy = np.minimum(wy - y0, y1 - wy)
            rc = rng.uniform(5, 22)
            corner = (dx < rc) & (dy < rc)
            d = np.where(corner, rc - np.hypot(rc - dx, rc - dy), np.minimum(dx, dy))
            dist = np.where(inb, d, dist)
            bid = np.where(inb, nid, bid)
            t = rng.uniform(-1, 1)
            # lekki przechył lica
            tilt = np.where(inb, t * (rel / (b - a) - 0.5) + rng.uniform(-0.5, 0.5), tilt)
            nid += 1
    return bid, dist, tilt, nid, edges_y


def stone_wall(seed, rust=0.0, cracks=4, dust=0.5, rows=None, extra=None, fixed=None):
    rng = np.random.default_rng(seed)
    if rows is None:
        rows = COURSES
    assert list(rows) == list(COURSES), "ściany muszą mieć wspólne rzędy, inaczej brzegi się nie zgrają"
    bid, dist, tilt, nb, edges_y = wall_layout(rng, rows, fixed=fixed)
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    mortar = 3.5
    fine = fbm(S, S, 1.15, seed + 1)
    mid = fbm(S, S, 1.8, seed + 2)
    big = fbm(S, S, 2.6, seed + 3)
    pits = fbm(S, S, 1.05, seed + 4)
    ero = fbm(S, S, 2.0, seed + 5)
    # warstwy osadu: poziome pasma zginane szumem
    strata_w = (fbm(S, S, 2.4, seed + 6) - 0.5) * 40
    strata = np.sin((ys + strata_w) * 0.16 + bid * 1.7)
    strata2 = np.sin((ys + strata_w * 1.3) * 0.045 + bid * 0.9)
    # erodowane, nierówne krawędzie
    bevel = 4 + 30 * ero ** 1.5
    face = smooth(mortar, mortar + bevel, dist) ** 0.7
    h = 0.18 + face * (0.7 + tilt * 0.03)
    h += (mid - 0.5) * 0.16 * face + (fine - 0.5) * 0.05
    h += strata * 0.018 * face + strata2 * 0.02 * face
    # wykruszenia przy krawędziach
    chip = smooth(0.58, 0.75, ero) * (1 - smooth(10, 30, dist))
    h -= chip * 0.25 * face
    # wżery, większe i rzadsze
    pm = smooth(0.66, 0.8, pits)
    h -= pm * 0.22 * face
    cm = ndi.gaussian_filter(crack_mask(S, S, cracks, rng, width=2.4, wrap=True), 0.7) * smooth(6, 14, dist)
    h -= cm * 0.28
    if extra is not None:
        h = extra(h, dist, rng)
    diff, ny = shade(h, 3.0)
    occ = ao(h, 7, 2.4)
    tone_idx = rng.integers(0, len(STONES), nb)
    tone_j = rng.uniform(0.88, 1.08, nb)
    base = STONES[tone_idx][bid] * tone_j[bid][..., None]
    base *= (0.84 + 0.26 * mid[..., None])
    base *= (0.92 + 0.16 * fine[..., None])
    base *= (0.9 + 0.16 * big[..., None])
    base *= (1 + 0.06 * strata[..., None] + 0.05 * strata2[..., None])
    mortar_col = np.array([86, 74, 60.0]) * (0.75 + 0.5 * fine[..., None])
    mmask = smooth(mortar + 3, mortar - 0.5, dist)[..., None]
    base = base * (1 - mmask) + mortar_col * mmask
    up = np.clip(ny, 0, 1)[..., None]
    sand = np.array([198, 178, 146.0])
    yy = ys[..., None] / S
    floor_dust = smooth(0.8, 1.0, yy) * (0.4 + 0.6 * big[..., None])
    dmask = np.clip(up * 1.4 * dust + floor_dust * dust * 0.8 + pm[..., None] * 0.06 * dust, 0, 0.7)
    base = base * (1 - dmask) + sand * dmask
    if rust > 0:
        streak = fbm(S // 8, S, 1.4, seed + 9)
        streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC), float) / 255
        src = smooth(0.55, 0.85, fbm(S, S, 2.8, seed + 10))
        fade = ndi.uniform_filter1d(src, 140, axis=0, mode="nearest", origin=-60)
        rm = np.clip(smooth(0.5, 0.8, streak) * fade * rust * 1.6, 0, 0.6)[..., None]
        rust_col = np.array([116, 74, 44.0]) * (0.8 + 0.4 * mid[..., None])
        base = base * (1 - rm) + rust_col * rm
    base *= (1 - cm[..., None] * 0.4)
    base *= (1 - pm[..., None] * 0.12)
    light = (0.66 + 0.42 * diff)[..., None] * occ[..., None]
    rgb = base * light
    return rgb, h


def glyph_mask(w, h, glyphs, rng, stroke=10, big=4):
    """Obce glify rysowane wektorowo, z wygładzeniem."""
    im = Image.new("L", (w * big, h * big), 0)
    d = ImageDraw.Draw(im)
    sw = stroke * big
    for cx, cy, size, kind in glyphs:
        cx *= big; cy *= big; r = size * big
        def L(a, b, c, e):
            d.line([(a, b), (c, e)], fill=255, width=sw)
            for p in ((a, b), (c, e)):
                d.ellipse([p[0] - sw / 2, p[1] - sw / 2, p[0] + sw / 2, p[1] + sw / 2], fill=255)
        def C(x, y, rr, start=0, end=360):
            d.arc([x - rr, y - rr, x + rr, y + rr], start, end, fill=255, width=sw)
        def D(x, y, rr):
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=255)
        if kind == 0:  # oko z promieniami
            C(cx, cy, r * 0.55)
            D(cx, cy, r * 0.14)
            for k in range(5):
                a = -np.pi / 2 + (k - 2) * 0.42
                L(cx + np.cos(a) * r * 0.7, cy + np.sin(a) * r * 0.7, cx + np.cos(a) * r, cy + np.sin(a) * r)
            L(cx, cy + r * 0.55, cx, cy + r)
        elif kind == 1:  # trzon z gałęziami
            L(cx, cy - r, cx, cy + r)
            for k, yy in enumerate((-0.6, -0.1, 0.4)):
                s = 1 if k % 2 == 0 else -1
                L(cx, cy + yy * r, cx + s * r * 0.6, cy + (yy - 0.3) * r)
            C(cx, cy + r * 0.85, r * 0.18)
        elif kind == 2:  # zagnieżdżone łuki (planeta i orbita)
            C(cx, cy, r * 0.75, 200, 520)
            C(cx, cy, r * 0.42, 20, 340)
            D(cx + r * 0.75, cy, r * 0.1)
            L(cx - r, cy + r * 0.95, cx + r, cy + r * 0.95)
        elif kind == 3:  # schody / romb
            pts = [(cx, cy - r), (cx + r * 0.7, cy), (cx, cy + r), (cx - r * 0.7, cy), (cx, cy - r)]
            for i in range(4):
                L(*pts[i], *pts[i + 1])
            L(cx - r * 0.3, cy, cx + r * 0.3, cy)
            D(cx, cy - r * 0.45, r * 0.08)
            D(cx, cy + r * 0.45, r * 0.08)
        elif kind == 4:  # trzy kropki i fala
            for k in range(3):
                D(cx - r * 0.5 + k * r * 0.5, cy - r * 0.6, r * 0.1)
            xs = np.linspace(-r, r, 40)
            pts = [(cx + x, cy + np.sin(x / r * np.pi * 1.5) * r * 0.25) for x in xs]
            d.line(pts, fill=255, width=sw, joint="curve")
            L(cx - r * 0.8, cy + r * 0.7, cx + r * 0.8, cy + r * 0.7)
        elif kind == 5:  # widły
            L(cx, cy + r, cx, cy - r * 0.1)
            C(cx, cy - r * 0.1, r * 0.55, 180, 360)
            L(cx - r * 0.55, cy - r * 0.1, cx - r * 0.55, cy - r * 0.6)
            L(cx + r * 0.55, cy - r * 0.1, cx + r * 0.55, cy - r * 0.6)
            D(cx, cy - r * 0.75, r * 0.1)
    m = np.asarray(im.resize((w, h), Image.LANCZOS), float) / 255
    return m


def rune_wall():
    rng = np.random.default_rng(77)
    # fryz z glifami to drugi wspólny rząd (118–254): trzy równe płyty, glif na środku każdej
    rows = COURSES
    band_cy = (COURSE_EDGES[1] + COURSE_EDGES[2]) / 2
    frieze = [171, 170, 171]
    centers = np.cumsum([0] + frieze)[:-1] + np.array(frieze) / 2
    kinds = [0, 1, 2, 3, 4, 5]
    rng.shuffle(kinds)
    glyphs = [(centers[i], band_cy - 2, 54, kinds[i]) for i in range(3)]
    gm = glyph_mask(S, S, glyphs, rng, stroke=11)
    # drugi, płytszy zestaw drobnych znaków w rzędzie niżej (254–358)
    small_cy = (COURSE_EDGES[2] + COURSE_EDGES[3]) / 2
    small = [(40 + i * 64, small_cy, 15, kinds[(i + 3) % 6]) for i in range(8)]
    sm = glyph_mask(S, S, small, rng, stroke=4)

    def extra(h, dist, rng_):
        h = h - ndi.gaussian_filter(gm, 1.2) * 0.32
        h = h - ndi.gaussian_filter(sm, 0.8) * 0.12
        return h

    rng2 = np.random.default_rng(78)
    rgb, h = stone_wall(78, rust=0.25, cracks=3, dust=0.45, rows=rows, extra=extra, fixed={1: frieze})
    # bursztynowa inkrustacja w głębi rowków, zwietrzała
    wear = fbm(S, S, 1.6, 81)
    inlay = np.clip(ndi.gaussian_filter(gm, 0.8) * 1.3, 0, 1) * smooth(0.32, 0.7, wear) * (0.6 + 0.4 * fbm(S, S, 1.1, 82))
    amber = np.array([196, 128, 54.0])
    glow = ndi.gaussian_filter(inlay, 3) * 0.35
    rgb = rgb * (1 - inlay[..., None] * 0.75) + amber * inlay[..., None] * 0.75
    rgb += amber * glow[..., None] * 0.18
    rgb = rgb * (1 - sm[..., None] * 0.25)
    return rgb


def seal_door():
    """Zapieczętowane przejście: płyta z bazaltu w kamiennej ramie, miedziany pierścień, bursztynowy rdzeń."""
    rng = np.random.default_rng(301)
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    fine = fbm(S, S, 1.2, 302)
    mid = fbm(S, S, 1.9, 303)
    big = fbm(S, S, 2.7, 304)
    # rama: słupy po bokach i nadproże
    frame = (xs < 62) | (xs > S - 62) | (ys < 56)
    dx_f = np.minimum(np.abs(xs - 62), np.abs(xs - (S - 62)))
    in_slab = ~frame
    # nadproże i słupy jako bloki
    h = np.where(frame, 0.85, 0.55)
    edge = np.minimum(np.where(in_slab, np.minimum(np.abs(xs - 62), np.abs(xs - (S - 62))), 99), np.where(in_slab, ys - 56, 99))
    h = h - np.where(in_slab, (1 - smooth(0, 12, edge)) * 0.15, 0)
    # spoiny w ramie: te same poziome spoiny co w ścianach i pionowa spoina na brzegu kafla
    course_line = np.zeros((S, S), bool)
    for e in COURSE_EDGES:
        course_line |= np.abs(ys + 0.5 - e) < 3.5
    pillar = frame & ((xs < 62) | (xs > S - 62))
    outer = (xs < 3.5) | (xs > S - 4.5)
    lintel_joints = (ys < 56) & (xs >= 62) & (xs <= S - 62) & ((((xs + 40) % 170) < 4) | (np.abs(ys - 54) < 3))
    jamb_rows = frame & (outer | (pillar & course_line) | lintel_joints | (ys < 3.5))
    h = np.where(jamb_rows, 0.4, h)
    # pionowe żłobienia na płycie
    groove = in_slab & (np.abs(((ys + (fine - 0.5) * 14) % 58) - 29) < 1.2) & (ys > 70) & (np.hypot(xs - S / 2, ys - S * 0.56) > 164)
    h -= groove * 0.05
    # pierścień
    cx, cy = S / 2, S * 0.56
    r = np.hypot(xs - cx, ys - cy)
    ring = smooth(118, 124, r) * smooth(160, 154, r)
    ring_prof = np.clip(1 - np.abs(r - 139) / 20, 0, 1) ** 0.6
    h += ring_prof * 0.3
    # nity na pierścieniu
    ang = np.arctan2(ys - cy, xs - cx)
    rivet_a = np.round(ang / (np.pi / 8)) * (np.pi / 8)
    rx = cx + np.cos(rivet_a) * 139
    ry = cy + np.sin(rivet_a) * 139
    rd = np.hypot(xs - rx, ys - ry)
    rivet = np.clip(1 - rd / 6, 0, 1) ** 0.5
    h += rivet * 0.12
    # wewnętrzny dysk wpuszczony
    disk = smooth(118, 112, r)
    h -= disk * 0.1
    # szewrony bursztynu (jak w oryginale, ale rytym i inkrustowanym)
    amb = np.zeros((S, S))
    im = Image.new("L", (S * 4, S * 4), 0)
    d = ImageDraw.Draw(im)
    for k, off in enumerate((-46, 0, 46)):
        pts = [((cx - 62) * 4, (cy - 22 + off) * 4), (cx * 4, (cy + 18 + off) * 4), ((cx + 62) * 4, (cy - 22 + off) * 4)]
        d.line(pts, fill=255, width=40, joint="curve")
    d.ellipse([(cx - 11) * 4, (cy - 92) * 4, (cx + 11) * 4, (cy - 70) * 4], fill=255)
    amb = np.asarray(im.resize((S, S), Image.LANCZOS), float) / 255 * disk
    h -= ndi.gaussian_filter(amb, 1) * 0.12
    h += (fine - 0.5) * 0.04 + (mid - 0.5) * 0.04
    cm = crack_mask(S, S, 3, rng, length=(40, 120), wrap=True) * frame
    h -= cm * 0.25
    diff, ny = shade(h, 7.5)
    occ = ao(h, 6, 2.4)
    stone = np.array([158, 146, 126.0]) * (0.82 + 0.3 * mid[..., None]) * (0.9 + 0.2 * fine[..., None])
    basalt = np.array([74, 66, 58.0]) * (0.8 + 0.35 * mid[..., None]) * (0.9 + 0.2 * fine[..., None])
    base = np.where(frame[..., None], stone, basalt)
    # spoiny ramy w kolorze zaprawy ścian, żeby styk z sąsiednią ścianą był tą samą spoiną
    mortar_col = np.array([86, 74, 60.0]) * (0.75 + 0.5 * fine[..., None]) * 0.86
    base = np.where(jamb_rows[..., None], mortar_col, base)
    copper = np.array([150, 92, 52.0]) * (0.75 + 0.45 * mid[..., None])
    patina = np.array([96, 98, 80.0])
    pm = smooth(0.55, 0.8, big)[..., None] * 0.6
    copper = copper * (1 - pm) + patina * pm
    rm = np.clip(ring + rivet, 0, 1)[..., None]
    base = base * (1 - rm) + copper * rm
    base *= (1 - cm[..., None] * 0.6)
    light = (0.5 + 0.62 * diff)[..., None] * occ[..., None]
    rgb = base * light
    amber = np.array([232, 160, 66.0])
    a = amb[..., None]
    rgb = rgb * (1 - a) + amber * a * (0.85 + 0.3 * fine[..., None])
    rgb += amber * ndi.gaussian_filter(amb, 6)[..., None] * 0.45
    # ciepły odblask na pierścieniu od rdzenia
    rgb += np.array([60, 30, 8.0]) * (rm * smooth(150, 100, r)[..., None]) * 0.6
    # spoiny ramy dostają jasność spoin ścian (po świetle), inaczej styk z sąsiadem jest za ciemny
    joint = ndi.gaussian_filter(jamb_rows.astype(float), 0.8, mode=["nearest", "wrap"])[..., None]
    mortar_lit = np.array([86, 74, 60.0]) * (0.75 + 0.5 * fine[..., None]) * 0.74
    rgb = rgb * (1 - joint) + mortar_lit * joint
    return rgb


# ---------------------------------------------------------------- PODŁOGA

def floor_tex():
    """Kafel = 2×2 komórki labiryntu. Płyty o różnych rozmiarach, piasek w spoinach."""
    rng = np.random.default_rng(501)
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    warp_x = (fbm(S, S, 2.2, 502) - 0.5) * 10
    warp_y = (fbm(S, S, 2.2, 503) - 0.5) * 10
    wx = (xs + warp_x) % S
    wy = (ys + warp_y) % S
    rows = [140, 118, 136, 118]
    ey = np.cumsum([0] + rows)
    bid = np.zeros((S, S), int)
    dist = np.full((S, S), 99.0)
    nid = 0
    for r in range(len(rows)):
        y0, y1 = ey[r], ey[r + 1]
        widths, rem = [], S
        while rem > 0:
            wv = int(rng.uniform(130, 230))
            if rem - wv < 110:
                wv = rem
            widths.append(wv); rem -= wv
        off = rng.uniform(0, S)
        xe = np.cumsum([0] + widths) + off
        rowm = (wy >= y0) & (wy < y1)
        for i in range(len(widths)):
            a, b = xe[i], xe[i + 1]
            rel = (wx - a) % S
            inb = rowm & (rel < b - a)
            d = np.minimum(np.minimum(rel, (b - a) - rel), np.minimum(wy - y0, y1 - wy))
            dist = np.where(inb, d, dist)
            bid = np.where(inb, nid, bid)
            nid += 1
    fine = fbm(S, S, 1.1, 510)
    mid = fbm(S, S, 1.8, 511)
    big = fbm(S, S, 2.6, 512)
    wear = fbm(S, S, 2.2, 513)
    h = 0.3 + smooth(3, 3 + 16 * (0.4 + wear), dist) ** 0.6 * 0.45
    h += (mid - 0.5) * 0.12 + (fine - 0.5) * 0.06
    h -= np.clip(fbm(S, S, 0.95, 514) - 0.7, 0, 1) * 0.7
    cm = ndi.gaussian_filter(crack_mask(S, S, 5, rng, length=(50, 160), width=2.4, wrap=True), 0.7) * smooth(5, 12, dist)
    h -= cm * 0.35
    diff, ny = shade(h, 3.5, light=(-0.2, 0.3, 1.0), wrap_y=True)  # podłoga: światło z góry, bez kierunku
    occ = ao(h, 6, 3.0, wrap_y=True)
    tones = np.array([[138, 118, 94], [126, 110, 92], [148, 124, 96], [120, 104, 86]], float)
    ti = rng.integers(0, len(tones), nid)
    tj = rng.uniform(0.85, 1.1, nid)
    base = tones[ti][bid] * tj[bid][..., None]
    base *= (0.8 + 0.35 * mid[..., None]) * (0.88 + 0.22 * fine[..., None]) * (0.9 + 0.2 * big[..., None])
    # wytarta ścieżka środkiem (jaśniejsza, gładsza)
    sand = np.array([176, 154, 120.0]) * (0.85 + 0.25 * fine[..., None])
    jm = smooth(6, 2, dist)[..., None]
    base = base * (1 - jm) + sand * jm * 0.9
    drift = (smooth(0.55, 0.8, big) * 0.45)[..., None]
    base = base * (1 - drift) + sand * drift
    base *= (1 - cm[..., None] * 0.5)
    rgb = base * (0.62 + 0.42 * diff)[..., None] * occ[..., None]
    return rgb


# ---------------------------------------------------------------- NIEBO

def sky_tex():
    """Panorama 2048×512: x = azymut 0..360°, y = wysokość 90°(góra)..0°(horyzont)."""
    W, H = 4096, 1024
    rng = np.random.default_rng(901)
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    elev = (1 - ys / H) * 90  # stopnie
    t = ys / H
    top = np.array([7, 6, 9.0]); hor = np.array([46, 32, 24.0])
    base = top * (1 - t[..., None] ** 2.2) + hor * (t[..., None] ** 2.2)
    # pył przy horyzoncie
    haze = fbm(H, W, 2.3, 902)
    base += np.array([30, 20, 12.0]) * (smooth(0.6, 1.0, t) * (0.5 + haze))[..., None]
    # pas mgławicy przez niebo, ukośnie
    neb = fbm(H, W, 1.9, 903)
    neb2 = fbm(H, W, 1.4, 904)
    band_y = 0.74 + 0.08 * np.sin(xs / W * np.pi * 2 + 0.6)
    bd = np.exp(-((t - band_y) / 0.09) ** 2)
    nm = (smooth(0.45, 0.85, neb) * bd * (0.6 + 0.6 * neb2))[..., None]
    base += np.array([58, 34, 22.0]) * nm * 0.9 + np.array([24, 22, 26.0]) * nm * neb2[..., None]
    # ciemne pasma pyłu w mgławicy
    base *= (1 - (smooth(0.55, 0.8, neb2) * bd * 0.5))[..., None]
    # gwiazdy, gęściej w mgławicy, z zawinięciem w poziomie
    stars = np.zeros((H, W))
    col = np.zeros((H, W, 3))
    n = 9000
    sx = rng.uniform(0, W, n); sy = rng.uniform(0, H * 0.97, n)
    keep = rng.random(n) < (0.35 + 0.65 * bd[sy.astype(int), sx.astype(int)] + 0.3 * (1 - sy / H))
    sx, sy = sx[keep], sy[keep]
    mag = rng.power(0.25, len(sx))
    tint = rng.choice(4, len(sx), p=[0.6, 0.2, 0.12, 0.08])
    tints = np.array([[1, 1, 1], [1, 0.86, 0.68], [0.82, 0.88, 1], [1, 0.7, 0.55]])
    for x, y, m, tt in zip(sx, sy, mag, tint):
        rad = 0.6 + m * 1.6
        x0, y0 = int(x), int(y)
        for oy in range(-3, 4):
            for ox in range(-3, 4):
                px, py = (x0 + ox) % W, y0 + oy
                if py < 0 or py >= H:
                    continue
                dd = np.hypot(px + (W if x0 + ox < 0 else 0) - (W if x0 + ox >= W else 0) - x, py - y) if False else np.hypot(ox + x0 - x, oy + y0 - y)
                v = np.exp(-(dd / rad) ** 2 * 2.2) * (0.25 + m)
                if v > 0.01:
                    col[py, px] += tints[tt] * v
    base += col * 255 * 0.9
    # mały księżyc, azymut 205°, wysokość 52°
    ppd = W / 360
    mcx, mcy, mr = 205 * ppd, (1 - 24 / 90) * H, 1.8 * ppd
    mdx, mdy = xs - mcx, ys - mcy
    mrr = np.hypot(mdx, mdy) / mr
    mz = np.sqrt(np.clip(1 - mrr ** 2, 0, 1))
    mlam = np.clip(-mdx / mr * 0.8 + mz * 0.3, 0, 1)
    mtex = 0.85 + 0.3 * fbm(H, W, 1.3, 906)
    mcol = np.array([190, 180, 166.0]) * (0.03 + mlam ** 0.9)[..., None] * mtex[..., None]
    me = smooth(1.0, 0.95, mrr)[..., None]
    base = base * (1 - me) + mcol * me
    return base


def planet_tex():
    """Gazowy olbrzym z pierścieniem, RGBA 768×768. Środek obrazka = środek tarczy, promień tarczy = 168 px."""
    N = 768
    ys, xs = np.mgrid[0:N, 0:N].astype(float)
    pr = 168.0
    dx, dy = xs - N / 2, ys - N / 2
    rr = np.hypot(dx, dy) / pr
    inside = rr < 1
    zz = np.sqrt(np.clip(1 - rr ** 2, 0, 1))
    tiltA = -0.32
    ux = (dx / pr) * np.cos(tiltA) - (dy / pr) * np.sin(tiltA)
    uy = (dx / pr) * np.sin(tiltA) + (dy / pr) * np.cos(tiltA)
    lat = np.arcsin(np.clip(uy, -1, 1))
    turb = fbm(N, N, 2.0, 905)
    turb2 = fbm(N, N, 1.3, 906)
    bands = np.sin(lat * 9 + (turb - 0.5) * 3.2 + (turb2 - 0.5) * 1.2)
    bands2 = np.sin(lat * 23 + (turb - 0.5) * 6)
    c1 = np.array([196, 132, 82.0]); c2 = np.array([118, 70, 44.0]); c3 = np.array([224, 196, 152.0])
    pb = (bands[..., None] * 0.5 + 0.5)
    pc = c1 * pb + c2 * (1 - pb)
    pale = smooth(0.6, 0.95, bands2)[..., None] * 0.35
    pc = pc * (1 - pale) + c3 * pale
    sp = np.hypot((ux - 0.28) / 0.22, (uy - 0.32) / 0.1)
    spot = smooth(1.0, 0.4, sp)[..., None]
    pc = pc * (1 - spot * 0.7) + np.array([150, 66, 38.0]) * spot * 0.7
    Lp = np.array([-0.75, -0.25, 0.6]); Lp /= np.linalg.norm(Lp)
    nxp, nyp = dx / pr, -dy / pr
    lam = np.clip(nxp * Lp[0] + nyp * Lp[1] + zz * Lp[2], 0, 1)
    limb = 0.55 + 0.45 * zz
    pcol = pc * (0.05 + 1.0 * lam ** 0.8)[..., None] * limb[..., None]
    disk_a = smooth(1.0, 0.99, rr)
    rgb = pcol * disk_a[..., None]
    alpha = disk_a.copy()
    rim = np.exp(-((rr - 1) / 0.03) ** 2) * np.clip((nxp * Lp[0] + nyp * Lp[1]) / np.maximum(rr, 1e-3) + 0.3, 0, 1)
    rgb += np.array([220, 150, 90.0]) * rim[..., None] * 0.6
    alpha = np.clip(alpha + rim * 0.6, 0, 1)
    # pierścień: miękkie pasma, z przodu zasłania tarczę, z tyłu jest za nią
    ringr = np.hypot(ux, uy / 0.16)
    rb = smooth(1.42, 1.5, ringr) * smooth(2.1, 1.98, ringr)
    rb *= 0.55 + 0.25 * np.sin(ringr * 16) + 0.2 * np.sin(ringr * 7 + 1)
    gap = smooth(0.02, 0.0, np.abs(ringr - 1.74) - 0.02)
    rb *= 1 - gap * 0.8
    front = (uy > 0) | ~inside
    # cień tarczy na pierścieniu po stronie przeciwnej do słońca
    shadow = np.where((ux > 0.2) & (np.abs(uy) < 0.2) & (ringr < 2.1), 0.35, 1.0)
    rcol = np.array([206, 178, 136.0]) * shadow[..., None]
    ra = np.clip(rb * front * 0.85, 0, 1)
    rgb = rgb * (1 - ra[..., None]) + rcol * ra[..., None]
    alpha = np.clip(alpha + ra * (1 - alpha), 0, 1)
    out = np.dstack([np.clip(rgb / np.maximum(alpha, 1e-3)[..., None], 0, 255), alpha * 255])
    write_img(Image.fromarray(out.astype(np.uint8), "RGBA"), "planet.png")


if __name__ == "__main__":
    which = sys.argv[2:] or ["walls", "rune", "seal", "floor", "sky", "planet"]
    if "walls" in which:  # wszystkie na wspólnych COURSES
        save("wall_a.png", stone_wall(11, rust=0.15, cracks=5, dust=0.5)[0])
        save("wall_b.png", stone_wall(23, rust=0.55, cracks=4, dust=0.35)[0])
        save("wall_c.png", stone_wall(37, rust=0.05, cracks=10, dust=0.6)[0])
        save("wall_d.png", stone_wall(41, rust=0.3, cracks=6, dust=0.85)[0])
    if "rune" in which:
        save("rune.png", rune_wall())
    if "seal" in which:
        save("seal.png", seal_door())
    if "floor" in which:
        save("floor.png", floor_tex())
    if "sky" in which:
        save("sky.png", sky_tex())
    if "planet" in which:
        planet_tex()
    print("ok")
