# Dziennik

Najnowsze wpisy są na górze. Co dalej robić, jest w `docs/DALEJ.md`. Szczegóły polerowania są w `docs/PROGRESS.md`.

## 2026-10-15

Drugi test przy ludziach. Mariusz przyszedł drugi raz, z nim Pawełek. Bartek nie zdążył. Mariuszowi podziękowanie za ten test i za to, że najbardziej ciągnie grę dalej. Pawełek wchodzi do testerów.

Z testu do wdrożenia idą: pad (Nasłuch i Stuk, nie sam bieg), dźwięk który zniknął, więcej rozwidleń, czytelne pieczęcie i łup, dwa zawołania więcej, kilka słabszych stworów na stałych trasach. Zostaje QR, asymetria i krótkie znaki zamiast gadania w grze. Nie idą: zamiana ról w rundzie, boss, wajcha kasująca strażnika, klik w każdą cegłę, głos w protokole. Kolejka jest w `docs/DALEJ.md`.

Tekstury ścian są w commitach `65a64f0` i `4c2a386`: wspólna spoina, WebP, cache `/tex/`. Menu i HUD latarnika są w `b1ceaf3` (`public/client.js`, `public/index.html`, `public/styles.css`). `paintDust` jest w tym samym `client.js`. Serwer wstały przed tym cache trzeba zrestartować, żeby `/tex/` dostał roczny nagłówek.

## 2026-10-07

Powstała gra **Za labiryntem**: dwie przeglądarki, kod pokoju, ruiny na obcej planecie.

Ustalenia z Aleksandrem, zanim powstał kod: współpraca asymetryczna (telefon w ciemności, komputer przy mapie), cel to relikwia i coś, co goni, klimat ruin nieznanej cywilizacji, runda kilka minut i od razu następna, wejście czteroznakowym kodem.

Złożone:

- serwer `express` + `ws`, pokoje w pamięci, kod QR z adresem lokalnym;
- wspólna fizyka w `shared/sim.js` (ściany, ruch, raycast, ścieżka);
- generator labiryntu, strażnik, pieczęcie, zasłona, znaki kartografa;
- lobby po polsku, mapa kartografa, widok latarnika, dźwięk z Web Audio.

Sprawdzone: `npm run check`, test dwóch klientów WebSocket, przejście lobby → komora w dwóch kartach przeglądarki. Ruch latarnika widać na mapie. Zawołanie „Stój” dochodzi na drugi ekran.

Po drodze: pierwsze `npm start` w sandboxie padło na `os.networkInterfaces`. Odczyt adresów jest teraz w `try/catch`, a działający serwer wystartował poza sandboxem. Raycaster po wygładzaniu tekstur robił się mgłą; wrócił ostry odczyt teksela i grubsza inkrustacja. Ustawianie `canvas.width` przy każdym `ResizeObserver` czyściło kadr; szerokość zmienia się tylko, gdy naprawdę rośnie lub maleje. Tekstura pieczęci odwoływała się do nieistniejącego `grain` i potrafiła wywalić rysowanie; to jest poprawione.

Świadomie nietknięte w tym wpisie: sam kod gry przy zapisie dokumentacji.
