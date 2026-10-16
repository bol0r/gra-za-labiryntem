# Decyzje

## Współpraca asymetryczna, nie dwie takie same postacie

Telefon i komputer mają inne ekrany i inne sterowanie. Latarnik ma mało informacji i dobry ruch. Kartograf ma całą mapę i nie chodzi. Dzięki temu druga osoba jest potrzebna, a nie tylko drugim awatarem w tym samym korytarzu.

## Cel rundy: serce ruiny i strażnik

Wybrane zamiast zagadek, przesuwanych ścian i zdrady przy skarbie. Napięcie ma iść z pościgu i z tego, że jeden widzi, a drugi nie. Pieczęcie są skrótem, nie zagadką obowiązkową, żeby runda nie stawała się łamigłówką.

## Serwer lokalny, ta sama sieć

Nie ma publicznego przekaźnika. Mniej zależności i da się grać bez konta. Koszt: telefon musi być w Wi-Fi komputera, a restart procesu kasuje pokoje. QR prowadzi na adres LAN z `?pokoj=`, żeby nie przepisywać IP i kodu osobno.

## Canvas 2D i własny raycaster, bez silnika

Ma działać w przeglądarce telefonu bez builda i bez ściągania assetów. Mapa kartografa jest rysowana wektorowo. Latarnik dostaje klasyczny raycast na siatce ścian. Tekstury powstają w kodzie. Wygląd korytarza jest przez to prostszy niż scena 3D, za to nie ma pipeline’u modeli.

## Jedna fizyka w `shared/sim.js`

Serwer i klient importują ten sam moduł: kolizje, krok latarnika, raycast, linia widzenia, ścieżka. Dzięki temu „da się tu stanąć” znaczy to samo po obu stronach. Generacja labiryntu zostaje tylko na serwerze (`server/maze.js`), strażnik też (`server/sentinel.js`).

## Pozycja latarnika idzie z klienta, z limitem

Latarnik symuluje ruch u siebie i wysyła pozycję. Serwer przyjmuje ją, jeśli nie wchodzi w ścianę i nie przeskakuje szybciej niż bieg. Głośność (cisza, chód, bieg) liczy się z rzeczywistego przesunięcia, nie z flagi „biegnę”. Ma być czuły ster na telefonie. To nie jest zabezpieczenie turniejowe.

## Słabsze stwory obok jednego łowcy

W komorze zostaje jeden łowca, taki jak dotychczas. Obok niego chodzą dwa albo trzy słabsze stwory, po stałych trasach, nie zamiast niego. Są wolniejsze. Gubią ślad, gdy latarnik zniknie im z oczu albo stanie. Nie zamykają przejścia i nie da się z nimi walczyć. Rundę kończy tylko łowca, gdy dogoni.

## Strażnik czyta hałas, nie ma minimapy u latarnika

Cisza: krótki wzrok, zero słuchu. Chód: średni wzrok, słuch tylko z bliska. Bieg: daleki wzrok i słuch przez ściany. Latarnik nie dostaje kierunku do serca ani mapy. Bliskość strażnika słychać i widać na winiecie. Kierunek daje kartograf.

Winieta zapala się wcześniej, gdy strażnik czuwa, szuka albo goni i jest bliżej niż około 7. Bez kierunku. Poniżej około 3,4 pulsuje jak przedtem. Obchód jej nie włącza, bo wtedy znak paliłby się przy zwykłym mijaniu i nie dałoby się na nim stanąć. Pościg dochodził do korytarza dopiero jako sylwetka w snopie.

## Budzenie ruiny zamiast zegara porażki

Budzenie idzie od postępu po drodze do serca i zaczyna się około połowy trasy. Zegar około 110 s jest górną granicą ciszy: co nastąpi pierwsze. Potem strażnik przyspiesza i lepiej wyczuwa, aż do pełnego pobudzenia. Stanie w miejscu po tym czasie przestaje być bezpieczne. Nie ma osobnego „czas minął”.

## Rozmiar labiryntu rośnie po wygranej

Żar 0, 1, 2 to siatki 15, 19 i 21. Przegrana cofa żar o jeden. Pierwsza komora ma być do nauczenia, kolejne dłuższe. Sam marsz optymalną ścieżką jest krótszy niż docelowe 3–5 minut; zapas czasu jest na gadanie i chowanie się.

## UI po polsku, bez zewnętrznych fontów

Tekst gracza jest po polsku. Fonty to Palatino i font systemowy, żeby lobby nie zależało od sieci przy starcie.

## Brak głosu w protokole

Dwie osoby i tak mają telefon albo siedzą obok. Zamiast mikrofonu w przeglądarce są pięć krótkich znaków i klikany kierunek. Mniej uprawnień, działa przy wyciszonym mikrofonie.

## Cisza na starcie żaru 0

Dłuższa odporność odpada. `immunity` blokuje też złapanie, więc przez 24 s dało się przejść łowcy przez nos, a ślepy bieg bez kartografa wygrywał 28 z 40. Pierwsza komora ma uczyć, że mapa jest potrzebna.

Na żarze 0 jest osobne `silence`, 10 s: łowca nie widzi i nie słyszy, dotyk zabija po 2,4 s jak wszędzie. Słuch biegu na żarze 0 to 0,6. Żar 1 i 2 bez zmian. Marsz został przy 15 z 40. Te same 40 nasion, siatka 15:

| Okno | Bieg, wygrane | Śmierci do 25 s |
| --- | --- | --- |
| dziś | 5/40 | 35 |
| 10 s, słuch ×0,6 | 16/40 | 20 |
| 18 s, słuch ×0,6 | 21/40 | 13 |

## Zamiana ról tylko w lobby

„Zamieńcie się” działa wyłącznie przed zejściem, gdy oboje są w lobby. W komorze zamiana nic nie robi, bo latarnik już stoi w korytarzu, a kartograf ma mapę tej komory.
