# Brief

## Koncepcja

Tajemniczy labirynt na obcej planecie, ruiny cywilizacji, która nie zostawiła języka. Klimat to zimny pył, obce światło i znaki na kamieniu, nie gotyk i nie neon.

Gra jest na dwie osoby, każda w swojej przeglądarce. Jedna może być na komputerze, druga na telefonie. Runda ma być krótka i napięta: dojść do serca ruiny, zanim strażnik zamknie korytarz. Po wyniku od razu zaczyna się następna komora.

Wejście: jeden gracz otwiera komorę i dostaje czteroznakowy kod oraz kod QR. Drugi skanuje albo wpisuje kod. Link w QR ma `?pokoj=CODE` i wchodzi od razu.

Głosu w grze nie ma. Kartograf może mówić obok albo przez telefon, a dodatkowo wysyła krótkie znaki: Stój, Cicho, Biegnij, W lewo, W prawo.

## Kierunek wizualny

Wybrany 2026-10-07: tablica pomiarowa.

Paleta to popiół, kość i przygaszona miedź. Bursztyn zostaje przy pieczęciach i przy sercu ruiny. Strażnik zostaje zielony, tylko ciszej. Turkus schodzi z interfejsu, ze stożka latarki i z mapy.

Palatino jest w tytułach i w zawołaniu na środku ekranu latarnika. Przyciski są krojem systemowym, duże, bez rozstrzelonych kapitalików.

Pięć zawołań to płyty obok siebie, ze słowem i cyfrą. Zasłona jest jedną szeroką płytą pod nimi. Wciśnięcie lekko zapada się w kamień.

Światło latarnika jest stożkiem, który gaśnie z odległością. Krawędź ściany i styk z podłogą są ciemniejsze, żeby skręt było widać z bliska. Na podłodze widać, jak daleko sięga snop. W snopie unoszą się drobinki, na kadrze leży rzadkie ziarno i winieta.

Nad korytarzem wisi miedziany krąg tej planety. W lobby jest tłem planszy. U latarnika jest namalowany w niebie i zostaje w tym samym miejscu kadru, gdy postać się obraca. Strażnika w zasięgu wzroku widać jako zieloną sylwetkę, pieczęć jako bursztynowy blask na ścianie. Ściana i mgła je zasłaniają.

Dźwięk: krok to tkanina i co drugi raz oddech, w tle niski dron. Zawołanie to jedno ciepłe uderzenie, pieczęć zostaje jednym uderzeniem metalu. Wygrana to dwa tony kości, przegrana opada w szum. Przy strażniku narasta sub-bas, bez piły. Całość da się wyciszyć.

Mechaniki rundy przy tym kierunku się nie zmieniają.

## Role

**Kartograf** (najlepiej komputer). Widzi plan z góry: korytarze, latarnika, stożek jego światła, strażnika, jego pole widzenia i zasięg słuchu, trasę obchodu, bursztynowe klamry i serce ruiny. Klik w korytarz stawia znak, który latarnik widzi jako strzałkę na krawędzi ekranu i snop, gdy ma go w polu widzenia. Klik w klamrę wydaje pieczęć. Zasłona na chwilę myli strażnika.

**Latarnik** (najlepiej telefon). Jest w korytarzu. Widzi świat z pierwszej osoby, z latarką skierowaną tam, gdzie patrzy. Nie ma mapy. Lewa połowa ekranu: krok. Prawa: obrót. Przycisk Bieg. Puszczenie steru oznacza ciszę. Na komputerze: WASD, strzałki w bok obracają, Shift to bieg.

Twórca pokoju wybiera rolę. Druga osoba dostaje tę, która została.

## Mechaniki

- Labirynt jest doskonały (recursive backtracker) plus do trzech zamkniętych skrótów. Skrót nie jest obowiązkowy. Da się wygrać bez kartografa, ale bez niego jest ślepo.
- Start to ślepy zaułek daleko od serca. Serce to komórka najdalsza od narożnika, a start to zaułek najdalszy od serca.
- Strażnik patroluje drugą połowę drogi do serca. Stany: obchód, czuwa, pościg, szuka. Widzi w stożku, słyszy bieg przez ściany, chód tylko z bliska, stanie w miejscu jest ciche.
- Po starcie rundy jest krótka odporność, około 2,4 s, żeby zły układ nie zabił od razu.
- Dotknięcie strażnika przegrywa. Wejście na komórkę serca wygrywa.
- Pieczęcie: 2 na rundę, otwierają ścianę na stałe w tej komorze.
- Zasłona: 6 s, potem około 26 s odnowienia. Nie daje przejścia przez strażnika, tylko psuje wykrycie.
- Znak na mapie trwa około 12 s.
- Od około 110 s rundy ruina się budzi: strażnik szybszy, widzi i słyszy dalej. Pełne pobudzenie około 230 s. Nie ma twardego limitu czasu.
- Wygrana podnosi „żar” (większy labirynt), przegrana obniża. Rozmiary: 15, 19, 21. Numer rundy rośnie niezależnie.
- Po wyniku jest około 5 s i sama startuje następna komora. Przycisk **Następna komora** skraca czekanie.
- Zerwane połączenie w trakcie rundy zatrzymuje symulację. Można wrócić tym samym tokenem z `sessionStorage` przez około 2 minuty.

## Co działa

Sprawdzone w tej sesji:

- `npm run check`: labirynty 15, 19 i 21 są spójne, mają pieczęcie, da się dojść do serca. Czas samego marszu optymalną ścieżką wyszedł około 70 s, 116 s i 128 s.
- `node server/smoke.js`: utworzenie pokoju, dołączenie, start, znak, pieczęć, zasłona, zawołanie „Stój” i pozycja latarnika dochodzą do drugiego klienta.
- Przeglądarka, dwa okna: lobby, kod, QR, obie role, mapa kartografa, widok korytarza, ruch latarnika widać na mapie, znak „Stój” pojawia się u latarnika.
- Dwie karty, pokój WBHW: runda do wygranej („Serce ruiny odpowiada.”, 1:07) i runda do przegranej („Strażnik zamyka przejście.”, 1:23). Oba ekrany dostały ten sam tekst i razem weszły w następną komorę.
- Pięć płytek zawołania mieści się w jednym rzędzie od 360 px. Na telefonie gra nie przewija strony. Latarnik sam obniża rozdzielczość płótna, gdy klatka nie wyrabia; mapa kartografa zostaje ostra.

## Co nie działa albo nie jest zrobione

- Gry nie da się połączyć przez internet bez wystawienia portu. Jest tylko sieć lokalna.
- Pokoje giną z restartem procesu. Nie ma zapisu konta ani rankingu.
- Nie ma czatu głosowego w grze.
- Nie ma osobnego trybu pościgu, wyścigu ani zagadek w komnatach. Została współpraca asymetryczna i strażnik.
- Nie ma testu przeglądarkowego w repozytorium. Jest tylko logika labiryntu i krótki test WebSocket.

## Znane problemy

- Widok latarnika to programowy raycaster. Światło jest stożkiem z gaśnięciem i ciemniejszym stykiem podłogi, ale tekstury są nadal generowane, 128×128, bez osobnych assetów. Z bardzo bliska ściana wciąż wypełnia ekran.
- Karta w tle prawie nie rysuje klatek. Po powrocie obraz może być przez chwilę pusty, dopóki pętla znowu nie namaluje kadru.
- Zostawiona runda sama wchodzi w „ruina się budzi”. Długi przestój w teście zaostrza strażnika.
- Dobrze gadająca para może skończyć pierwszą komorę szybciej niż zakładane 3–5 minut, bo optymalny marsz 15×15 to około minuty. Czekanie na strażnika i złe skręty to wydłużają.
- Serwer ufa pozycji latarnika, jeśli mieści się w limicie prędkości i nie wchodzi w ścianę. To gra dla dwóch osób, nie turniej.
- Kartograf węższy niż 800 px ma mapę i panel jeden pod drugim. Pięć płytek zostaje w jednym rzędzie, a panel w trakcie gry się nie przewija. W poziomie, przy wysokości poniżej 520 px, panel wraca obok mapy.
- Adres dla telefonu zależy od interfejsu sieciowego maszyny. Przy kilku adresach QR bierze pierwszy preferowany (najpierw 192.168, potem 10, potem 172).
