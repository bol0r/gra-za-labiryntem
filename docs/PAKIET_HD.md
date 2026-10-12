# Pakiet HD — Za labiryntem

Pliki idą do `public/tex/hd/`. Wszystkie są PNG, potęga dwójki, ściany i podłoga kafelkują się bez szwów.

| Plik | Rozmiar | Zastępuje w `render.js` | Uwagi |
|---|---|---|---|
| `wall_a.png` … `wall_d.png` | 512×512 | `textures[0..3]` (stoneTex 1–4) | u = `hit.wallX`, v = 0 góra ściany → 1 styk z podłogą. Kafelkują się w poziomie. |
| `seal.png` | 512×512 | `textures[4]` (sealTex) | Zapieczętowane przejście: płyta w ramie, miedziany pierścień, bursztynowe szewrony. |
| `rune.png` | 512×512 | `textures[5]` (runeTex) | Fryz z trzema rytymi glifami z bursztynową inkrustacją i rząd drobnych znaków. |
| `floor.png` | 512×512 | `textures[6]` (floorTex) | **Jeden kafel = 2×2 komórki labiryntu.** Kafelkuje się w obu osiach. |
| `sky.png` | 4096×1024 | niebo, gwiazdy i krąg planety rysowane w pętli `above` | Panorama: x = azymut 0–360°, y = wysokość kątowa 90° (góra) → 0° (dół, horyzont). Kafelkuje się w poziomie. Jest na niej mały księżyc. |
| `planet.png` | 768×768 RGBA | miedziany krąg (`pcx = w * 0.7`) | Gazowy olbrzym z pierścieniem. Środek obrazka = środek tarczy, promień tarczy = 168 px. |

## Jak podpiąć

1. **Ładowanie.** Na starcie, jeśli opcja HD jest włączona, wczytaj pliki przez `Image` → offscreen canvas → `getImageData`. Dopóki się nie wczytają albo gdy się nie wczytają, zostają obecne tekstury proceduralne. Rozmiar trzymaj per tekstura (`tex.size`), nie w stałej `TEX`.
2. **Mipmapy.** Przy wczytaniu zbuduj poziomy 512 → 256 → 128 → 64, uśredniając 2×2. Bez tego daleka ściana i podłoga będą migotać.
   - ściana: `lvl = clamp(floor(log2(512 / line)), 0, 3)`, gdzie `line` to wysokość słupka ściany na ekranie,
   - podłoga: `lvl = clamp(floor(log2(max(1, 256 * dist / focal))), 0, 3)`.
3. **Próbkowanie bez alokacji.** `texAt` zwraca teraz tablicę `[r, g, b]` na każdy piksel. W HD niech zwraca indeks do bufora albo pisze w trzy zmienne modułu, bo przy 512 px i mipach liczy się każdy GC.
4. **Podłoga.** W HD: `u = wx * 0.5`, `v = wy * 0.5` (zamiast `0.55`). Usuń przyciemnianie siatki komórek (`fx < 0.04 || fy < 0.04`), bo tekstura ma własne spoiny. To one robiły pomarańczową kratkę.
5. **Światło w HD: mnożenie zamiast dodawania.** Obecna podłoga dodaje `glow * 150` czerwieni i dlatego jest pomarańczowa i płaska. W HD:
   - `lamp = fall * cone * flick` (dla ściany razy `vsoft`, jak teraz),
   - `kolor = tex * (0.16 + 1.05 * lamp * warm) * side`, gdzie `warm = (1.0, 0.86, 0.68)`,
   - mgła bez zmian, kolor mgły `(70, 50, 34)`.
   Minimalne światło ściany 0,25 zamień na otoczenie 0,16, bo tekstury mają już wypalone cienie i AO.
6. **Niebo.** Dla każdego piksela nad horyzontem:
   - `az = aim + atan((x - w/2) / focal)` → stopnie, zawinięte do 0–360 → `sx = az / 360 * 4096`,
   - `el = atan((horizon - y) / focal)` → stopnie → `sy = (90 - el) / 90 * 1024`.
   Wtedy niebo i księżyc są przypięte do świata i przesuwają się przy obrocie.
7. **Planeta.** Rysowana w tej samej pętli nieba, przed ścianami, żeby ściany ją zasłaniały. Azymut 40°, wysokość 13°, promień kątowy 6,5°:
   - `pu = (azDelta / 6.5) * 168 + 384`, `pv = -((el - 13) / 6.5) * 168 + 384`, gdzie `azDelta` to różnica azymutów zawinięta do −180…180,
   - mieszanie przez alfę z `planet.png`.
   To zamyka punkt 5 z planu: „planeta w świecie”.
8. **Przełącznik.** W menu i w ustawieniach dodaj „Pakiet HD: wł./wył.”, zapisany w `localStorage` (`zl-hd`). Domyślnie włączony. Automatyczne obniżanie rozdzielczości płótna działa dalej w obu trybach. Na telefonie sprawdź FPS przy 390 px.

## Pomysł do decyzji

Planeta stoi w stałym azymucie świata, więc działa jak kompas. Kartograf może powiedzieć: „idź tak, żeby planeta była po lewej”. Jeśli generator ustawi jej azymut mniej więcej w kierunku serca od startu, dostajecie podpowiedź z samego świata, bez nowej mechaniki. To decyzja projektowa, nie techniczna.

## Prompt dla Cursora

```
Pakiet HD: w public/tex/hd/ leżą tekstury PNG i opis docs/PAKIET_HD.md. Podepnij je dokładnie według sekcji „Jak podpiąć”: ładowanie z zapasem proceduralnym, mipmapy, próbkowanie bez alokacji, podłoga 2×2 komórki bez siatki, światło mnożone w HD, niebo z panoramy po azymucie i wysokości, planet.png w świecie (azymut 40°, wysokość 13°, promień 6,5°), przełącznik „Pakiet HD” w menu zapisany w localStorage. Tryb bez HD ma wyglądać jak dziś. Nie zmieniaj protokołu ani zasad. Sprawdź FPS na 390 px i na komputerze, konsola czysta, commit osobno, wpis w docs/PROGRESS.md.
```

## Panel kartografa (osobny etap)

Wzór: `docs/makieta-panelu.html` (otwórz w przeglądarce, przyciski po prawej przełączają stany).

```
Przebuduj panel kartografa na telefonie według docs/makieta-panelu.html. Te same dane co w updatePanel, protokół bez zmian. Górny pasek z okrągłymi ikonami (wycisz, pomoc, menu), mapa wyśrodkowana w wolnym miejscu, pod nią tablica: oko strażnika w kolorze stanu z pulsowaniem przy Czuwa i Pościg, nazwa stanu Palatino, 14 segmentów przebudzenia (progi 0,12 i 0,55), pieczęcie jako bursztynowe heksagony, klucz i punkty, belka „Drzwi gotowe”. Zawołania 3×2: Lewo, Stój, Prawo / Cicho, Biegnij, Zasłona jako okrągły przycisk z pierścieniem odnowienia. Wciśnięcie 3 px, bursztynowy obrys, napis „Wysłano · …”, wibracja 18 ms. Desktop z panelem obok mapy zostaje, ale w tym samym stylu. Sprawdź 360 i 390 px, czysta konsola, osobny commit.
```

## Menu, Opcje i HUD latarnika (kolejny etap)

Wzór: `docs/makieta-menu/index.html` (otwórz w przeglądarce; zakładki Menu, Opcje, Graj, Latarnik; przyciski pod ekranem pokazują stany HUD).

```
Etap D — menu i HUD latarnika według docs/makieta-menu/index.html. Protokół i zasady bez zmian, UI po polsku, pad i klawiatura jak dziś.
1. Menu główne: tło z public/tex/hd/sky.png przesuwane powoli w poziomie, planet.png, sylweta ruiny na dole, drobny kurz. Tytuł „Za labiryntem” wypełnia się bursztynem raz po wejściu. Pozycje: Graj, Opcje, Fabuła, Tablica, Twórcy; fokus to bursztynowy romb i podpis pozycji. Płyta „Najgłębiej” z pierwszym miejscem z /tablica. Na dole podpowiedzi pada (A Wybierz, B Wróć) i adres drugiego ekranu. Gdy tekstury HD są wyłączone, tło jak dziś.
2. Opcje (z etapu A) w stylu makiety: kamienna płyta, przełączniki z bursztynową gałką, suwak głośności.
3. Graj: dwie karty ról z ilustracją i pole kodu z czterema komórkami.
4. HUD latarnika: lewy górny róg ruina, czas, łup (klucz, odłamki, punkty). Zawołanie kartografa duże, na środku u góry, ze słowem i ikoną, ~1,8 s, zamiast toastu. Nasłuch pokazuje półokrąg z klinem w stronę strażnika i tekst „Blisko · Z lewej”. Nasłuch i Stuk jako okrągłe przyciski z pierścieniem odnowienia (4 s, 4,5 s), Bieg największy, z etykietami klawiszy. Zebranie łupu: „+10 · Odłamek” unoszące się nad środkiem. Strażnik bliżej niż 3,4: zielone pulsowanie krawędzi ekranu. Na telefonie te same elementy w rogach, Bieg pod prawym kciukiem, bez legendy klawiszy.
Sprawdź 1280×720, 390 px w poziomie i w pionie, pad, czysta konsola. Osobny commit, wpis w docs/PROGRESS.md.
```
