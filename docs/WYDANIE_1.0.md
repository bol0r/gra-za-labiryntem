# Wydanie 1.0

Termin: 1 listopada 2026.

Do wydania robimy tylko to, co jest na tej liście. Nowy pomysł dopisujemy do „Po 1.0” na dole i nie ruszamy przez niego kodu. Gra jest kompletna jako runda; brakuje jej wyjścia z piwnicy do internetu i opakowania.

## 1. Gra w internecie

- [x] `PUBLIC_URL` w środowisku. Gdy jest ustawiony, kod QR, `joinUrl` i `GET /siec` biorą adres z niego. Bez niego zostaje sieć lokalna jak dziś.
- [x] Napisy zależne od sieci mówią prawdę w obu trybach: „Ten sam Wi-Fi, ta sama piwnica.” i „Zostańcie przy tym komputerze.”.
- [x] Hosting z WebSocketami, dokładnie jedna instancja, bo pokoje są w pamięci procesu.
  Render, plan Free (`render.yaml`), Frankfurt. Budzik z cron-job.org co 10 min na `/zdrowie`, bo darmowy serwis zasypia po 15 min. Tablica zeruje się przy restarcie. Działa od 16 października 2026 pod `https://za-labiryntem.onrender.com`, telefon wszedł przez LTE.
- [ ] Budzik co 10 min na `/zdrowie`.
- [ ] Subdomena z HTTPS, na przykład `labirynt.deadnet.ovh`.

## 2. Serwer na publicznym adresie

- [x] `maxPayload` w `WebSocketServer` rzędu kilku KB. Dziś domyślne 100 MB.
- [x] `create` zamyka poprzedni pokój tego samego połączenia. Górny limit pokojów na proces (300).
- [x] Heartbeat ping/pong co około 10 s. Zablokowany telefon nie może długo udawać, że jest online.
- [x] Tablica: jedna wygrana daje jeden wpis. Blokada na pokój i rundę, nie na gracza.
- [x] Rozłączenie przy płycie wyniku przechodzi w czekanie, jak w trakcie rundy, zamiast wysyłać lobby.
- [x] Prosty filtr imion na tablicy.

## 3. Pierwsza komora

- [ ] Żar 0 wybacza więcej: dłuższa odporność albo wolniejszy łowca. W `runs.jsonl` 6 z 8 rund to przegrana, kilka po 15–23 s.
- [ ] Kartograf raz dostaje podpowiedź o zasłonie. Zasłona: 0 użyć na 8 rund.

## 4. Testy z obcymi

- [ ] Dwie albo trzy pary, które nie widziały gry, przez internet. Nic nie tłumaczymy, patrzymy, gdzie się gubią.
- [ ] Poprawiamy tylko to, co blokuje dojście do serca albo wejście do pokoju.

## 5. Opakowanie

- [ ] Trailer 60–90 s: laptop i telefon obok siebie.
- [ ] Wprost na stronie i w README: da się grać samemu, laptop jest latarnią, telefon mapą.
- [ ] README: GIF, link do gry, jak zagrać, autor z kontaktem.
- [ ] Tagi Open Graph i obrazek do udostępnień.
- [ ] Case study: jak gra powstała, z `DZIENNIK.md`, `DECYZJE.md` i `PROGRESS.md`.

## 6. Wydanie

- [ ] Tag `v1.0` na `master`.
- [ ] Post z trailerem i linkiem.
- [ ] Zamrożenie: dalsze zmiany dopiero z listy „Po 1.0”, po wydaniu.

## Po 1.0

Druga strona teczki. Znak na tablicy. „Schodzimy we troje”. Komora 110. Wersja angielska. Podział `client.js` na moduły. Automat albo bot zamiast kartografa. Jedno okno na obie role. Kolejne przebiegi po menu, intrze i teksturach. Zapis tablicy poza dyskiem procesu.
