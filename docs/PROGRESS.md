# Postęp polerowania

Gałąź `polish-1`. Kierunek wizualny (kamień, popiół, miedź, bursztyn) zostaje. Zasady rundy, sieć i protokół bez zmian.

## Zrobione

### 0. Układ płytek kartografa

Pięć zawołań jest w jednym rzędzie od 360 px w górę. „W prawo” nie wychodzi poza ekran, napis się nie ucina. Zasłona kończy się w panelu (12 px od krawędzi przy 360 i 390). Sprawdzone w grze: 360×740, 390×844, 1280×800. Widok latarnika bez zmian.

### 1. Strażnik i pieczęcie u latarnika

W zasięgu wzroku strażnik jest zieloną sylwetką z poświatą, pieczęć bursztynowym blaskiem na ścianie. Ściana zasłania (raycast i bufor głębokości). Od około 10 jednostek znikają we mgle. Sprawdzone klatki: sylwetka w korytarzu, blask na klamrze z dystansu, pieczęć za rogiem się nie rysuje. Konsola czysta.

### 2. Ruch

Krok lekko kołysze horyzontem (wyłączone przy reduced motion). Obrót z myszy, palca i strzałek schodzi do celu w około trzech klatkach, zamiast skoku. Latarnia migocze nieregularnie, w granicach kilku procent. Pozycja i kąt wysyłane na serwer to nadal wynik symulacji. Sprawdzone: obrót zmienia kadr, chód nie sypie konsoli, korytarz przy 390 px zostaje czytelny.

## Pominięte

Brak.

## Do decyzji

Brak.
