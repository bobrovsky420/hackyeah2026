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

Działający pilot HubMI.pl, cyfrowego rdzenia, który ROPS w Krakowie
planuje dla Małopolskiego Hubu Innowacji Społecznych: osoba z potrzebą
znajduje rozwiązanie, a każdy wpis trafia do panelu ROPS. Role zespołu
ROPS, który poprowadzi usługę, to proponowany plan rozwoju, jeszcze
niewdrożony.

**Droga, nie katalog.** Mieszkaniec, pracownik socjalny, lider
organizacji albo urzędnik opisuje potrzebę własnymi słowami i wybiera
gminę. Dostaje drogę w czterech blokach:

- **Rozwiązania:** do trzech sprawdzonych innowacji, każda z
  uzasadnieniem cytowanym z opisu źródłowego i z tym, czego wymaga:
  realizator, koszt, czas.
- **Wiedza:** podręczniki, modele i filmy.
- **Ludzie:** autor innowacji, realizatorzy w pobliżu, opiekun kategorii
  w ROPS i osoby gotowe pomóc, za ich zgodą.
- **Ścieżka wdrożenia:** forma prawna, nabory i trzy kolejne kroki.

Obok rozwiązań droga pokazuje podobne przypadki: potrzeby i pomysły
innych, zatwierdzone przez ROPS.

**Nie wyszukiwarka, nie czatbot nad dokumentami.** Wyszukiwarka zwraca
linki, czatbot z RAG płynny akapit; oba odpowiadają na każde pytanie.
HubMI składa drogę według reguł z opracowanych danych i potrafi
powiedzieć „nie”. Polski otwarty model Bielik tylko wybiera i wyjaśnia:
każdy identyfikator sprawdzamy w katalogu, każdy cytat w źródle, a o
tym, czy dopasowanie wystarcza, decyduje kod, nie model. Kwoty, terminy
i podstawy prawne pochodzą z tabeli 30 ścieżek prawnych i finansowych,
której model nie widzi.

**Gdy nic nie pasuje, mówi to wprost.** Potrzeba trafia do banku
potrzeb, a narzędzie przygotowuje fiszkę dla kolejnego naboru inkubatora
z najbliższymi istniejącymi innowacjami. Mapa 183 gmin pokazuje, gdzie
dana innowacja działa, a gdzie jej brakuje.

**Moduły wyzwania.** Działają: I Matchmaking społeczny, IV Tester
innowacji (oceny, opinie, propozycje ulepszeń, zapisy do testów), V
Platforma aktywnej komunikacji (rozmowy z ROPS bez konta, przez
prywatny link, mentorzy, tablica partnerstw) i VI Panel administratora.
Częściowo: II Zasobnik wiedzy, III Kreator pomysłów (fiszka pomysłu z
najbliższymi sprawdzonymi rozwiązaniami) i VII Middleman Innowacji.

**Panel ROPS.** Każdy wpis czeka na decyzję człowieka, zapisaną z jego
nazwiskiem. Autor pomysłu widzi status i odpowiedź ROPS na stronie
swojej fiszki. W panelu ROPS poprawia wiedzę na drogach bez nowego
wydania danych, widzi trendy potrzeb i eksportuje kolejki do CSV.

**Prawdziwe dane.** 381 innowacji z ogólnopolskiej bazy
innowacjespoleczne.pl i biblioteki ROPS, każda z linkiem do źródła.

**Najpierw etyka.** Bramka bezpieczeństwa czyta każdy tekst przed
dopasowaniem. Osoba w kryzysie dostaje telefony zaufania i adres
ośrodka pomocy społecznej, nie innowacje. Prośbę dyskryminującą
odrzucamy z szacunkiem. Dane osobowe usuwamy przed zapisem i przed
każdym zapytaniem do modelu. Narzędzie niczego nikomu nie wysyła i o
nikim nie decyduje.

**Plan rozwoju.** ROPS poprowadzi HubMI jako usługę w trzech rolach
(opiekun kategorii, redaktor katalogu, koordynator banku potrzeb) i
domknie trzy pętle: od potrzeby do wdrożenia, od potrzeby do nowej
innowacji, od innowacji do miejsc, które jej potrzebują.

**Dla wszystkich.** Polski interfejs w kroju Atkinson Hyperlegible dla
osób słabowidzących, kontrast 7:1, pełna obsługa klawiaturą i czytnikiem
ekranu, układ na telefon.

Korzystaliśmy z agenta AI do programowania Claude Code (Anthropic);
każda decyzja zespołu, źródła danych i licencje są opisane w
repozytorium.

**Zespół:** Alexander Bobrovský (bobrovsky@seznam.cz), Anton Myshelov
(omgkennyno@gmail.com), Dmytro Chernikov (me41st0@gmail.com), Dmytro
Ushakov (ushakov_d@hotmail.com), Krzysztof Zając (zajkrz@gmail.com).
