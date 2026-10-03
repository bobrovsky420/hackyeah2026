# HackTribe submission

The texts for the HackTribe form (limits in
[functional-specification.md](functional-specification.md), section 2).
Title at most 5 words, description at most 500 words, both in Polish:
the rules changed on 3 October, and the submission and the presentation
are now in Polish, with full Polish spelling. The FAQ asks for the names
and addresses of the team members in the description; they count
towards the 500 words. Recount the words after every edit.

## Title

HubMI: od potrzeby do rozwiązania

## Description

Działający prototyp HubMI.pl, cyfrowego serca, które ROPS w Krakowie
planuje dla Małopolskiego Hubu Innowacji Społecznych: osoba zgłaszająca
potrzebę znajduje rozwiązanie, a każdy wpis trafia do panelu ROPS.

**Droga, nie katalog.** Mieszkaniec, pracownik socjalny, przedstawiciel
organizacji albo urzędnik opisuje potrzebę własnymi słowami i wybiera
gminę. Otrzymuje drogę z czterech części:

- **Rozwiązania:** do trzech sprawdzonych innowacji, każda z
  uzasadnieniem opartym na cytatach ze źródła i z wymaganiami:
  realizator, koszt, czas.
- **Wiedza:** poradniki, modele usług i filmy.
- **Ludzie:** autor innowacji, realizatorzy w pobliżu, opiekun kategorii
  w ROPS i osoby gotowe pomóc, za ich zgodą.
- **Ścieżka wdrożenia:** forma prawna, nabory i trzy kolejne kroki.

Pod rozwiązaniami widać podobne przypadki: potrzeby i pomysły innych,
zaakceptowane przez ROPS.

**Ani wyszukiwarka, ani czatbot do dokumentów.** Wyszukiwarka zwraca
linki, a czatbot z RAG pisze zgrabny akapit; oba odpowiadają na każde
pytanie. HubMI układa drogę według reguł, na podstawie opracowanych
danych, i potrafi powiedzieć „nie”. Otwarty polski model Bielik tylko
wybiera i wyjaśnia: każde odwołanie sprawdzamy w katalogu, każdy cytat w
źródle, a o tym, czy dopasowanie wystarcza, decyduje program, nie model.
Kwoty, terminy i podstawy prawne pochodzą z tabeli 30 ścieżek prawnych i
finansowych, do której model nie ma dostępu.

**Gdy nic nie pasuje, mówi to wprost.** Potrzeba trafia do banku
potrzeb, a narzędzie przygotowuje fiszkę dla kolejnego naboru inkubatora
z podobnymi istniejącymi innowacjami.

**Moduły wyzwania.** Działają: I Matchmaking społeczny, II Zasobnik
wiedzy (nie kolejny katalog: wiedza jest częścią drogi, z linkami do
dokumentów i filmów, aktualizowana w panelu; trendy potrzeb widzi tylko
ROPS), IV Tester innowacji (oceny, opinie, propozycje ulepszeń, zapisy
do testów), V Platforma aktywnej komunikacji (rozmowy z ROPS bez
zakładania konta, przez prywatny link, mentorzy, tablica partnerstw) i
VI Panel administratora. Częściowo: III Kreator pomysłów (fiszka
pomysłu z podobnymi sprawdzonymi rozwiązaniami) i VII Middleman
Innowacji.

**Panel ROPS.** Każdy wpis czeka na decyzję pracownika ROPS, odnotowaną
z jego nazwiskiem. Autor pomysłu widzi status i odpowiedź ROPS na
stronie swojej fiszki. W panelu ROPS poprawia wiedzę w drogach bez
publikowania nowej wersji danych i eksportuje zgłoszenia do CSV.

**Prawdziwe dane.** 381 innowacji z ogólnopolskiej bazy
innowacjespoleczne.pl i biblioteki ROPS, każda z linkiem do źródła.

**Najpierw etyka.** Filtr bezpieczeństwa sprawdza każdy tekst przed
dopasowaniem. Osoba w kryzysie dostaje numery telefonów zaufania i adres
ośrodka pomocy społecznej, a nie listę innowacji. Prośbę dyskryminującą
odrzucamy z szacunkiem. Dane osobowe usuwamy przed zapisem i przed
każdym zapytaniem do modelu. Narzędzie niczego nikomu nie wysyła i o
nikim nie decyduje.

**Plan rozwoju, jeszcze niewdrożony.** ROPS poprowadzi HubMI jako
usługę w trzech rolach (opiekun kategorii, redaktor katalogu,
koordynator banku potrzeb) i domknie trzy cykle: od potrzeby do
wdrożenia, od potrzeby do nowej innowacji, od innowacji do miejsc, które
jej potrzebują.

**Dla wszystkich.** Interfejs w kroju pisma Atkinson Hyperlegible,
zaprojektowanym dla osób słabowidzących, kontrast 7:1, pełna obsługa
klawiaturą i czytnikiem ekranu, wersja na telefon.

Korzystaliśmy z agenta AI do programowania Claude Code (Anthropic);
każda decyzja zespołu, źródła danych i licencje są opisane w
repozytorium.

**Zespół:** Alexander Bobrovský (bobrovsky@seznam.cz), Anton Myshelov
(omgkennyno@gmail.com), Dmytro Chernikov (me41st0@gmail.com), Dmytro
Ushakov (ushakov_d@hotmail.com), Krzysztof Zając (zajkrz@gmail.com).
