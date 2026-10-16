# Brief

## Koncepcja

Tajemniczy labirynt na obcej planecie, ruiny cywilizacji, która nie zostawiła języka. Klimat to zimny pył, obce światło i znaki na kamieniu, nie gotyk i nie neon.

Gra jest na dwie osoby, każda w swojej przeglądarce. Jedna może być na komputerze, druga na telefonie. Runda ma być krótka i napięta: dojść do serca ruiny, zanim strażnik zamknie korytarz. Po wyniku od razu zaczyna się następna komora.

Wejście: najpierw intro. Schodzi od dowolnego klawisza, od kliknięcia w kadr i od A na padzie. Potem menu: Graj, Opcje, Teczka, Zejścia, Twórcy. Z Graj jedna osoba otwiera komorę i dostaje czteroznakowy kod oraz kod QR. Druga skanuje albo wpisuje kod. Link w QR ma `?pokoj=CODE` i wchodzi od razu, bez intra.

Głosu w grze nie ma. Kartograf może mówić obok albo przez telefon, a dodatkowo wysyła krótkie znaki: Stój, Cicho, Biegnij, W lewo, W prawo.

## Kierunek wizualny

Wybrany 2026-10-07: tablica pomiarowa.

Paleta to popiół, kość i przygaszona miedź. Bursztyn zostaje przy pieczęciach i przy sercu ruiny. Strażnik zostaje zielony, tylko ciszej. Turkus schodzi z interfejsu, ze stożka latarki i z mapy.

Palatino jest w tytułach i w zawołaniu na środku ekranu latarnika. Przyciski są krojem systemowym, duże, bez rozstrzelonych kapitalików.

Pięć zawołań to płyty obok siebie, ze słowem i cyfrą. Zasłona jest jedną szeroką płytą pod nimi. Wciśnięcie lekko zapada się w kamień.

Światło latarnika jest stożkiem, który gaśnie z odległością. Krawędź ściany i styk z podłogą są ciemniejsze, żeby skręt było widać z bliska. Poniżej około jednej komórki ten styk i pionowa krawędź ciemnieją mocniej, przy teksturach HD i bez nich. Na podłodze widać, jak daleko sięga snop. W snopie unoszą się drobinki, na kadrze leży rzadkie ziarno i winieta.

Nad korytarzem wisi miedziany krąg tej planety. W lobby jest tłem planszy. U latarnika jest namalowany w niebie i zostaje w tym samym miejscu kadru, gdy postać się obraca. Strażnika w zasięgu wzroku widać jako zieloną sylwetkę, pieczęć jako bursztynowy blask na ścianie. Ściana i mgła je zasłaniają. Gdy strażnik czuwa, szuka albo goni i jest bliżej niż około 7, krawędź kadru latarnika robi się zielona, bez kierunku. Poniżej około 3,4 pulsuje. Obchód jej nie zapala.

Dźwięk: krok to tkanina i co drugi raz oddech, w tle niski dron. Zawołanie to jedno ciepłe uderzenie, pieczęć zostaje jednym uderzeniem metalu. Wygrana to dwa tony kości, przegrana opada w szum. Przy strażniku narasta sub-bas, bez piły. Całość da się wyciszyć.

Mechaniki rundy przy tym kierunku się nie zmieniają.

## Role

**Kartograf** (najlepiej telefon). Widzi plan z góry: korytarze, latarnika, stożek jego światła, strażnika, jego pole widzenia i zasięg słuchu, trasę obchodu, bursztynowe drzwi, łup i serce ruiny. Klik w korytarz stawia znak, który latarnik widzi jako strzałkę na krawędzi ekranu i snop, gdy ma go w polu widzenia. Klik w drzwi otwiera je tylko wtedy, gdy latarnik przy nich stoi. Zasłona na chwilę myli strażnika. Na panelu widać numer rundy, stan strażnika, pieczęcie i punkty.

**Latarnik** (najlepiej komputer). Jest w korytarzu. Widzi świat z pierwszej osoby, z latarką skierowaną tam, gdzie patrzy. Nie ma mapy. Lewa połowa ekranu: krok. Prawa: obrót. Przycisk Bieg. Puszczenie steru oznacza ciszę. Na komputerze: WASD, strzałki w bok obracają, Shift to bieg. N to nasłuch, skąd strażnik. K to stuk, znak dla mapy.

Twórca pokoju wybiera rolę. Druga osoba dostaje tę, która została.

W lobby każdy ekran mówi wprost, czym jest: „Ten ekran: Mapa” albo „Ten ekran: Latarnia”, i jednym zdaniem, co się tu robi. To jest ważniejsze niż kod pokoju, gdy drugie z was już weszło. Klient poznaje telefon po dotyku i krótszym boku poniżej 800 px, resztę bierze za komputer, i podaje to przy wejściu, dołączeniu i powrocie. Gdy latarnia stoi na telefonie, a mapa na komputerze, oba lobby piszą „Latarnia jest na telefonie. Lepiej się gra odwrotnie.” i dają wyróżniony przycisk „Zamieńcie się”. Przy tym samym typie urządzeń przycisk zostaje, bez ostrzeżenia. Jedna osoba w lobby przycisku nie dostaje. Zamiana działa tylko w lobby, gdy oboje są online: role, tokeny i zapis w przeglądarce idą za nowym miejscem, więc odświeżenie strony wraca już do nowej roli.

## Mechaniki

- Labirynt jest doskonały (recursive backtracker) plus do trzech zamkniętych skrótów. Skrót nie jest obowiązkowy. Da się wygrać bez kartografa, ale bez niego jest ślepo.
- Start to ślepy zaułek daleko od serca. Serce to komórka najdalsza od narożnika, a start to zaułek najdalszy od serca.
- Strażnik obchodzi boczny korytarz, który przecina drogę do serca. Stany: obchód, czuwa, pościg, szuka. Widzi w stożku, słyszy bieg przez ściany, chód tylko z bliska, stanie w miejscu jest ciche.
- Po starcie rundy jest krótka odporność na dotyk, około 2,4 s, żeby zły układ nie zabił od razu. Na żarze 0 dochodzi 10 s ciszy: łowca nie widzi i nie słyszy, ale dotyk zabija. Słuch biegu na żarze 0 jest 0,6 tego, co na dalszych komorach.
- Dotknięcie strażnika przegrywa. Wejście na komórkę serca wygrywa.
- Pieczęcie: 2 ładunki na rundę, otwierają ścianę na stałe w tej komorze. Kartograf wydaje ładunek kliknięciem w drzwi. Drzwi puszczają tylko wtedy, gdy latarnik stoi przy nich, bliżej niż około 1,2. Inaczej kartograf słyszy „Latarnik musi stanąć przy drzwiach.”
- W komorze leżą trzy odłamki i jeden klucz. Podniesienie daje punkty: odłamek 10, klucz 25. Nie są potrzebne, żeby dojść do serca.
- Ucieczka z pościgu daje 15 punktów. Wygrana komory daje 40. Suma jest na panelu kartografa i na płycie wyniku.
- Zasłona: 6 s, potem około 26 s odnowienia. Nie daje przejścia przez strażnika, tylko psuje wykrycie.
- Znak na mapie trwa około 12 s. Stuk latarnika stawia znak w jego miejscu na około 8 s.
- P albo F1, oraz przycisk Pomoc, otwierają pomoc. U latarnika i u kartografa tekst jest inny.
- Ruina budzi się od postępu latarnika po drodze do serca. Około połowy trasy zaczyna, przy sercu jest pełna. Zegar około 110 s jest górną granicą ciszy: budzi to, co nastąpi pierwsze. Z samego czasu pełne pobudzenie jest około 230 s. Strażnik robi się szybszy i wyczuwa dalej. Nie ma twardego limitu czasu. Cofnięcie się nie usypia ruiny.
- Wygrana podnosi „żar” (większy labirynt), przegrana obniża. Rozmiary: 15, 19, 21. Numer rundy rośnie niezależnie.
- Po wygranej płyta wisi około 12 s, po przegranej około 8 s, i sama startuje następna komora. Przycisk **Dalej** skraca czekanie i pokazuje odliczanie. Wygrana mówi „Serce odpowiedziało. Schodzicie głębiej.”, przegrana „Strażnik was dogonił. Ruina liczy kroki od nowa.” Obie podają czas i punkty oraz jedną notatkę. Po wygranej można wpisać, kto schodził.
- Tablica trzyma imię, czas, numer komory i punkty. Kolejność: więcej komór, potem więcej punktów, potem krótszy czas. Widać ją z menu i pod `GET /tablica`.
- Zerwane połączenie w trakcie rundy zatrzymuje symulację. Można wrócić tym samym tokenem z `sessionStorage` przez około 2 minuty.

## Co działa

Sprawdzone w tej sesji:

- `npm run check`: labirynty 15, 19 i 21 są spójne, mają pieczęcie, da się dojść do serca. Czas samego marszu optymalną ścieżką wyszedł około 70 s, 116 s i 128 s.
- `node server/smoke.js`: utworzenie pokoju, dołączenie, start, znak, pieczęć, zasłona, zawołanie „Stój” i pozycja latarnika dochodzą do drugiego klienta.
- Intro schodzi od Escape, od spacji, od kliknięcia w kadr i od A na padzie. A zostawia menu, nie włącza „Graj”. W twórcach jest linia „Dead Net Lab”.
- Dwie karty, pokój L8G2: kartograf „Przy mapie”, latarnik wchodzi kodem. Oba ekrany doszły do „Można schodzić.” i razem weszły w korytarz. Serwer nie wypisał błędu.
- Pięć płytek zawołania mieści się w jednym rzędzie od 360 px. Na telefonie gra nie przewija strony. Latarnik sam obniża rozdzielczość płótna, gdy klatka nie wyrabia; mapa kartografa zostaje ostra.

## Co nie działa albo nie jest zrobione

- Gry nie da się połączyć przez internet bez wystawienia portu. Jest tylko sieć lokalna.
- Pokoje giną z restartem procesu. Tablica imion zostaje w pliku na tym komputerze. Konta nie ma.
- Nie ma czatu głosowego w grze.
- Nie ma osobnego trybu pościgu, wyścigu ani zagadek w komnatach. Została współpraca asymetryczna i strażnik.
- Nie ma testu przeglądarkowego w repozytorium. Jest tylko logika labiryntu i krótki test WebSocket.

## Znane problemy

- Widok latarnika to programowy raycaster. Z bardzo bliska ściana nadal wypełnia kadr, bo promień zostaje. Poniżej około jednej komórki styk z podłogą i pionowa krawędź są przyciemnione, przy HD i bez, żeby skręt dało się odczytać.
- Karta w tle prawie nie rysuje klatek. Po powrocie obraz może być przez chwilę pusty, dopóki pętla znowu nie namaluje kadru.
- Zostawiona runda sama wchodzi w „ruina się budzi”. Długi przestój w teście zaostrza strażnika.
- Dobrze gadająca para może skończyć pierwszą komorę szybciej niż zakładane 3–5 minut, bo optymalny marsz 15×15 to około minuty. Czekanie na strażnika i złe skręty to wydłużają.
- Serwer ufa pozycji latarnika, jeśli mieści się w limicie prędkości i nie wchodzi w ścianę. To gra dla dwóch osób, nie turniej.
- Kartograf węższy niż 800 px ma mapę i panel jeden pod drugim. Pięć płytek zostaje w jednym rzędzie, a panel w trakcie gry się nie przewija. W poziomie, przy wysokości poniżej 520 px, panel wraca obok mapy.
- Adres dla telefonu zależy od interfejsu sieciowego maszyny. Przy kilku adresach QR bierze pierwszy preferowany (najpierw 192.168, potem 10, potem 172).
