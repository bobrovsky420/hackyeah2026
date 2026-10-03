import { ropsDepartment } from "./contacts";
import type { ImplementationPath, KnowledgeItem, MockRoute, Person } from "./types";

/*
 * Canned routes standing in for the matching engine and the route composer.
 * Records come from src/lib/mock/innovations.json; the fit numbers, the
 * summaries and the next steps play the part of the model's text.
 */

const ACT_ON_PUBLIC_BENEFIT = "https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20030960873";

const abcDiagnozy: KnowledgeItem = {
  about: "ROPS w Krakowie",
  title: "ABC Diagnozy: jak rozpoznać potrzeby mieszkańców gminy",
  format: "PDF",
  url: "https://rops.krakow.pl/mpliki/MACIUS/ABC_Diagnozy_final.pdf",
};

function ropsAdvisor(role: string): Person {
  return {
    name: ropsDepartment.name,
    role,
    channels: [
      { kind: "email", value: ropsDepartment.email, href: `mailto:${ropsDepartment.email}` },
      { kind: "phone", value: ropsDepartment.phone, href: ropsDepartment.phoneHref },
      { kind: "hours", value: ropsDepartment.hours },
    ],
  };
}

const smallGrant: ImplementationPath = {
  id: "maly-grant",
  name: "Mały grant",
  applicant: "Organizacja społeczna",
  amount: "Do 10 000 zł, zadanie trwa do 90 dni",
  deadline: "W dowolnym momencie, bez konkursu",
  why: "Organizacja z gminy może szybko zacząć spotkania lub warsztaty.",
  steps: [
    "Znajdź organizację, która poprowadzi zajęcia.",
    "Złóż ofertę w urzędzie gminy.",
    "Urząd publikuje ofertę na 7 dni, potem podpisuje umowę.",
  ],
  source: {
    label: "Ustawa o działalności pożytku publicznego i o wolontariacie, art. 19a",
    url: ACT_ON_PUBLIC_BENEFIT,
  },
};

const localInitiative: ImplementationPath = {
  id: "inicjatywa-lokalna",
  name: "Inicjatywa lokalna",
  applicant: "Mieszkańcy gminy",
  amount: "Bez stałej kwoty. Gmina wspiera działanie, mieszkańcy dokładają pracę lub materiały.",
  deadline: "Według uchwały rady gminy",
  why: "Mieszkańcy mogą sami zorganizować spotkania z pomocą gminy.",
  steps: [
    "Sprawdź, czy rada gminy przyjęła uchwałę o inicjatywie lokalnej.",
    "Zbierz grupę mieszkańców i opisz działanie.",
    "Złóż wniosek w urzędzie gminy.",
  ],
  source: {
    label: "Ustawa o działalności pożytku publicznego i o wolontariacie, art. 19b do 19h",
    url: ACT_ON_PUBLIC_BENEFIT,
  },
};

const incubatorCall: ImplementationPath = {
  id: "inkubator",
  name: "Nabór do inkubatora innowacji społecznych",
  applicant: "Osoba, grupa, organizacja lub instytucja z pomysłem",
  amount: "Grant na przetestowanie pomysłu. Kwotę podaje regulamin naboru.",
  deadline: "Termin kolejnego naboru ogłasza ROPS.",
  why: "Inkubator pomaga zaprojektować i przetestować nowe rozwiązanie.",
  steps: [
    "Zapisz potrzebę w banku potrzeb.",
    "Przygotuj fiszkę potrzeby dla inkubatora.",
    "Zgłoś pomysł w najbliższym naborze.",
  ],
  source: { label: "Innowacje społeczne w ROPS w Krakowie", url: "https://rops.krakow.pl/innowacje-spoleczne" },
};

const seniors: MockRoute = {
  id: "przyklad-seniorzy",
  mode: "route",
  needSummary: "Samotni seniorzy w gminie wiejskiej bez domu dziennego pobytu",
  defaultPlaceTerc: "1207062",
  defaultRole: "instytucja",
  summary:
    "Samotne osoby starsze potrzebują miejsca i powodu do spotkań. Dwa pierwsze rozwiązania wymagają tylko sali, osoby prowadzącej i prostych materiałów. Można je zacząć w świetlicy albo w bibliotece.",
  solutions: [
    {
      innovationId: "inn-nat-649",
      fit: 86,
      reasons: [
        {
          text: "wykluczenia osób starszych z aktywności społecznej ze względu na wiek, ograniczoną mobilność",
          field: "problem",
        },
        { text: "Dzieci uczą seniorów korzystania z nowoczesnych technologii, komunikatorów internetowych", field: "mechanism" },
      ],
      gaps: [],
      whereItWorks: "Żurawiczki w gminie Zarzecze, województwo podkarpackie",
    },
    {
      innovationId: "inn-nat-865",
      fit: 78,
      reasons: [
        { text: "problem samotności i izolacji społecznej", field: "problem" },
        { text: "gra składająca się z zestawu kart z różnymi zadaniami dla graczy", field: "mechanism" },
      ],
      gaps: [],
      whereItWorks: "Źródło nie podaje miejsc wdrożeń.",
    },
    {
      innovationId: "inn-nat-biblioteka-senior-dla-seniora",
      fit: 71,
      reasons: [{ text: "Samotność i marginalizacja osób starszych", field: "problem" }],
      gaps: [],
      whereItWorks: "Tarnowskie Góry, województwo śląskie",
    },
  ],
  knowledge: [
    {
      about: "Kapsuła czasu - recepta na samotność",
      title: "Plan zajęć warsztatowych",
      format: "PDF",
      url: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/43350/Plan%20zajęć%20warsztatowych_opis.pdf",
    },
    {
      about: "Kapsuła czasu - recepta na samotność",
      title: "Poradnik dla prowadzących",
      format: "PDF",
      url: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/43350/Skrypt%20(poradnik).pdf",
    },
    {
      about: "Masz szczęście - gra towarzyska",
      title: "Instrukcja do gry",
      format: "PDF",
      url: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/13052/681_01_instrukcja_do_gry.pdf",
    },
    abcDiagnozy,
  ],
  people: [
    {
      name: "Gmina Zarzecze",
      role: "Autorzy rozwiązania Kapsuła czasu",
      channels: [{ kind: "website", value: "innoes.pl", href: "https://innoes.pl/innowacje/7" }],
      contactInnovationId: "inn-nat-649",
    },
    {
      name: "BLOOM Katarzyna Majewska",
      role: "Twórcy gry Masz szczęście",
      channels: [],
      contactInnovationId: "inn-nat-865",
    },
    ropsAdvisor("Opiekun kategorii Seniorzy"),
  ],
  readinessCount: 0,
  paths: [
    {
      id: "asy-priorytet-v",
      name: "Program Aktywni Seniorzy ASY, priorytet V",
      applicant: "Gmina",
      amount: "Do 200 000 zł na utworzenie klubu seniora, do 80 % kosztów",
      deadline: "Nabór w kwietniu. Następny spodziewany w 2027 r.",
      why: "Gmina może otworzyć klub seniora w świetlicy lub innym wolnym lokalu.",
      steps: [
        "Ustal z wójtem lub burmistrzem, kto przygotuje wniosek.",
        "Opisz lokal i plan zajęć klubu.",
        "Złóż wniosek w kwietniowym naborze.",
      ],
      source: {
        label: "Program w Monitorze Polskim, M.P. 2025 poz. 1255",
        url: "https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WMP20250001255",
      },
    },
    smallGrant,
    localInitiative,
  ],
  nextSteps: [
    {
      text: "Pobierz plan zajęć Kapsuły czasu.",
      href: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/43350/Plan%20zajęć%20warsztatowych_opis.pdf",
    },
    { text: "Poproś Gminę Zarzecze o rozmowę.", href: "/kontakt?innowacja=inn-nat-649&droga=przyklad-seniorzy" },
    { text: "Sprawdź program Aktywni Seniorzy ASY.", href: "#sciezka-asy-priorytet-v" },
  ],
  unknowns: [
    "Nie znamy wdrożeń tych rozwiązań w Małopolsce.",
    "Nie wiemy, czy lokal jest dostępny dla osób poruszających się na wózku.",
  ],
};

const youth: MockRoute = {
  id: "przyklad-mlodziez",
  mode: "partial",
  needSummary: "Młodzież bez miejsca spotkań i picie alkoholu na przystanku",
  defaultRole: "organizacja",
  modeReason:
    "Najlepsze dopasowanie to 58 na 100. Rozwiązania pomagają pracować z młodzieżą, ale nie tworzą miejsca spotkań.",
  solutions: [
    {
      innovationId: "inn-nat-pomosty",
      fit: 58,
      reasons: [{ text: "zachęca młodzież do zgłaszania pomysłów na aktywności", field: "mechanism" }],
      gaps: [
        "Działa w młodzieżowych ośrodkach socjoterapii, a nie w otwartym miejscu spotkań.",
        "Nie obejmuje profilaktyki picia alkoholu.",
      ],
      whereItWorks: "Źródło nie podaje miejsc wdrożeń.",
    },
    {
      innovationId: "inn-nat-scenariusze-przyszlosci",
      fit: 49,
      reasons: [{ text: "wzmacniają pewność siebie młodzieży", field: "summary" }],
      gaps: ["To warsztaty w szkole, a nie stałe miejsce spotkań.", "Nie dotyczy picia alkoholu."],
      whereItWorks: "Źródło nie podaje miejsc wdrożeń.",
    },
  ],
  knowledge: [abcDiagnozy],
  people: [ropsAdvisor("Opiekun kategorii Dzieci, młodzież i rodzina")],
  paths: [incubatorCall, smallGrant, localInitiative],
  nextSteps: [
    { text: "Zapisz potrzebę w banku potrzeb.", href: "/zapisz-potrzebe?droga=przyklad-mlodziez" },
    { text: "Napisz do Działu Innowacji Społecznych ROPS.", href: "/kontakt?droga=przyklad-mlodziez" },
    { text: "Przeczytaj, jak rozpoznać potrzeby młodzieży w gminie.", href: abcDiagnozy.url },
  ],
  unknowns: [
    "Nie znamy innowacji, które tworzą miejsca spotkań dla młodzieży.",
    "Nie wiemy, ilu młodych ludzi dotyczy problem.",
  ],
};

const childrenUkraine: MockRoute = {
  id: "przyklad-dzieci",
  mode: "none",
  needSummary: "Dzieci z rodzin z Ukrainy bez pomocy w odrabianiu lekcji",
  defaultRole: "mieszkaniec",
  modeReason:
    "Najlepsze dopasowanie to 41 na 100. W bazach nie ma innowacji o pomocy w lekcjach dla dzieci z Ukrainy.",
  solutions: [
    {
      innovationId: "inn-rops-moj-pomocny-virtual-world",
      fit: 41,
      reasons: [{ text: "trudności w adaptacji w środowisku szkolnym dzieci ukraińskich", field: "problem" }],
      gaps: [
        "To aplikacja ze zwrotami po polsku, a nie pomoc w lekcjach.",
        "Nie ma w niej osoby, która tłumaczy zadania.",
      ],
      whereItWorks: "Źródło nie podaje miejsc wdrożeń.",
    },
  ],
  knowledge: [abcDiagnozy],
  people: [ropsAdvisor("Opiekun kategorii Cudzoziemcy")],
  paths: [incubatorCall, localInitiative, smallGrant],
  nextSteps: [
    { text: "Zapisz potrzebę w banku potrzeb.", href: "/zapisz-potrzebe?droga=przyklad-dzieci" },
    { text: "Napisz do Działu Innowacji Społecznych ROPS.", href: "/kontakt?droga=przyklad-dzieci" },
    { text: "Sprawdź, czy gmina ma uchwałę o inicjatywie lokalnej.", href: "#sciezka-inicjatywa-lokalna" },
  ],
  unknowns: ["Nie wiemy, ilu dzieci dotyczy problem.", "Nie znamy szkół w okolicy, które już pomagają."],
};

const noMatch: MockRoute = {
  id: "brak-rozwiazania",
  mode: "none",
  modeReason: "W bazach nie ma innowacji, która odpowiada na ten opis.",
  solutions: [],
  knowledge: [abcDiagnozy],
  people: [ropsAdvisor("Opiekunowie wszystkich kategorii innowacji")],
  paths: [incubatorCall, localInitiative, smallGrant],
  nextSteps: [
    { text: "Zapisz potrzebę w banku potrzeb.", href: "/zapisz-potrzebe?droga=brak-rozwiazania" },
    { text: "Napisz do Działu Innowacji Społecznych ROPS.", href: "/kontakt?droga=brak-rozwiazania" },
    { text: "Przeczytaj, jak rozpoznać potrzeby mieszkańców gminy.", href: abcDiagnozy.url },
  ],
  unknowns: ["Nie wiemy, czy podobną potrzebę zgłosiły inne gminy."],
};

const humanHelp: MockRoute = {
  id: "pomoc-czlowieka",
  mode: "redirected",
  solutions: [],
  knowledge: [],
  people: [],
  paths: [],
  nextSteps: [],
  unknowns: [],
};

const declined: MockRoute = {
  id: "z-tym-nie-pomozemy",
  mode: "declined",
  referenceCode: "HM-2026-0417",
  solutions: [],
  knowledge: [],
  people: [],
  paths: [],
  nextSteps: [],
  unknowns: [],
};

const offTopic: MockRoute = {
  id: "inny-cel",
  mode: "off_topic",
  solutions: [],
  knowledge: [],
  people: [],
  paths: [],
  nextSteps: [],
  unknowns: [],
};

const routes = new Map(
  [seniors, youth, childrenUkraine, noMatch, humanHelp, declined, offTopic].map((route) => [route.id, route]),
);

export function getMockRoute(id: string): MockRoute | undefined {
  return routes.get(id);
}
