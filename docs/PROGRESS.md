# Postęp polerowania

Gałąź `polish-1`. Kierunek wizualny (kamień, popiół, miedź, bursztyn) zostaje. Zasady rundy, sieć i protokół bez zmian.

## Zrobione

### Intro bez nazw

W twórcach zostaje jedna linia „Dead Net Lab”. Zeszły imię, nazwisko, Claude i Grok. Testerzy zostają. Intro schodzi od klawisza (sam modyfikator nie), od kliknięcia w kadr i od A na padzie. A nie odpala „Graj”.

Sprawdzone: `npm run check`. `node server/smoke.js` na porcie 8797, pokój Y85W. Dwie karty, pokój L8G2: Escape i spacja schodzą z intra, klik w płótno też, sztuczny pad A zostawia menu. Kartograf i latarnik doszli do „Można schodzić.” i weszli w korytarz. Serwer bez błędu, kadr latarnika się rysuje.

### 0. Układ płytek kartografa

Pięć zawołań jest w jednym rzędzie od 360 px w górę. „W prawo” nie wychodzi poza ekran, napis się nie ucina. Zasłona kończy się w panelu (12 px od krawędzi przy 360 i 390). Sprawdzone w grze: 360×740, 390×844, 1280×800. Widok latarnika bez zmian.

### 1. Strażnik i pieczęcie u latarnika

W zasięgu wzroku strażnik jest zieloną sylwetką z poświatą, pieczęć bursztynowym blaskiem na ścianie. Ściana zasłania (raycast i bufor głębokości). Od około 10 jednostek znikają we mgle. Sprawdzone klatki: sylwetka w korytarzu, blask na klamrze z dystansu, pieczęć za rogiem się nie rysuje. Konsola czysta.

### 2. Ruch

Krok lekko kołysze horyzontem (wyłączone przy reduced motion). Obrót z myszy, palca i strzałek schodzi do celu w około trzech klatkach, zamiast skoku. Latarnia migocze nieregularnie, w granicach kilku procent. Pozycja i kąt wysyłane na serwer to nadal wynik symulacji. Sprawdzone: obrót zmienia kadr, chód nie sypie konsoli, korytarz przy 390 px zostaje czytelny.

### 3. Atmosfera

W snopie latarni unoszą się drobinki kurzu. Na kadrze leży rzadkie ziarno, rysowane poza pętlą promieni, i trochę głębsza winieta. Konsola czysta. Na 390 px widać korytarz, kurz i planetę. Napis sterowania nachodzi na „Dźwięk” — zostaje do punktu o telefonie.

### 4. Dźwięk

Krok to tkanina i co drugi raz oddech. W tle niski dron. Zawołanie to jedno ciepłe uderzenie. Wygrana to dwa tony kości. Przegrana opada w szum. Przy strażniku narasta sub-bas, bez piły. Przycisk „Wycisz” gasi całość i zmienia się na „Dźwięk”. Sprawdzone: każda nazwa dźwięku przechodzi bez błędu, przycisk się przełącza, chód nie sypie konsoli.

### 5. Ekrany

Start zostaje na Palatino, z wyborem roli na płytach. Kod pokoju jest duży, z odstępami i dopiskiem „Czytaj po jednej literze”. Czekanie mówi wprost „Czekam na drugą osobę.” Wygrana i przegrana siedzą na tej samej płycie; kicker wygranej jest bursztynowy, przegranej zielony. Lobby, wynik i baner wchodzą przezroczystością. Kod mieści się przy 390 px (16 px zapasu). Konsola czysta.

### 6. Telefon

W trakcie gry strona nie przewija się i nie wychodzi poza krawędź: `touch-action: none`, `user-select: none` (pole kodu zostaje zaznaczalne), `overscroll-behavior: none`, body na cały ekran. Marginesy biorą `safe-area`. Na wąskim panelu znika długi opis i kod pokoju, żeby płytki i zasłona mieściły się bez przewijania. W poziomie panel wraca obok mapy. Napis sterowania zostawia 16 px od „Wycisz”.

Sprawdzone: kartograf 360×740 (brak scrolla strony i panelu, pięć płytek w rzędzie, zasłona w kadrze) i 740×360. Latarnik 390×844, 360×740 i 844×390 (brak scrolla, bieg w kadrze, napis nie nachodzi na wyciszenie). Prawdziwego wcięcia iPhone’a ta przeglądarka nie emuluje; wcięcia są w CSS i włączą się, gdy system je poda.

### 7. Wydajność

Latarnik mierzy czas własnej klatki, nie odstęp między odświeżeniami. Gdy rysowanie trwa średnio ponad 12 ms, bufor płótna schodzi stopniami 0,8 → 0,64 → 0,5. Poniżej 6 ms wraca w górę. Mapa kartografa zostaje ostra. Sprawdzone: w tym oknie korytarz siada na połowie bufora retina i klatka zostaje przy 60; małe okno wraca do pełnej ostrości. Przy 390 px korytarz, pieczęć i kurz zostają czytelne. Konsola czysta.

### 8. Dwie karty

Pokój WBHW na lokalnym serwerze: kartograf „Przy mapie”, latarnik wchodzi kodem. Pełna runda do wygranej i osobna do przegranej, bez zmian zasad ani protokołu.

Wygrana, runda 5: oba ekrany dostały ten sam wynik. Kicker „Komora”, tytuł „Serce ruiny odpowiada.”, czas „1:07 w ruinie”. Potem oba przeszły do rundy 6.

Przegrana, runda 6: znowu ten sam tekst. Kicker „Strażnik”, tytuł „Strażnik zamyka przejście.”, czas „1:23 w ruinie”. Potem oba są w rundzie 7. Mapa i korytarz zostają w tej samej komorze. Konsola obu kart czysta.

Płyta wyniku żyje około pięciu sekund i następna komora startuje sama. Zrzut ekranu złapał już kolejną rundę, ale napis zostawiony w obu dokumentach był identyczny.

### 9. Porządek

Z arkusza zeszły trzy zmienne po starej płycie, których nic już nie czyta: `--ink`, `--plate-top`, `--plate-bot`. Zdublowana reguła `button, input` też. Reszta rysowania, dźwięku i symulacji jest używana. `docs/BRIEF.md` opisuje to, co jest: dźwięk rundy, krąg na niebie, sylwetkę strażnika, tekstury 128×128, płytki od 360 px i sprawdzoną wygraną oraz przegraną na dwóch kartach.

### Planeta u latarnika

Miedziany krąg w prawym górnym rogu nieba to nie obiekt rundy. Brief od początku jest o labiryncie na obcej planecie, a ekran startu ma kicker „Planeta bez nazwy”. Ten sam krąg jest tłem lobby od pierwszego grywalnego commita (7 października 2026, `drawLobby`, gradient nazwany `planet`). W korytarzu jest domalowany w pikselach nieba i stoi w miejscu na ekranie: obrót go nie przesuwa. Polerowanie go nie dodawało. Przy kurzu i winiecie po prostu łatwiej go zobaczyć. Gwiazdy obok to osobny szum tego samego nieba.

### Pad

Latarnik i ekrany wyboru biorą standardowy pad (Gamepad API). Protokół pokoju bez zmian. Doszedł tylko `GET /siec`, żeby start znał adres w sieci. Serwer już słuchał na `0.0.0.0`.

Mapowanie:

- Lewa gałka: krok w przód i w bok. Martwa strefa 0,2, potem wychylenie rośnie do pełnego kroku.
- Prawa gałka, w poziomie: obrót. Ta sama martwa strefa. Cel to kwadrat wychylenia razy 2,4 rad/s i schodzi w około 90 ms, a potem jeszcze płynny obrót kamery.
- RT albo A, przytrzymane w korytarzu: bieg. Na starcie, w lobby i na płycie wyniku A włącza podświetloną rzecz.
- X: wyciszenie.
- Y: pełny ekran. Napis schodzi na „Okno”, gdy ekran jest pełny.
- Menu: następna komora, tylko gdy wisi wynik.
- D-pad: fokus na starcie, w lobby i na wyniku. Góra i lewo cofają, dół i prawo idą dalej. Po przytrzymaniu powtarza się.
- B nie opuszcza strony. Wejście w historię jest dopchnięte, a klawisz B pada jest tłumiony. B nie znaczy „Opuść”.

Gdy pad się pojawi, na dole zostaje „Pad podłączony”. W korytarzu latarnika pod spodem jest ściąga, a napis WASD schodzi. Przy strażniku bliżej niż 3,4 jednostki idzie krótka wibracja (częściej poniżej 1,6). Złapanie daje jeden dłuższy impuls. Pad bez wibracji jest po cichu pomijany.

Start pokazuje „Na innym urządzeniu wpisz” i adres z portem. Gdy interfejs nie ma adresu, zostaje zdanie, żeby zostać na tym komputerze.

Sprawdzone bez fizycznego pada i bez Edge na Xboksie: `navigator.getGamepads` podstawiony sztucznym padem. D-pad przeniósł fokus z „Przy mapie” na „W korytarzu”, A weszło jako latarnik. Cofnięcie historii zostało na stronie, a klawisz B pada miał zablokowaną domyślną akcję. W pokoju NS3S, z kartografem podłączonym osobno: wychylenie 0,15 nie ruszyło pozycji, pełna gałka w przód przesunęła latarnika bez biegu, prawa gałka obróciła wzrok, RT ustawił bieg w pozie, X przełączył „Wycisz” na „Dźwięk”. Konsola czysta. Na 390×844 ściąga stoi nad „Bieg” i prostokąty się nie nachodzą. Serwer wypisał `http://192.168.1.219:8792`, a start pokazał ten sam adres. Wibracji nie było jak wyzwolić: strażnik nie wszedł w zasięg i nie było złapania. Pełny ekran wymaga gestu, więc Y tylko woła przeglądarkę.

## Pominięte

Brak.

## Do decyzji

Brak.

## Podsumowanie

Na gałęzi `polish-1` jest ten sam kierunek: kamień, popiół, miedź, bursztyn. Doszły płytki w jednym rzędzie, strażnik i pieczęcie w korytarzu, kołysanie i płynny obrót, kurz z winietą, dźwięk rundy z wyciszeniem, ekrany startu i wyniku, telefon bez przewijania i płótno, które samo schodzi z rozdzielczością. Dwie karty doszły do wygranej i do przegranej tym samym tekstem.

Nic z listy nie zostało pominięte. Prawdziwego wcięcia iPhone’a nie dało się tu wywołać; marginesy są w CSS i włączą się, gdy system je poda. Zasad rundy, sieci i protokołu nie ruszałem. Po liście doszedł pad latarnika i adres Maca na starcie; mapowanie jest w sekcji „Pad”.

## Następna runda

1. Osadzić miedziany krąg w kierunku nieba, żeby zostawał w świecie przy obrocie, i nie dopuścić, żeby ściana przy samym nosie wypełniała cały kadr. Tak wyglądała klatka zaraz po wygranej.
2. Zatrzymać płytę wyniku tak, żeby dało się ją przeczytać. Pięć sekund mija, zanim drugi gracz spojrzy, i komora już jest następna.
3. Dać latarnikowi wcześniejszy znak strażnika niż zielona sylwetka w snopie. Bieg słychać przez ściany, a pościg dopada w korytarzu bez zapowiedzi, z której da się skorzystać.
