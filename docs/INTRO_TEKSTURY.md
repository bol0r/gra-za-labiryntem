# Tekstury intra i easter egg

Intro (`public/intro.js`, 21 s) ma dwie sceny: kosmos z planetą (0–8,6 s) i przelot korytarzem do serca (7,4–21 s). Wcześniej obie były rysowane płaskimi czworokątami. Teraz, gdy tekstury doszły i „Tekstury HD” są włączone (`zl-hd`), planeta i sala są liczone piksel po pikselu w buforze o obniżonej rozdzielczości, a potem skalowane na ekran. Bez tekstur zostaje dawne płaskie intro. Przejście z płaskiego na teksturowane to przenikanie przez 0,45 s.

Pliki: `public/tex/intro/*.webp`, razem ~275 KB. Robi je `python3 docs/intro_generator.py public/tex/intro` (korzysta z szumu w `pakiet_hd_generator.py`). Adres ma `?v=TEX_VER` (`intro.js`), a serwer trzyma `/tex/` w cache na rok, więc **po zmianie plików podbij `TEX_VER`**.

## Gdzie co leży

| Plik | Rozmiar | Scena i czas | Mapowanie |
|---|---|---|---|
| `space.webp` | 2048×1024 | kosmos, 0–8,6 s | Plansza za planetą. Zakrywa ekran z zapasem, obrót kamery ją przesuwa, nurkowanie przybliża o 10%. Dawne migające gwiazdy zostają na wierzchu, przygaszone. |
| `planet_surface.webp` | 1024×512 | kosmos | Mapa równoprostokątna. Środek mapy (u = 0,5, v = 0,62) to **labirynt widziany z orbity**: prawdziwy labirynt 15×15 wyryty w skale. `LON0` w `intro.js` ustawia go na środku tarczy w 5,9 s (`SCAR_T`), w środku nurkowania. |
| `planet_glow.webp` | 1024×512 | kosmos | Maska świecenia labiryntu i serca w nim. Bursztyn rozpala się od 2,6 s („ruina się budzi”), pulsuje i jest mocniejszy po nocnej stronie. |
| `hall_wall.webp` | 1024×512 | sala | Jedno przęsło: 5,12 × 2,62 jednostki, od pilastra do pilastra. Od góry: gzyms, rząd z uchwytem pochodni (u = 0,5625, y = 1,62, tam gdzie płomień), fryz z czterema glifami w bursztynie, rząd, cokół. Ta sama tekstura na obu ścianach: po lewej uchwyty są zgaszone. |
| `hall_floor.webp` | 512×512 | sala | Cała szerokość korytarza (2,48) × 2,48 długości. Środkiem biegnie miedziana inkrustacja z szewronami w stronę serca. |
| `hall_ceiling.webp` | 512×512 | sala | Kasetony 2×2 z rozetą, korzenie, zacieki. |
| `hall_gate.webp` | 512×512 | sala, koniec (z = 34,6) | Brama serca: łuk z klinów, wnęka z miedzianymi kręgami, kolumny glifów, bursztyn sączący się ze spoin. Serce wisi przed nią (z = 33,05). |

Światło sali jest to samo co w `hallLight` (latarnia przy kamerze, serce, mgła do czerni), tylko niższe, bo tekstury są jaśniejsze od dawnych kolorów. Doszły pochodnie: każda świeci na ścianę i posadzkę wokół siebie i migocze jak jej płomień. Plama latarni na posadzce znika w trybie z teksturami, bo światło liczy się na samej posadzce. Poziomy mip (1/2, 1/4, 1/8) dobierane z odległości i kąta padania, żeby daleka posadzka nie migotała.

Budżet bufora sam się dobiera (50–230 tysięcy pikseli): schodzi, gdy sala rysuje się dłużej niż 8 ms, i wraca, gdy jest zapas. Chromium bez okna, 1280×720, cały przebieg 0–21 s: średnio 5,1 ms na klatkę.

## Easter egg: zdjęcie Wery

`public/tex/hd/egg_photo.webp` (512×512 RGBA = jedna komórka podłogi). Wyblakła odbitka w sepii leży na posadzce **jednego ślepego zaułka** w każdym labiryncie. Na zdjęciu jest Wera, latarniczka sprzed was: w łuku ruiny, pod światło, z uniesioną latarnią, liną przez ramię i goglami na czole. Na marginesie odręcznie: „Wera, ruina siódma / jeśli to czytasz — idź za światłem”. Postać jest wymyślona na potrzeby gry.

- Zaułek wybiera `eggCell` w `render.js`: komórka z jednym wyjściem, bez startu i serca, stała dla danego labiryntu (z rozmiaru, startu, serca i długości trasy), więc w każdej rundzie gdzie indziej.
- Zdjęcie jest na środku komórki, obrócone tak, że podpis leży od strony wejścia i czyta się od lewej do prawej. Widać je z wejścia do zaułka, w dole kadru.
- Tylko w trybie HD i tylko u latarnika. Kartograf go nie widzi na mapie, to rzecz do znalezienia w korytarzu.

## Pomysły na dalej

- Kartograf mógłby dostać jedno zdanie, gdy latarnik stanie nad zdjęciem („Coś leży na podłodze”). To już mechanika, więc zostawiam do decyzji.
- Wera może wrócić w fabule (menu „Fabuła”): kim była, czemu nie wróciła.
