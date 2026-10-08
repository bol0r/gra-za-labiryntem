# Postęp polerowania

Gałąź `polish-1`. Kierunek wizualny (kamień, popiół, miedź, bursztyn) zostaje. Zasady rundy, sieć i protokół bez zmian.

## Zrobione

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

## Pominięte

Brak.

## Do decyzji

Brak.
