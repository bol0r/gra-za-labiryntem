"""Generator tekstur intra dla "Za labiryntem".
Uruchom: python3 docs/intro_generator.py public/tex/intro [space planet hall floor ceiling gate photo]
Korzysta z funkcji szumu z pakiet_hd_generator.py (ten sam katalog). Zapis WebP.
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)
_here = os.path.dirname(os.path.abspath(__file__))
_argv = sys.argv
sys.argv = [_argv[0], OUT]
_spec = importlib.util.spec_from_file_location("hdgen", os.path.join(_here, "pakiet_hd_generator.py"))
hd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hd)
sys.argv = _argv
fbm, smooth, crack_mask, glyph_mask = hd.fbm, hd.smooth, hd.crack_mask, hd.glyph_mask
Q = int(os.environ.get("WEBP_Q", "86"))


def save(name, arr, mode="RGB", q=Q):
    a = np.clip(np.round(arr), 0, 255).astype(np.uint8)
    img = Image.fromarray(a, mode)
    img.save(os.path.join(OUT, name), "WEBP", quality=q, method=6, alpha_quality=100)
    return img


def shade(height, strength, light=(-0.45, 0.6, 0.66), wrap=("nearest", "wrap")):
    gx = ndi.sobel(height, axis=1, mode=wrap[1])
    gy = ndi.sobel(height, axis=0, mode=wrap[0])
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(height)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    L = np.array(light, float); L /= np.linalg.norm(L)
    return np.clip((nx * L[0] + ny * L[1] + nz * L[2]) / n, 0, 1), ny / n


def ao(height, sigma, k, wrap=("nearest", "wrap")):
    blur = ndi.gaussian_filter(height, sigma, mode=list(wrap))
    return np.clip(1 + (height - blur) * k, 0.3, 1.15)


def maze_cells(n, seed):
    """Prawdziwy labirynt DFS n×n: zwraca listę odcinków ścian w jednostkach siatki."""
    rng = np.random.default_rng(seed)
    v = np.ones((n, n + 1), bool)  # ściany pionowe
    h = np.ones((n + 1, n), bool)  # ściany poziome
    seen = np.zeros((n, n), bool)
    stack = [(n // 2, n // 2)]
    seen[n // 2, n // 2] = True
    while stack:
        x, y = stack[-1]
        opts = [(dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                if 0 <= x + dx < n and 0 <= y + dy < n and not seen[y + dy, x + dx]]
        if not opts:
            stack.pop(); continue
        dx, dy = opts[rng.integers(len(opts))]
        if dx == 1: v[y, x + 1] = False
        elif dx == -1: v[y, x] = False
        elif dy == 1: h[y + 1, x] = False
        else: h[y, x] = False
        seen[y + dy, x + dx] = True
        stack.append((x + dx, y + dy))
    v[n // 2, 0] = False  # wejście
    segs = []
    for y in range(n):
        for x in range(n + 1):
            if v[y, x]: segs.append(((x, y), (x, y + 1)))
    for y in range(n + 1):
        for x in range(n):
            if h[y, x]: segs.append(((x, y), (x + 1, y)))
    return segs


# ------------------------------------------------------------------ KOSMOS

def space_tex():
    """Tło kosmosu 2048×1024: mgławica w miedzi i popiele, gęste gwiazdy. Rysowane jako plansza za planetą.
    Kafelkuje się w poziomie (lewa i prawa krawędź się zgadzają), więc nadaje się też na panoramę."""
    W, H = 2048, 1024
    rng = np.random.default_rng(1201)
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    base = np.zeros((H, W, 3)) + np.array([5, 5, 8.0])
    n1 = fbm(H, W, 2.1, 1202); n2 = fbm(H, W, 1.5, 1203); n3 = fbm(H, W, 2.8, 1204)
    # ukośna wstęga mgławicy
    # wstęga faluje okresowo w poziomie (sinus po pełnym obwodzie), więc nie ma szwu na krawędzi
    band = np.exp(-(((ys / H - 0.55) + 0.14 * np.sin(xs / W * 2 * np.pi + 0.4) + (n3 - 0.5) * 0.35) / 0.17) ** 2)
    neb = smooth(0.35, 0.9, n1) * band
    base += np.array([118, 60, 36.0]) * (neb * (0.6 + 0.8 * n2))[..., None]
    base += np.array([40, 34, 52.0]) * (smooth(0.4, 0.8, n2) * band * 0.8)[..., None]
    base += np.array([150, 96, 58.0]) * (smooth(0.72, 0.95, n1) * band * smooth(0.5, 0.8, n2) * 0.6)[..., None]
    dark = smooth(0.52, 0.78, fbm(H, W, 1.7, 1205)) * band
    base *= (1 - dark * 0.75)[..., None]
    # gwiazdy: plamki gaussowskie, gęściej w wstędze
    n = 14000
    sx = rng.uniform(0, W, n); sy = rng.uniform(0, H, n)
    keep = rng.random(n) < 0.25 + 0.75 * band[sy.astype(int), sx.astype(int)]
    sx, sy = sx[keep], sy[keep]
    mag = rng.power(0.22, len(sx))
    tints = np.array([[1, 1, 1], [1, 0.86, 0.66], [0.8, 0.88, 1], [1, 0.66, 0.5]])
    tint = tints[rng.choice(4, len(sx), p=[0.55, 0.22, 0.13, 0.10])]
    acc = np.zeros((H, W, 3))
    for oy in range(-3, 4):
        for ox in range(-3, 4):
            px = (sx.astype(int) + ox) % W; py = np.clip(sy.astype(int) + oy, 0, H - 1)
            d = np.hypot((px + 0.5 - sx + W / 2) % W - W / 2, py + 0.5 - sy)
            rad = 0.55 + mag * 1.5
            val = np.exp(-(d / rad) ** 2 * 2.2) * (0.2 + mag)
            np.add.at(acc, (py, px), tint * val[:, None])
    base += acc * 255 * 0.95
    # kilka jasnych gwiazd z krzyżem dyfrakcyjnym
    for _ in range(9):
        cx, cy = rng.uniform(0, W), rng.uniform(H * 0.1, H * 0.9)
        dxw = (xs - cx + W / 2) % W - W / 2  # odległość z zawinięciem w poziomie
        d = np.hypot(dxw, ys - cy)
        glow = np.exp(-(d / 5) ** 2) + 0.25 * np.exp(-(d / 22) ** 2)
        spike = (np.exp(-np.abs(ys - cy) / 1.1) * np.exp(-np.abs(dxw) / 46) + np.exp(-np.abs(dxw) / 1.1) * np.exp(-np.abs(ys - cy) / 46)) * 0.5
        base += np.array([255, 236, 210.0]) * (glow + spike)[..., None]
    return base


# ------------------------------------------------------------------ PLANETA

PW, PH = 1024, 512
SCAR_U, SCAR_V = 0.5, 0.62  # środek blizny-labiryntu: u = długość, v od bieguna N; v 0,62 = środek tarczy przy nurkowaniu


def planet_tex():
    """Mapa równoprostokątna 1024×512 i maska świecenia. Środek mapy (u = 0,5) to labirynt widziany z orbity."""
    rng = np.random.default_rng(1301)
    ys, xs = np.mgrid[0:PH, 0:PW].astype(float)
    lat = (0.5 - ys / PH) * np.pi
    # szum okresowy w poziomie; przy biegunach rozmyty w poziomie, żeby nie było szwu-gwiazdy
    def pn(beta, seed):
        n = fbm(PH, PW, beta, seed)
        blur = ndi.gaussian_filter1d(n, 40, axis=1, mode="wrap")
        k = smooth(0.62, 0.95, np.abs(ys / PH - 0.5) * 2)
        return n * (1 - k) + blur * k
    cont = pn(2.5, 1302); mid = pn(1.85, 1303); fine = pn(1.15, 1304); ridge = pn(2.1, 1305); ridge2 = pn(1.7, 1306)
    det = pn(0.95, 1307)
    # kaniony: cienkie, ostre doliny z grzbietów szumu
    can = smooth(0.955, 0.99, 1 - np.abs(2 * ridge - 1)) * smooth(0.35, 0.6, cont)
    can2 = smooth(0.965, 0.993, 1 - np.abs(2 * ridge2 - 1)) * 0.7
    canyon = np.clip(can + can2, 0, 1)
    height = cont * 0.55 + mid * 0.25 + fine * 0.08 + det * 0.03 - canyon * 0.22
    # kratery jako rzeźba: misa, wał, jaśniejszy wyrzut
    ejecta = np.zeros((PH, PW))
    for _ in range(34):
        cu, cv = rng.uniform(0, PW), rng.uniform(PH * 0.12, PH * 0.88)
        r = rng.power(0.35) * 22 + 2.5
        dx = ((xs - cu + PW / 2) % PW - PW / 2) * np.cos(lat)
        d = np.hypot(dx, ys - cv) / r
        height += (-smooth(1.0, 0.2, d) * 0.06 + np.exp(-((d - 1) / 0.18) ** 2) * 0.035) * (r / 12) ** 0.5
        ejecta += smooth(2.6, 1.0, d) * (1 - smooth(1.0, 0.8, d)) * 0.5
    diff, _ = shade(height, 18.0, light=(-0.6, 0.45, 0.66), wrap=("nearest", "wrap"))
    rust = np.array([156, 86, 54.0]); dust = np.array([204, 156, 108.0]); basalt = np.array([62, 46, 42.0]); ochre = np.array([178, 122, 72.0])
    maria = smooth(0.40, 0.58, cont + (det - 0.5) * 0.18)
    col = rust * (1 - maria[..., None]) + basalt * maria[..., None]
    dm = smooth(0.52, 0.8, mid + (det - 0.5) * 0.3)[..., None] * 0.55
    col = col * (1 - dm) + dust * dm
    om = smooth(0.32, 0.12, mid)[..., None] * 0.45
    col = col * (1 - om) + ochre * om
    col *= (0.78 + 0.36 * fine[..., None]) * (0.9 + 0.2 * det[..., None])
    col = col * (1 - np.clip(ejecta, 0, 0.6)[..., None] * 0.35) + dust * (np.clip(ejecta, 0, 0.6) * 0.35)[..., None]
    col *= (1 - canyon[..., None] * 0.5)
    col *= (0.62 + 0.62 * diff)[..., None]
    # czapy polarne o postrzępionym brzegu
    cap = smooth(0.8, 0.88, np.abs(lat) / (np.pi / 2) + (det - 0.5) * 0.1 + (mid - 0.5) * 0.08)
    col = col * (1 - cap[..., None] * 0.72) + np.array([218, 202, 184.0]) * (cap * (0.85 + 0.25 * fine))[..., None] * 0.72
    # labirynt-blizna: prawdziwy labirynt 15×15 wyryty w skale, krawędzie lekko świecą bursztynem
    big = 4
    Wb, Hb = PW * big, PH * big
    lat_s = (0.5 - SCAR_V) * np.pi
    side = PH * 0.2 * big  # wysokość labiryntu w pikselach mapy
    cx, cy = SCAR_U * Wb, SCAR_V * Hb
    sxs = side / np.cos(lat_s)  # rozciągnięcie w długości
    n = 15
    segs = maze_cells(n, 1310)
    wall = Image.new("L", (Wb, Hb), 0); dw = ImageDraw.Draw(wall)
    for (a, b) in segs:
        p0 = (cx + (a[0] / n - 0.5) * sxs, cy + (a[1] / n - 0.5) * side)
        p1 = (cx + (b[0] / n - 0.5) * sxs, cy + (b[1] / n - 0.5) * side)
        dw.line([p0, p1], fill=255, width=int(side / n * 0.32))
    wall = np.asarray(wall.resize((PW, PH), Image.LANCZOS), float) / 255
    erode = smooth(0.25, 0.75, fbm(PH, PW, 1.6, 1311))
    footprint = np.zeros((PH, PW))
    fx = np.abs((xs - SCAR_U * PW) / (sxs / big / 2)); fy = np.abs((ys - SCAR_V * PH) / (side / big / 2))
    inside = smooth(1.12, 1.0, np.maximum(fx, fy))
    halo = smooth(1.6, 1.0, np.maximum(fx, fy))
    # wyrównany, ciemniejszy plac pod labiryntem i rozwiany pył wokół
    col = col * (1 - halo[..., None] * 0.35) + np.array([86, 60, 48.0]) * (halo * 0.35)[..., None]
    col = col * (1 - inside[..., None] * 0.35) + np.array([64, 50, 44.0]) * (inside * 0.35)[..., None]
    wm = wall * (0.55 + 0.45 * erode)
    col = col * (1 - wm[..., None] * 0.6) + np.array([30, 24, 22.0]) * (wm * 0.6)[..., None]
    # cień ścian (światło z lewej góry)
    sh = ndi.shift(wm, (1.2, 1.2), order=1) * (1 - wm)
    col *= (1 - sh[..., None] * 0.35)
    glow = ndi.gaussian_filter(wall, 0.8) * smooth(0.45, 0.8, erode)
    glow = np.clip(glow * 1.2 + ndi.gaussian_filter(wall, 5) * 0.5 * inside, 0, 1)
    # serce w środku labiryntu
    dh = np.hypot((xs - SCAR_U * PW) * np.cos(lat_s), ys - SCAR_V * PH)
    glow = np.clip(glow + np.exp(-(dh / 3.5) ** 2) * 1.0 + np.exp(-(dh / 16) ** 2) * 0.35, 0, 1)
    # cienkie chmury pyłowe
    cl = smooth(0.62, 0.86, pn(1.6, 1320)) * (0.6 + 0.4 * pn(2.4, 1321))
    cl = ndi.gaussian_filter1d(cl, 6, axis=1, mode="wrap")
    col = col * (1 - cl[..., None] * 0.55) + np.array([226, 206, 182.0]) * (cl * 0.55)[..., None]
    glow *= (1 - cl * 0.7)
    save("planet_surface.webp", col)
    save("planet_glow.webp", np.repeat((glow * 255)[..., None], 3, axis=2), q=80)
    return col, glow

# ------------------------------------------------------------------ KORYTARZ

HW_, HH_ = 1024, 512   # ściana: 5,12 × 2,62 jednostki (jeden przęsło między pilastrami)
TORCH_U, TORCH_V = 0.5625, 0.38   # uchwyt pochodni (z = 2,88 w przęśle, y = 1,62)


def hall_wall():
    """Ściana sali: cztery rzędy ciosów, fryz z procesją glifów, pilaster na brzegu kafla, uchwyt pochodni."""
    W, H = HW_, HH_
    rng = np.random.default_rng(1401)
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    def n(beta, seed):
        return fbm(H, W, beta, seed)
    fine, mid, big, ero = n(1.15, 1402), n(1.8, 1403), n(2.6, 1404), n(2.0, 1405)
    # rzędy (v): cokół, dwa rzędy, fryz, rząd, gzyms
    rows = [70, 176, 104, 92, 70]  # od góry: gzyms 70, rząd 176 (pochodnia), fryz 104 (y≈0,83–1,36), rząd 92, cokół 70
    edges = np.cumsum([0] + rows)
    calm = smooth(0, 40, np.minimum(xs, W - 1 - xs))
    wy = ys + (n(2.2, 1406) - 0.5) * 6 * calm
    wx = (xs + (n(2.2, 1407) - 0.5) * 6 * calm) % W
    bid = np.zeros((H, W), int); dist = np.full((H, W), 99.0); nid = 0
    for r in range(len(rows)):
        y0, y1 = edges[r], edges[r + 1]
        if r == 2:
            widths = [W // 4] * 4  # fryz: cztery płyty
        else:
            widths, rem = [], W
            while rem > 0:
                wv = int(rng.uniform(150, 330))
                if rem - wv < 120: wv = rem
                widths.append(wv); rem -= wv
        xe = np.cumsum([0] + widths).astype(float)
        rowm = (wy >= y0) & (wy < y1)
        for i in range(len(widths)):
            a, b = xe[i], xe[i + 1]
            rel = (wx - a) % W
            inb = rowm & (rel < b - a)
            dx = np.minimum(rel + 0.5, (b - a) - rel - 0.5)
            dy = np.minimum(wy - y0, y1 - wy)
            d = np.minimum(dx, dy)
            dist = np.where(inb, d, dist); bid = np.where(inb, nid, bid); nid += 1
    face = smooth(3.5, 3.5 + 6 + 26 * ero ** 1.5, dist) ** 0.7
    h = 0.2 + face * 0.7 + (mid - 0.5) * 0.14 * face + (fine - 0.5) * 0.05
    # pilaster na brzegu kafla (połowa po każdej stronie): żłobkowany trzon, baza i głowica
    px = np.minimum(xs, W - 1 - xs)
    pil = smooth(62, 56, px)
    flute = np.cos(px / 56 * np.pi * 3.5) * 0.5 + 0.5
    cap = smooth(70, 60, ys) + smooth(H - 40, H - 30, ys)
    round_ = np.cos(np.clip(px / 60, 0, 1) * np.pi / 2)
    h = h * (1 - pil) + pil * (0.8 + round_ * 0.18 + flute * 0.06 * (1 - cap) + cap * 0.12)
    h -= smooth(58, 56, px) * smooth(54, 58, px) * 0.25  # krawędź pilastra
    # fryz: procesja glifów (cztery płyty po jednym glifie) i pas kropek nad nią
    fy0, fy1 = edges[2], edges[3]
    fcy = (fy0 + fy1) / 2
    kinds = [2, 0, 4, 1]
    glyphs = [((i + 0.5) * W / 4, fcy, 38, kinds[i]) for i in range(4)]
    gm = glyph_mask(W, H, glyphs, rng, stroke=8)
    h -= ndi.gaussian_filter(gm, 1.0) * 0.3
    # gzyms: pozioma listwa z zębami pod spodem
    teeth = (ys > 50) & (ys < 64) & (((xs + 8) % 28) < 14) & (px > 62)
    h += teeth * 0.12
    cm = ndi.gaussian_filter(crack_mask(H, W, 7, rng, length=(60, 200), width=2.2, wrap=True), 0.7) * smooth(6, 14, dist)
    h -= cm * 0.28
    diff, ny = shade(h, 3.2)
    occ = ao(h, 8, 2.4)
    tones = np.array([[128, 110, 90], [138, 118, 96], [118, 102, 86], [134, 112, 88]], float)
    ti = rng.integers(0, len(tones), nid); tj = rng.uniform(0.88, 1.08, nid)
    base = tones[ti][bid] * tj[bid][..., None]
    base = base * (1 - pil[..., None]) + np.array([112, 98, 82.0]) * pil[..., None]
    base *= (0.84 + 0.26 * mid[..., None]) * (0.92 + 0.16 * fine[..., None]) * (0.9 + 0.16 * big[..., None])
    mmask = smooth(6.5, 3, dist)[..., None] * (1 - pil[..., None])
    base = base * (1 - mmask) + np.array([70, 60, 50.0]) * (0.75 + 0.5 * fine[..., None]) * mmask
    # bursztynowa inkrustacja glifów, zwietrzała
    wear = smooth(0.3, 0.65, n(1.6, 1408))
    inlay = np.clip(ndi.gaussian_filter(gm, 0.7) * 1.3, 0, 1) * wear
    amber = np.array([200, 128, 52.0])
    base = base * (1 - inlay[..., None] * 0.7) + amber * inlay[..., None] * 0.7
    # pochodnia: miedziany uchwyt i sadza nad płomieniem
    tx, ty = TORCH_U * W, TORCH_V * H
    sd = np.hypot((xs - tx) * 1.6, (ys - (ty - 70)) * 0.7)
    soot = np.exp(-(sd / 60) ** 2) * (ys < ty + 10)
    base *= (1 - soot[..., None] * 0.75)
    bracket = Image.new("L", (W * 2, H * 2), 0); bd = ImageDraw.Draw(bracket)
    X, Y = tx * 2, ty * 2
    bd.polygon([(X - 36, Y + 4), (X + 36, Y + 4), (X + 18, Y + 44), (X - 18, Y + 44)], fill=255)  # misa
    bd.rectangle([X - 42, Y - 4, X + 42, Y + 8], fill=255)  # brzeg misy
    bd.polygon([(X - 8, Y + 44), (X + 8, Y + 44), (X + 6, Y + 82), (X - 6, Y + 82)], fill=255)  # trzpień
    bd.rectangle([X - 30, Y + 76, X + 30, Y + 90], fill=255)  # płytka w murze
    for k in (-1, 1):
        bd.line([(X + k * 32, Y + 8), (X + k * 8, Y + 78)], fill=255, width=7)  # zastrzały
    bracket = np.asarray(bracket.resize((W, H), Image.LANCZOS), float) / 255
    copper = np.array([128, 80, 46.0]) * (0.75 + 0.45 * mid[..., None])
    copper = copper * (1 - smooth(0.55, 0.8, big)[..., None] * 0.5) + np.array([84, 92, 74.0]) * (smooth(0.55, 0.8, big)[..., None] * 0.5)
    bsh = ndi.shift(bracket, (5, -4), order=1) * (1 - bracket)
    base *= (1 - bsh[..., None] * 0.5)
    light = (0.62 + 0.46 * diff)[..., None] * occ[..., None]
    rgb = base * light
    bl = np.clip(0.75 - ndi.sobel(ndi.gaussian_filter(bracket, 1.5), axis=1) * 0.25 + ndi.sobel(ndi.gaussian_filter(bracket, 1.5), axis=0) * 0.15, 0.35, 1.4)
    rgb = rgb * (1 - bracket[..., None]) + copper * bl[..., None] * bracket[..., None]
    # pył przy posadzce
    dust = smooth(0.82, 1.0, ys / H) * (0.4 + 0.6 * big)
    rgb = rgb * (1 - dust[..., None] * 0.45) + np.array([150, 132, 106.0]) * (dust * 0.45)[..., None]
    return rgb


def hall_floor():
    """Posadzka 512×512 = cała szerokość korytarza (2,48) × 2,48 długości. Kafelkuje się wzdłuż.
    Środkiem biegnie miedziana inkrustacja z szewronami w stronę serca (w górę tekstury = dalej)."""
    S = 512
    rng = np.random.default_rng(1501)
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    fine, mid, big, wear = fbm(S, S, 1.1, 1502), fbm(S, S, 1.8, 1503), fbm(S, S, 2.6, 1504), fbm(S, S, 2.0, 1505)
    # płyty: dwie kolumny po bokach pasa środkowego, długie płyty w pasie
    lane = np.abs(xs - S / 2)
    dist = np.full((S, S), 99.0); bid = np.zeros((S, S), int)
    wy = (ys + (fbm(S, S, 2.2, 1506) - 0.5) * 6) % S
    # pas środkowy: płyty 64 px szerokości ×128 długości
    inl = lane < 40
    d_l = np.minimum(40 - lane, np.minimum(wy % 128, 128 - wy % 128))
    dist = np.where(inl, d_l, dist); bid = np.where(inl, (wy // 128).astype(int), bid)
    # boki: płyty 108×(różna długość), przesunięte
    for side in (-1, 1):
        x0 = S / 2 + side * 40
        sm = (xs - x0) * side >= 0
        rel = np.abs(xs - x0)
        col = np.minimum(rel // 108, 1)
        cx = np.where(col == 0, rel, rel - 108)
        cw = np.where(col == 0, 108, (S / 2 - 40) - 108)
        off = np.where(col == 0, 0, 90) + (side + 1) * 40
        yy = (wy + off) % S
        dyy = np.minimum(yy % 128, 128 - yy % 128)
        d = np.minimum(np.minimum(cx, cw - cx), dyy)
        dist = np.where(sm & ~inl, d, dist)
        bid = np.where(sm & ~inl, 10 + side * 5 + col * 2 + (yy // 128).astype(int) * 3, bid)
    h = 0.3 + smooth(3, 3 + 14 * (0.4 + wear), dist) ** 0.6 * 0.45 + (mid - 0.5) * 0.12 + (fine - 0.5) * 0.06
    cm = ndi.gaussian_filter(crack_mask(S, S, 6, rng, length=(50, 160), width=2.4, wrap=True), 0.7) * smooth(5, 12, dist)
    h -= cm * 0.35
    diff, ny = shade(h, 3.5, light=(-0.2, 0.3, 1.0), wrap=("wrap", "wrap"))
    occ = ao(h, 6, 3.0, wrap=("wrap", "wrap"))
    bid = bid.astype(int)
    tones = np.array([[112, 98, 82], [104, 92, 78], [120, 102, 82], [98, 86, 74]], float)
    ti = rng.integers(0, len(tones), 64); tj = rng.uniform(0.85, 1.1, 64)
    base = tones[ti[bid % 64]] * tj[bid % 64][..., None]
    base *= (0.8 + 0.35 * mid[..., None]) * (0.88 + 0.22 * fine[..., None]) * (0.9 + 0.2 * big[..., None])
    sand = np.array([166, 144, 112.0]) * (0.85 + 0.25 * fine[..., None])
    jm = smooth(6, 2, dist)[..., None]
    base = base * (1 - jm) + sand * jm * 0.85
    # wytarta ścieżka środkiem
    path = np.exp(-(lane / 120) ** 2) * 0.25
    base = base * (1 + path[..., None] * 0.25)
    # inkrustacja: dwie miedziane linie i szewrony co 128 px
    im = Image.new("L", (S * 4, S * 4), 0); d = ImageDraw.Draw(im)
    for xo in (-30, 30):
        d.line([((S / 2 + xo) * 4, 0), ((S / 2 + xo) * 4, S * 4)], fill=255, width=10)
    for k in range(4):
        cy = (k * 128 + 64) * 4
        # szewron wskazuje w stronę rosnącego v, czyli dalej w korytarz, do serca
        d.line([((S / 2 - 22) * 4, cy - 40), (S / 2 * 4, cy + 12), ((S / 2 + 22) * 4, cy - 40)], fill=255, width=14, joint="curve")
    inlay = np.asarray(im.resize((S, S), Image.LANCZOS), float) / 255
    inlay *= smooth(0.25, 0.55, fbm(S, S, 1.5, 1507))  # wytarte miejscami
    copper = np.array([176, 110, 58.0]) * (0.75 + 0.45 * mid[..., None])
    pat = smooth(0.5, 0.8, big)[..., None] * 0.55
    copper = copper * (1 - pat) + np.array([92, 104, 82.0]) * pat
    base *= (1 - cm[..., None] * 0.5)
    rgb = base * (0.62 + 0.42 * diff)[..., None] * occ[..., None]
    rgb = rgb * (1 - inlay[..., None]) + copper * (0.85 + 0.3 * fine[..., None]) * inlay[..., None]
    # krawędzie przy ścianach: ciemniej i więcej piasku
    edge = smooth(70, 0, np.minimum(xs, S - 1 - xs))
    rgb = rgb * (1 - edge[..., None] * 0.35) + np.array([120, 104, 82.0]) * (edge * 0.2)[..., None]
    return rgb


def hall_ceiling():
    """Strop 512×512 (2,48 × 2,48): kasetony 2×2 z rozetą, korzenie i zacieki."""
    S = 512
    rng = np.random.default_rng(1601)
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    fine, mid = fbm(S, S, 1.1, 1602), fbm(S, S, 1.9, 1603)
    cx = xs % 256; cy = ys % 256
    d = np.minimum(np.minimum(cx, 256 - cx), np.minimum(cy, 256 - cy))
    h = 0.9 - smooth(14, 22, d) * 0.25 - smooth(34, 42, d) * 0.25
    r = np.hypot(cx - 128, cy - 128)
    ang = np.arctan2(cy - 128, cx - 128)
    rosette = smooth(48, 40, r) * (0.5 + 0.5 * np.cos(ang * 8)) * smooth(10, 20, r)
    h += rosette * 0.15 + smooth(12, 8, r) * 0.15
    h += (mid - 0.5) * 0.1 + (fine - 0.5) * 0.05
    roots = ndi.gaussian_filter(crack_mask(S, S, 9, rng, length=(80, 260), width=2.8, wrap=True), 0.9)
    h += roots * 0.15
    diff, _ = shade(h, 4.0, light=(0.0, -0.4, 0.9), wrap=("wrap", "wrap"))
    occ = ao(h, 10, 2.6, wrap=("wrap", "wrap"))
    base = np.array([88, 78, 68.0]) * (0.8 + 0.35 * mid[..., None]) * (0.9 + 0.2 * fine[..., None])
    base = base * (1 - roots[..., None] * 0.8) + np.array([48, 38, 30.0]) * roots[..., None] * 0.8
    stain = smooth(0.6, 0.85, fbm(S, S, 2.4, 1604))
    base *= (1 - stain[..., None] * 0.35)
    return base * (0.55 + 0.5 * diff)[..., None] * occ[..., None]


def hall_gate():
    """Ściana końcowa 512×512 (2,48 × 2,62): brama serca. Rama z ciosów, wnęka, miedziane kręgi, glify po bokach,
    bursztyn sączący się ze szczelin. Środek wnęki (x = 0, y ≈ 1,28) to miejsce, gdzie wisi serce."""
    S = 512
    rng = np.random.default_rng(1701)
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    fine, mid, big = fbm(S, S, 1.15, 1702), fbm(S, S, 1.85, 1703), fbm(S, S, 2.6, 1704)
    cx, cy = S / 2, S * (1 - 1.28 / 2.62)
    # łuk wnęki: prostokąt z półkolem u góry
    nw = 0.5 / 1.24 * S / 2  # pół szerokości wnęki
    top = S * (1 - 1.9 / 2.62)
    in_rect = (np.abs(xs - cx) < nw) & (ys > top) & (ys < S * (1 - 0.62 / 2.62))
    in_arch = np.hypot(xs - cx, ys - top) < nw
    niche = in_rect | (in_arch & (ys <= top))
    nd = ndi.distance_transform_edt(niche)
    od = ndi.distance_transform_edt(~niche)
    # ciosy ramy: promieniste kliny wokół łuku + rzędy po bokach
    rr = np.hypot(xs - cx, ys - top)
    a = np.arctan2(ys - top, xs - cx)
    voussoir = (rr > nw) & (rr < nw + 46) & (ys < top + 2)
    vj = np.abs(((a / np.pi * 9) % 1) - 0.5) > 0.47
    rowj = ((ys % 64) < 3) | ((((xs + (ys // 64 % 2) * 60) % 120) < 3))
    joint = voussoir & (vj | (np.abs(rr - nw - 46) < 2))
    wall_rgb, wall_h = hd.stone_wall(1711, rust=0.2, cracks=4, dust=0.4)
    h = np.where(niche, 0.2 - smooth(0, 40, nd) * 0.1, wall_h)
    h = np.where(voussoir, 0.85 - joint * 0.3, h)
    # kręgi w głębi wnęki
    rc = np.hypot(xs - cx, ys - cy)
    rings = (np.abs(rc - 52) < 4) | (np.abs(rc - 72) < 3)
    h += rings * niche * 0.15
    # dwie kolumny glifów po bokach
    kinds = [0, 3, 5, 1, 4, 2]
    glyphs = [(cx + side * (nw + 92), 90 + k * 110, 30, kinds[(k + (side > 0) * 2) % 6]) for side in (-1, 1) for k in range(4)]
    gm = glyph_mask(S, S, glyphs, rng, stroke=7)
    h -= ndi.gaussian_filter(gm, 0.9) * 0.3
    cm = ndi.gaussian_filter(crack_mask(S, S, 6, rng, length=(40, 160), width=2.2, wrap=False), 0.7) * ~niche
    h -= cm * 0.25
    diff, _ = shade(h, 4.5, wrap=("nearest", "nearest"))
    occ = ao(h, 8, 2.6, wrap=("nearest", "nearest"))
    stone = np.array([132, 118, 100.0]) * (0.82 + 0.3 * mid[..., None]) * (0.9 + 0.2 * fine[..., None])
    deep = np.array([34, 28, 26.0]) * (0.8 + 0.4 * mid[..., None])
    vlit = stone * (0.55 + 0.6 * diff)[..., None] * occ[..., None]
    vlit = np.where(joint[..., None], np.array([60, 50, 42.0]), vlit)
    rgb = np.where(voussoir[..., None], vlit, wall_rgb * 0.92)
    copper = np.array([150, 92, 52.0]) * (0.75 + 0.45 * mid[..., None])
    inner = np.where((rings & niche)[..., None], copper, deep) * (0.55 + 0.6 * diff)[..., None] * occ[..., None]
    rgb = np.where(niche[..., None], inner, rgb)
    # cień wnęki na ramie
    rgb *= (1 - (np.exp(-(od / 10) ** 2) * ~niche * 0.45))[..., None]
    amber = np.array([240, 168, 74.0])
    inlay = np.clip(ndi.gaussian_filter(gm, 0.7) * 1.3, 0, 1) * smooth(0.25, 0.6, fbm(S, S, 1.6, 1705))
    rgb = rgb * (1 - inlay[..., None] * 0.75) + amber * inlay[..., None] * 0.75
    # bursztyn sączący się ze spoin łuku i z głębi wnęki
    seep = ndi.gaussian_filter((joint & voussoir).astype(float), 1.2) * 0.9 + np.exp(-(rc / 60) ** 2) * niche * 0.55
    seep += np.exp(-(od / 6) ** 2) * (~niche) * 0.35 * (ys > top - nw)
    rgb += amber * np.clip(seep, 0, 1)[..., None] * 0.6
    rgb *= (1 - cm[..., None] * 0.4)
    return rgb


# ------------------------------------------------------------------ EASTER EGG: ZDJĘCIE

def _spline(pts, n=14, closed=True):
    """Catmull-Rom przez punkty kontrolne -> gładki wielokąt."""
    P = np.array(pts, float)
    if closed:
        P = np.vstack([P[-1], P, P[0], P[1]])
    else:
        P = np.vstack([P[0], P, P[-1]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-2])
    return [tuple(p) for p in out]


def _font(size):
    from PIL import ImageFont
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
                 "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
                 "/Library/Fonts/Georgia Italic.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def egg_photo():
    """Decal 512×512 RGBA = jedna komórka podłogi. Na nim wyblakła odbitka: Wera, latarniczka sprzed was,
    w łuku ruiny, pod światło, z uniesioną latarnią i zwojem liny. Postać wymyślona na potrzeby gry."""
    rng = np.random.default_rng(1801)
    PWp, PHp, B = 800, 1000, 4  # obszar zdjęcia, nadpróbkowanie
    W, H = PWp * B, PHp * B
    ys, xs = np.mgrid[0:PHp, 0:PWp].astype(float)
    # --- tło: łuk ruiny, jasny prześwit za postacią, posadzka
    sky = np.zeros((PHp, PWp))
    arch_c, arch_w, arch_top = 400, 250, 210
    in_open = (np.abs(xs - arch_c) < arch_w) & (ys > arch_top) | (np.hypot(xs - arch_c, ys - arch_top) < arch_w)
    in_open &= ys < 760
    hz = 700  # horyzont w prześwicie
    glow = np.exp(-((xs - 430) ** 2 / 2 / 180 ** 2 + (ys - hz) ** 2 / 2 / 160 ** 2))
    sky = np.where(in_open, 0.72 + 0.5 * glow - 0.28 * smooth(hz - 400, 220, ys), 0)
    stone = 0.16 + 0.1 * fbm(PHp, PWp, 1.6, 1802) + 0.06 * fbm(PHp, PWp, 1.1, 1803)
    # ciosy łuku po bokach
    jn = ((ys % 92) < 4) | (((xs + (ys // 92 % 2) * 70) % 140) < 4)
    stone -= jn * 0.07
    floor = ys > 760
    persp = np.abs(((xs - 400) / np.maximum(ys - 690, 1) * 60) % 40 - 20) < 1.2
    fl = 0.28 + 0.25 * (ys - 760) / 240 + 0.05 * fbm(PHp, PWp, 1.3, 1804) - persp * floor * 0.05
    img = np.where(in_open, sky, np.where(floor, fl, stone))
    # promienie pyłu w prześwicie
    ang = np.arctan2(ys - (hz + 120), xs - 430)
    rays = (0.5 + 0.5 * np.sin(ang * 23)) * np.exp(-np.abs(ys - hz) / 260) * in_open
    img += rays * 0.08
    # --- postać (sylwetka), rysowana w nadpróbkowaniu
    sil = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(sil)
    def S(pts):
        return [(x * B, y * B) for x, y in pts]
    def limb(path, widths):
        """Kończyna jako gładki obrys wokół linii środkowej o zmiennej szerokości."""
        P = np.array(_spline(path, n=10, closed=False))
        wv = np.interp(np.linspace(0, 1, len(P)), np.linspace(0, 1, len(widths)), widths)
        tang = np.gradient(P, axis=0)
        tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
        nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
        left = P + nrm * wv[:, None] / 2
        right = P - nrm * wv[:, None] / 2
        d.polygon(S([tuple(p) for p in np.vstack([left, right[::-1]])]), fill=255)
    # tułów: wąskie ramiona, pełny biust, wcięta talia, biodro wypchnięte w prawo (ciężar na prawej nodze)
    torso = [(344, 352), (372, 342), (428, 342), (456, 352), (464, 376), (466, 404), (458, 430), (444, 458),
             (446, 490), (462, 520), (468, 548), (440, 566), (360, 566), (338, 548), (344, 516), (356, 486),
             (356, 458), (342, 430), (334, 404), (336, 376)]
    d.polygon(S(_spline(torso)), fill=255)
    # głowa lekko przechylona, fryzura: krótki, nierówny bob z kosmykiem, opaska z goglami na czole
    d.polygon(S(_spline([(372, 246), (398, 236), (424, 246), (436, 272), (438, 304), (432, 326), (418, 320),
                         (410, 330), (384, 330), (372, 322), (360, 330), (358, 300), (360, 270)])), fill=255)
    limb([(398, 316), (398, 348)], [24, 26])  # szyja
    # ręka z latarnią w górę, druga oparta na biodrze
    limb([(452, 364), (492, 350), (526, 336), (536, 300), (544, 266)], [30, 26, 22, 19, 20])
    d.ellipse(S([(532, 250), (558, 276)]), fill=255)
    limb([(346, 366), (322, 404), (304, 446), (322, 486), (350, 512)], [30, 26, 22, 19, 18])
    # nogi: prawa prosta (ciężar), lewa luźna z ugiętym kolanem
    limb([(370, 548), (364, 620), (360, 700), (352, 790), (346, 872)], [60, 50, 36, 38, 26])
    limb([(432, 548), (444, 620), (452, 700), (460, 790), (468, 872)], [60, 50, 36, 38, 26])
    # buty z grubą podeszwą
    d.polygon(S(_spline([(330, 858), (360, 856), (366, 884), (364, 904), (318, 906), (318, 890)])), fill=255)
    d.polygon(S(_spline([(454, 858), (484, 856), (494, 884), (506, 904), (456, 906), (452, 886)])), fill=255)
    sil = np.asarray(sil.resize((PWp, PHp), Image.LANCZOS), float) / 255
    # detale wewnątrz sylwetki (tylko jako delikatne jaśniejsze linie): poły kurtki, pas, zwój liny
    det = Image.new("L", (W, H), 0)
    dd = ImageDraw.Draw(det)
    dd.line(S(_spline([(380, 346), (386, 410), (382, 470), (372, 560)], closed=False)), fill=120, width=4 * B)  # poły kurtki
    dd.line(S(_spline([(420, 346), (414, 410), (420, 470), (430, 560)], closed=False)), fill=120, width=4 * B)
    dd.line(S([(356, 494), (450, 494)]), fill=150, width=7 * B)  # pas
    for px_ in (370, 436):
        dd.rectangle(S([(px_ - 9, 498), (px_ + 9, 520)]), outline=110, width=3 * B)
    # zwój liny przez ramię: dwie pętle elipsy obróconej po skosie
    for k, r in enumerate((0, 7)):
        tt_ = np.linspace(0, 2 * np.pi, 120)
        a_ = np.deg2rad(-58)
        ex_ = (88 + r) * np.cos(tt_); ey_ = (30 + r * 0.4) * np.sin(tt_)
        pts = [(404 + ex_[i] * np.cos(a_) - ey_[i] * np.sin(a_), 440 + ex_[i] * np.sin(a_) + ey_[i] * np.cos(a_)) for i in range(len(tt_))]
        dd.line(S(pts), fill=200 - k * 50, width=(7 - k * 2) * B)
    dd.line(S([(362, 266), (434, 262)]), fill=170, width=8 * B)  # opaska z goglami
    dd.ellipse(S([(375, 254), (393, 272)]), outline=220, width=4 * B)
    dd.ellipse(S([(404, 252), (422, 270)]), outline=220, width=4 * B)
    det = np.asarray(det.resize((PWp, PHp), Image.LANCZOS), float) / 255
    # latarnia: korpus i jasny płomień
    lam = Image.new("L", (W, H), 0)
    dl = ImageDraw.Draw(lam)
    dl.line(S([(549, 262), (549, 284)]), fill=255, width=3 * B)
    dl.rounded_rectangle(S([(532, 284), (566, 336)]), radius=8 * B, outline=255, width=5 * B)
    lam = np.asarray(lam.resize((PWp, PHp), Image.LANCZOS), float) / 255
    lamp_c = np.hypot(xs - 549, ys - 312)
    flame = np.exp(-(lamp_c / 10) ** 2)
    lamp_glow = np.exp(-(lamp_c / 70) ** 2) * 0.55 + np.exp(-(lamp_c / 200) ** 2) * 0.25
    # światło na postaci: obrys od prześwitu i ciepło latarni od prawej góry
    edge = np.clip(sil - ndi.gaussian_filter(sil, 3), 0, 1)
    rim = edge * (0.6 + 0.6 * glow)
    lit_side = np.clip((xs - 380) / 160, 0, 1) * np.clip((420 - ys) / 220 + 0.6, 0, 1)
    body = 0.03 + 0.1 * lit_side + det * 0.12
    img = img * (1 - sil) + body * sil + rim * 0.5
    img = img * (1 - lam) + 0.3 * lam
    img += lamp_glow * 0.55 + flame * 0.9
    # --- odbitka: tonowanie sepia, ziarno, winieta, zagięcie, rysy, plamy
    img = ndi.gaussian_filter(img, 0.8)
    img = 1 - np.exp(-img * 1.6)  # miękkie światła jak na starym papierze
    vign = 1 - 0.55 * (np.hypot((xs - 400) / 400, (ys - 500) / 500) ** 2.2)
    img *= np.clip(vign, 0.25, 1)
    img += (fbm(PHp, PWp, 0.6, 1805) - 0.5) * 0.12  # ziarno
    img = 0.08 + img * 0.88  # spłaszczone czernie, wyblaknięcie
    fold = np.exp(-((ys - 440 - (xs - 400) * 0.04) / 3) ** 2) * 0.2
    img = img * (1 - fold) + fold * 0.95
    sc = crack_mask(PHp, PWp, 12, rng, length=(40, 260), width=0.9, wrap=False)
    img = img * (1 - sc * 0.35) + sc * 0.35 * 0.95
    stain = smooth(0.6, 0.85, fbm(PHp, PWp, 2.2, 1806))
    img *= (1 - stain * 0.18)
    sepia_hi = np.array([244, 226, 192.0]); sepia_lo = np.array([46, 30, 20.0])
    rgb = sepia_lo + (sepia_hi - sepia_lo) * np.clip(img, 0, 1)[..., None]
    # --- rama odbitki z podpisem odręcznym
    M, MB = 46, 190
    FW, FH = PWp + 2 * M, PHp + M + MB
    paper = np.zeros((FH, FW, 3)) + np.array([226, 214, 188.0])
    pyy, pxx = np.mgrid[0:FH, 0:FW].astype(float)
    paper *= (0.9 + 0.12 * fbm(FH, FW, 1.4, 1807)[..., None])
    paper *= (1 - 0.25 * smooth(0.62, 0.85, fbm(FH, FW, 2.4, 1808)))[..., None]  # zażółcenia
    paper[M:M + PHp, M:M + PWp] = rgb
    pim = Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8))
    pd = ImageDraw.Draw(pim)
    ink = (52, 40, 34)
    # pismo: litery z lekkim rozrzutem wysokości, żeby nie wyglądało jak druk
    def scrawl(text, x, y, size, tilt):
        f = _font(size)
        for ch in text:
            jit = rng.normal(0, size * 0.04)
            pd.text((x, y + jit), ch, font=f, fill=ink)
            x += pd.textlength(ch, font=f) * (0.96 + rng.uniform(-0.04, 0.05))
            y += tilt
    scrawl("Wera, ruina siódma", M + 20, M + PHp + 34, 64, -0.5)
    scrawl("jeśli to czytasz — idź za światłem", M + 40, M + PHp + 112, 40, -0.3)
    paper = np.asarray(pim, float)
    # zagięty róg (prawy dolny) i postrzępione brzegi
    corner = (pxx + pyy) > (FW + FH - 150)
    paper = np.where(corner[..., None], paper * 0.72, paper)
    torn = (pxx + pyy) > (FW + FH - 70)
    alpha = np.ones((FH, FW))
    alpha = np.where(torn, 0, alpha)
    ragged = fbm(FH, FW, 1.0, 1809)
    border = np.minimum(np.minimum(pxx, FW - 1 - pxx), np.minimum(pyy, FH - 1 - pyy))
    alpha *= smooth(0, 3 + ragged * 5, border)
    # --- na decal: obrót, wymiar ~0,46 × 0,6 komórki, miękki cień pod spodem
    D = 512
    scale = 0.46 * D / FW
    ph = Image.fromarray(np.dstack([np.clip(paper, 0, 255), alpha * 255]).astype(np.uint8), "RGBA")
    ph = ph.resize((int(FW * scale * 2), int(FH * scale * 2)), Image.LANCZOS)
    ph = ph.rotate(-17, resample=Image.BICUBIC, expand=True)
    big = Image.new("RGBA", (D * 2, D * 2), (0, 0, 0, 0))
    ox, oy = (D * 2 - ph.width) // 2 + 30, (D * 2 - ph.height) // 2 + 10
    shadow = Image.new("RGBA", big.size, (0, 0, 0, 0))
    sh_a = ph.split()[3].point(lambda v: int(v * 0.55))
    shadow.paste(Image.new("RGBA", ph.size, (18, 12, 8, 255)), (ox + 10, oy + 14), sh_a)
    shadow = shadow.filter(ImageFilter.GaussianBlur(9))
    big = Image.alpha_composite(big, shadow)
    big.alpha_composite(ph, (ox, oy))
    out = big.resize((D, D), Image.LANCZOS)
    out.save(os.path.join(OUT, "egg_photo.webp"), "WEBP", quality=90, method=6, alpha_quality=100)
    # podgląd samej odbitki (do dokumentacji, nie do gry)
    Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8)).resize((FW // 2, FH // 2), Image.LANCZOS).save(os.path.join(OUT, "_egg_preview.jpg"), quality=85)
    return out


if __name__ == "__main__":
    which = sys.argv[2:] or ["space", "planet", "hall", "floor", "ceiling", "gate", "photo"]
    if "space" in which: save("space.webp", space_tex())
    if "planet" in which: planet_tex()
    if "hall" in which: save("hall_wall.webp", hall_wall())
    if "floor" in which: save("hall_floor.webp", hall_floor())
    if "ceiling" in which: save("hall_ceiling.webp", hall_ceiling())
    if "gate" in which: save("hall_gate.webp", hall_gate())
    if "photo" in which: egg_photo()
    print("ok")
