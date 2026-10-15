# Postęp polerowania

Dalej na `master`. Kierunek wizualny (kamień, popiół, miedź, bursztyn) zostaje.

## Zrobione

### Intro w teksturach i zdjęcie w zaułku

Intro ma teksturowany kosmos i salę: tło z mgławicą, planeta z powierzchnią, na której w środku nurkowania (5,9 s) wychodzi na środek tarczy labirynt wyryty w skale i rozpala się bursztynem. Sala ma ściany z pilastrami, fryzem i uchwytami pochodni, posadzkę z miedzianą inkrustacją w stronę serca, kasetonowy strop i bramę serca na końcu. Pochodnie świecą na kamień. Planeta i sala liczą się piksel po pikselu w buforze, który sam schodzi z rozdzielczością, gdy klatka trwa ponad 8 ms. Bez tekstur albo z wyłączonym HD zostaje dawne płaskie intro. Pliki w `public/tex/intro/` (~275 KB), generator `docs/intro_generator.py`, plan i mapowanie w `docs/INTRO_TEKSTURY.md`.

Easter egg: w jednym ślepym zaułku każdego labiryntu na posadzce leży wyblakłe zdjęcie Wery, latarniczki sprzed was, z podpisem „Wera, ruina siódma / jeśli to czytasz — idź za światłem”. Podpis jest zawsze od strony wejścia. Tylko w HD, tylko u latarnika.

Sprawdzone: Chromium bez okna 1280×720, przebieg intra 0–21 s średnio 5,1 ms na klatkę, bez błędów; klatki z 0,6, 3,5, 5,9, 7, 8, 12, 16,8 s i tryb bez ruchu. Labirynt 15×15 z nasionem 12345: zaułek (0, 14), zdjęcie widać z sąsiedniej komórki, prosto i z podpisem przy patrzącym. `HD_VER` bez zmian (nowy plik ma nowy adres, a menu bierze niebo z `?v=2`).

Do poprawy poza tą zmianą: w trybie bez ruchu (`prefers-reduced-motion`) trzy linie tytułu nachodzą na siebie przy 1280×720, bo odstęp jest stały, a litery rosną z szerokością.

### Menu i HUD latarnika

Menu główne bierze niebo i planetę z `public/tex/hd/` (`sky.webp`, `planet.webp`, ta sama wersja co korytarz), gdy tekstury HD są włączone. Niebo sunie w bok, na dole stoi sylweta ruiny, w kadrze jest drobny kurz. Tytuł „Za labiryntem” wypełnia się bursztynem raz po wejściu. Fokus to bursztynowy romb i podpis pozycji. Płyta „Najgłębiej” pokazuje pierwsze miejsce z `/tablica`. Na dole są podpowiedzi pada i adres drugiego ekranu. Bez HD zostaje dotychczasowe tło. Opcje to kamienna płyta, przełącznik z bursztynową gałką i suwak głośności. Graj to dwie karty ról i kod w czterech komórkach.

HUD latarnika: lewy górny róg ma ruinę, czas i łup. Zawołanie kartografa jest duże u góry na środku, ze słowem i ikoną, przez około 1,8 s. Nasłuch rysuje półokrąg z klinem w stronę strażnika i tekst w rodzaju „Blisko · Z lewej”. Nasłuch i Stuk mają pierścienie odnowienia (4 s i 4,5 s), Bieg jest największy. Zebrany łup unosi się nad środkiem. Strażnik bliżej niż 3,4 daje zielone pulsowanie krawędzi. Na telefonie te same rzeczy są w rogach, Bieg pod prawym kciukiem, bez legendy klawiszy. Protokół bez zmian.

Sprawdzone: 1280×720, 390×844 i 844×390, bez przewijania strony. Pad przesuwa fokus i B wraca z Graj do menu. Strzałka na głośności zmienia ją o 10. Nasłuch pokazał „Daleko · Z lewej” i pierścień, zawołanie „Cicho” stanęło u góry. Niebo z dysku ma 4096×1024. Przy wyłączonych teksturach HD tło menu chowa się i zostaje dawne. Konsola pusta.

### Tekstury HD: wspólne krawędzie i lżejsze pliki

Ściany źle się stykały: każda z sześciu tekstur miała inne wysokości rzędów kamieni, a na brzegu bloki były ucięte w połowie, więc dwa różne kafle obok siebie nie mogły się zgrać. Generator stawia teraz wszystkie ściany, fryz z glifami i ramę pieczęci na tych samych rzędach (0, 118, 254, 358, 512 px), z pionową spoiną dokładnie na brzegu kafla. Średnia różnica na styku dwóch różnych ścian spadła z 27–57 do 6–18 (na 255), a rzędy przechodzą przez styki i narożniki. U ściany rośnie zawsze w prawo, więc glify nie są w lustrze, gdy patrzy się z drugiej strony.

Pliki są w WebP: 3,08 MB PNG → 0,32 MB. Adres ma wersję (`?v=2`), a serwer daje `/tex/` cache na rok; reszta zostaje `no-store`. Rozpakowanie idzie po jednym pliku na zadanie. Pętla HD trzyma ściany kolumnami i pisze piksel jednym zapisem 32-bitowym: 960×540 z ~19 do ~10 ms na klatkę, 390×220 z 3,8 do 2,0 ms. Obraz poza ścianami jest ten sam co przedtem (średnia różnica pikseli 0,002).

Sprawdzone: `npm run check`. Chromium bez okna: `hdActive()` po 0,9 s, pierwsze wejście 323 KB tekstur, drugie 0 B (z cache), `drawExplorer` 960×540 rysuje bez błędu. Klatki przed i po z tych samych pozycji w labiryncie 15×15: rzędy ciągłe na stykach i w narożnikach, rząd drobnych znaków czyta się od lewej do prawej z obu stron ściany. Bez HD nic się nie zmienia.

### Panel kartografa

Na telefonie tablica jest pod mapą, a nad mapą są okrągłe ikony: wycisz, pomoc, menu. Mapa jest kwadratem na środku wolnego miejsca, z narożnikami i napisem ruiny oraz czasem. Pod spodem oko strażnika w kolorze stanu (pulsuje przy Czuwa i Pościgu), nazwa Palatino, 14 segmentów przebudzenia, pieczęcie jako heksagony, klucz i punkty. Gdy latarnik stoi przy drzwiach, widać belkę z prośbą o dotknięcie klamry. Zawołania są 3×2: Lewo, Stój, Prawo, potem Cicho, Biegnij i okrągła Zasłona z pierścieniem odnowienia. Wysłanie daje napis „Wysłano · …” i krótką wibrację. Na szerokim ekranie ta sama tablica stoi obok mapy. Protokół bez zmian.

Sprawdzone: 390×844 i 360×740, drugi rząd mieści się w kadrze, strona się nie przewija. Klik „Lewo” pokazał „Wysłano · W lewo”. Przy 1280×800 tablica jest po prawej. Konsola pusta.

### Pakiet HD

Korytarz bierze pliki z `public/tex/hd/`, gdy w opcjach są włączone tekstury HD (`zl-hd`, domyślnie tak). Zanim się wczytają, zostaje kamień rysowany w kodzie. W HD podłoga jest kafelkiem dwóch komórek, bez pomarańczowej kratki, a światło mnoży kolor tekstury. Niebo i planeta stoją w świecie: obrót je przesuwa. Bez HD kadr jest ten sam co wcześniej.

Na dużym ekranie pełna retina nie wyrabiała (przy 1440×900 i gęstości 2 klatka schodziła do około 8 na sekundę). Rysowanie HD jest osobną pętlą, a bufor startuje od około 800 tysięcy pikseli i może zejść niżej, gdy średnia klatka nie mieści się w płynnej grze.

Sprawdzone przy włączonym HD: komputer 1440×900, gęstość 2, bufor 1094×684, odstęp klatek 16,7 ms (60 na sekundę). Telefon 390×844, gęstość 2, bufor 562×1215, też 16,7 ms. Osobny kadr bez HD pokazuje dawną cegłę i gwiazdy. Konsola pusta, serwer bez błędu.

### Opcje

W menu głównym jest „Opcje”. W trakcie rundy ten sam ekran otwiera przycisk Menu, bez opuszczania komory: „Wróć” wraca do gry, „Do menu” wychodzi jak dawny przycisk Menu. Tekstury HD, głośność 0–100 (domyślnie 80) i dźwięk są w `localStorage` (`zl-hd`, `zl-vol`, `zl-mute`) i czytane przy starcie. Suwak rusza jeden GainNode od razu; przy 80 poziom jest taki jak dotychczasowe 0,62. Wyciszenie trzyma suwak i do niego wraca. Przycisk „Wycisz” zszedł z rogu. Zostają klawisz M i X na padzie. Strzałki w lewo i w prawo na głośności zmieniają ją o 10. Pad i klawiatura chodzą jak w reszcie menu, B wraca.

Sprawdzone: przełączniki, suwak, M gasi i oddaje ten sam poziom, zapis zostaje po odświeżeniu. Ekran mieści się przy 390 px. Dwie karty, pokój 6DMQ: obaj w korytarzu, Menu otwiera opcje, „Wróć” zostawia rundę. Serwer bez błędu.

### Budzenie od połowy drogi

Ruina liczy postęp latarnika po drodze do serca. Około 50% trasy budzenie startuje i dochodzi do pełnego przy sercu. Zegar 110 s zostaje górną granicą ciszy, pełne pobudzenie z samego czasu około 230 s. Bierze się to, co jest dalej. Najdalszy osiągnięty punkt zostaje, cofnięcie nie usypia ruiny. Obchód schodzi z długiego odcinka ścieżki: boczny korytarz przecina drogę do serca. Reszta zasad bez zmian.

Sprawdzone: `npm run check` na 40 nasionach dla siatek 15, 19 i 21. Smoke, pokój UCNS. Runda KQBK: przy 23,1 s budzenie było już 0,03, zanim ruszy zegar, bo latarnik minął połowę trasy. Dwie karty, pokój Q6Z2: obaj w korytarzu, na mapie obchód schodzi w bok i wraca na drogę, panel na starcie mówi „Cisza”. Konsola obu kart pusta, serwer bez błędu.

### Zapis rund

Po wygranej albo przegranej serwer dopisuje jedną linię JSON do `data/runs.jsonl`. Żar, rozmiar, czas i wynik są z rundy, zanim żar się zmieni. Czas pierwszego pościgu jest `null`, gdy pościgu nie było. Procent trasy to skrót do serca, który latarnikowi jeszcze został, liczony po korytarzach. Pieczęcie mają czas otwarcia, łup to zebrane rodzaje, zasłona to fakt użycia. Zasady rundy bez zmian. `node server/runs.js` wypisuje krótkie podsumowanie. Plik jest w `data/` i nie wchodzi do gita.

Sprawdzone: `npm run check`. `node server/smoke.js`, pokój FYVG. Osobna runda NCFV doszła do przegranej w 16,6 s: pościg w 16,3 s przy 40,3% trasy, jeden odłamek, zasłona użyta, pieczęci brak. `node server/runs.js` to wypisał. Potem ta linia testowa została skasowana, żeby sesja we dwójkę zaczynała od pustego pliku. Dwie karty, pokój SBB4: kartograf i latarnik weszli w korytarz. Konsola obu kart pusta, serwer bez błędu.

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
