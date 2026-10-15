# Dalej

Kolejka po drugim teście, 15 października 2026. Mariusz i Pawełek. Bartek nie zdążył. Najpierw grywalność z tego testu. Menu i HUD są w `b1ceaf3`; trzeciego menu nie projektujemy.

## Dokończyć

Po podmianie tekstur podbić `HD_VER` w `render.js`, inaczej przeglądarka zostanie przy starych plikach. Serwer wstały przed cache `/tex/` trzeba zrestartować.

Pad w korytarzu puszcza bieg (A albo RT), wyciszenie (X) i pełny ekran (Y). Nasłuch i Stuk są na klawiszach N i K, na padzie ich nie ma. Na teście z Xboxa działał sam bieg. Dopiąć Nasłuch i Stuk do wolnych przycisków.

Dron, który wcześniej buczał, na teście zniknął. Opcje w trakcie rundy już są. Sprawdzić, czy dźwięk wraca stamtąd i czy master w ogóle gra.

## Z testu, następne

Więcej rozwidleń i ślepych korytarzy. Kartograf na telefonie się nudzi, bo za często jest jedna droga. Lewo i prawo mają o czym decydować.

Pieczęcie i łup już leżą w komorze. Testerzy ich nie widzieli i prosili o ukryte przejścia oraz skrzynki. Najpierw zrobić je czytelne, nie dokładać drugich drzwi. Boss za skrytką nie wchodzi: w grze się ucieka, nie walczy.

Dwa zawołania więcej dla kartografa, nadal w siatce, która mieści się na 390 px. Nie dokładamy pełnej klawiatury znaków.

Kilka słabszych stworów na stałych trasach, obok albo zamiast jednego łowcy, którego po namierzeniu nie da się zgubić. To zmienia zasadę jednego strażnika, więc osobny etap i wpis w `docs/DECYZJE.md`, kiedy wejdzie do kodu. Do tego czasu autopilot zostaje.

## Zostaje

Kod QR i cztery znaki. Wybór roli przy wejściu: dwa komputery albo telefon i komputer już tak działają, bo twórca pokoju bierze rolę, a druga osoba dostaje tę drugą. Mapa lepiej leży na telefonie, latarnia na komputerze. Zamiana ról w środku rundy nie wchodzi.

Krótkie znaki zamiast głosu w grze. Rozmowa zostaje obok albo przez telefon. Potwór nie słyszy mikrofonu. To osobna decyzja, gdy gra ma działać na odległość, nie przy jednym stole.

Tekstury ścian po teście mają wspólną spoinę. Stykanie się krawędzi jest w commitach `65a64f0` i `4c2a386`, nie w kolejce.

## Nie wchodzi

Wajcha, która sprząta strażnika i otwiera drogę. Klik w każdą cegłę. Boss. Ciągłe „źle poszedłeś” od kartografa. Dalsze przebudowy menu, zanim wejdzie kolejka z tego testu.
