# Za labiryntem

Asymetryczna gra na dwóch graczy w przeglądarce. Jedna osoba jest w ciemnym labiryncie obcej cywilizacji i ma tylko latarkę. Druga widzi ruinę z góry i ją prowadzi. Na końcu jest serce ruiny. W korytarzach chodzi strażnik.

## Stack

- Node.js, ES modules, bez bundlera.
- `express` serwuje `public/` i `shared/`.
- `ws` trzyma pokoje w pamięci procesu.
- `qrcode` robi kod QR do wejścia z telefonu.
- Klient to zwykły HTML, CSS i canvas 2D. Fizyka labiryntu jest w `shared/sim.js` i używają jej serwer oraz przeglądarka.

## Jak uruchomić

```bash
npm install
npm start
```

Serwer słucha na `0.0.0.0`, domyślnie port `8787` (`PORT` w środowisku go zmienia). W terminalu wypisze adres dla komputera i adres w sieci lokalnej.

- Komputer, który uruchomił serwer: `http://localhost:8787`
- Telefon: adres IP z terminala, na przykład `http://192.168.1.219:8787`

Oba urządzenia muszą być w tej samej sieci Wi-Fi. Telefon nie wejdzie na `localhost` komputera. Przy pierwszym starcie macOS może zapytać, czy pozwolić Node na połączenia przychodzące.

Gra stoi na Render (`render.yaml`, plan Free). Tam adres `onrender.com` przychodzi sam w `RENDER_EXTERNAL_URL`, a `GET /zdrowie` jest dla budzika. Na innym hostingu ustaw `PUBLIC_URL` (na przykład `https://labirynt.deadnet.ovh`). Wtedy kod QR, adres drugiego ekranu i `GET /siec` biorą ten adres zamiast sieci lokalnej. Serwer musi działać w jednej instancji, bo pokoje są w pamięci.

Na komputerze wybierz **Przy mapie**. Na telefonie zeskanuj kod QR albo wpisz cztery znaki. Potem **Zejdźcie**.

Sprawdzenie labiryntu bez przeglądarki: `npm run check`. Dwa klienty WebSocket: `node server/smoke.js 8787` przy działającym serwerze.

## Zasady pracy

1. Najpierw plan, potem kod. Przy większej zmianie mechaniki napisz krótko, co ruszasz i po co, zanim edytujesz pliki.
2. Commit po każdym etapie. Nie mieszaj w jednym commicie nowej mechaniki z porządkiem w dokumentacji, jeśli da się je rozdzielić.
3. UI po polsku. Napisy, które widzi gracz, są po polsku. Nie zostawiaj angielskich etykiet w lobby, na mapie ani u latarnika.
4. Nie zmieniaj kodu gry przy samej aktualizacji `AGENTS.md` i `docs/`, chyba że o to wyraźnie poproszono.
5. Do wydania 1.0 robimy tylko punkty z `docs/WYDANIE_1.0.md`. Nowy pomysł dopisz do sekcji „Po 1.0” w tym pliku i nie ruszaj przez niego kodu. Odhaczony punkt to `[x]` w tym samym commicie co zmiana.

Stan koncepcji, dziur i decyzji jest w `docs/BRIEF.md`, `docs/DZIENNIK.md` i `docs/DECYZJE.md`. Co wchodzi do wydania 1.0, jest w `docs/WYDANIE_1.0.md`; starsza kolejka po testach jest w `docs/DALEJ.md`.
