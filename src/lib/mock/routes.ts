import type { Route } from "@/lib/contracts/route";
import { t } from "@/lib/i18n";
import { ropsDepartment } from "./contacts";
import { withPlaceFacts } from "./implementations";

/*
 * Canned routes in the shape of schema 8.4, standing in for the matching
 * engine and the route composer. The records come from innovations.json;
 * the fit numbers, summaries, reasons and next steps play the part of the
 * model's text. "{route}" in a link is replaced by the route's own id.
 */

const ABC_DIAGNOZY = "https://rops.krakow.pl/mpliki/MACIUS/ABC_Diagnozy_final.pdf";
const KAPSULA_PLAN =
  "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/43350/Plan%20zajęć%20warsztatowych_opis.pdf";
const BEZ_PRESJI = "https://rops.krakow.pl/pliki/IS/bibloteka/bezpresji.zip";
const MOBILNA_POMOC = "https://rops.krakow.pl/pliki/IS/bibloteka/mobilnapomoc.zip";

const common = {
  created_at: "2026-10-03T10:00:00+02:00",
  screening: { category: "need", confidence: 0.93, sensitive_topics: [], redactions: 0, crisis_banner: false },
  clarification_needed: false,
  engine: {
    provider: "replay",
    model: "prototyp",
    prompt_version: "prototyp-v1",
    data_version: "2026-10-03",
    latency_ms: 0,
    cached: true,
  },
  label_pl: t("route.generated.label"),
  reference_code: null,
} satisfies Partial<Route>;

function advisor(category: string): Route["people"]["advisor"] {
  return { category, name: null, role: ropsDepartment.name, email: ropsDepartment.email, phone: ropsDepartment.phone };
}

const noPeople = (category: string): Route["people"] => ({
  innovators: [],
  implementers_nearby: [],
  advisor: advisor(category),
  readiness: { count: 0, names_with_consent: [] },
});

const abcDiagnozy = {
  title: "ABC Diagnozy: jak rozpoznać potrzeby mieszkańców gminy",
  url: ABC_DIAGNOZY,
  type: "guide",
  for_innovation_id: null,
};

const seniors: Route = {
  ...common,
  id: "przyklad-seniorzy",
  input: {
    problem_text: t("s1.examples.seniors.text"),
    place_terc: "1207062",
    place_name: "Laskowa",
    role: "pracownik-instytucji",
    target_groups: ["seniorzy"],
  },
  mode: "route",
  need_summary_pl: "Samotni seniorzy w gminie wiejskiej bez domu dziennego pobytu",
  mode_reason_pl: "Trzy rozwiązania odpowiadają bezpośrednio na opisany problem.",
  summary_pl:
    "Samotne osoby starsze potrzebują miejsca i powodu do spotkań. Dwa pierwsze rozwiązania wymagają tylko sali, osoby prowadzącej i prostych materiałów. Można je zacząć w świetlicy albo w bibliotece.",
  solutions: [
    {
      innovation_id: "inn-nat-649",
      fit_score: 86,
      fit_label_pl: "bardzo dobre dopasowanie",
      fit_reasons: [
        {
          field: "problem",
          quote: "wykluczenia osób starszych z aktywności społecznej ze względu na wiek, ograniczoną mobilność",
          why_pl: "Dotyczy osób starszych, które nie wychodzą z domu.",
        },
        {
          field: "jak_dziala",
          quote: "Dzieci uczą seniorów korzystania z nowoczesnych technologii, komunikatorów internetowych",
          why_pl: "Daje powód do regularnych spotkań w świetlicy.",
        },
      ],
      gaps_pl: [],
      adaptation_note_pl: "Zajęcia mogą prowadzić uczniowie pobliskiej szkoły.",
      what_it_takes: {
        implementer_types: ["placowka", "ngo", "osoba"],
        cost_band: "low",
        time_to_implement: "weeks",
        evidence_level: "tested",
      },
      where_it_runs: { count: 1, nearest: [] },
      materials: [{ title: "Plan zajęć warsztatowych", url: KAPSULA_PLAN, type: "pdf" }],
      contact: { organisation: "Gmina Zarzecze", channels: [{ type: "www", value: "https://innoes.pl/innowacje/7" }] },
    },
    {
      innovation_id: "inn-nat-865",
      fit_score: 78,
      fit_label_pl: "dobre dopasowanie",
      fit_reasons: [
        { field: "problem", quote: "problem samotności i izolacji społecznej", why_pl: "Odpowiada na samotność osób starszych." },
        {
          field: "jak_dziala",
          quote: "gra składająca się z zestawu kart z różnymi zadaniami dla graczy",
          why_pl: "Wystarczy wydruk gry i osoba, która ją poprowadzi.",
        },
      ],
      gaps_pl: [],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["placowka"],
        cost_band: "low",
        time_to_implement: "days",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [
        {
          title: "Instrukcja do gry",
          url: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/13052/681_01_instrukcja_do_gry.pdf",
          type: "pdf",
        },
      ],
      contact: { organisation: "BLOOM Katarzyna Majewska", channels: [] },
    },
    {
      innovation_id: "inn-nat-biblioteka-senior-dla-seniora",
      fit_score: 71,
      fit_label_pl: "dobre dopasowanie",
      fit_reasons: [
        {
          field: "problem",
          quote: "Samotność i marginalizacja osób starszych",
          why_pl: "Nazywa ten sam problem, który opisujesz.",
        },
      ],
      gaps_pl: [],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["placowka", "ngo", "ops-cus-pcpr"],
        cost_band: "low",
        time_to_implement: "months",
        evidence_level: "tested",
      },
      where_it_runs: { count: 1, nearest: [] },
      materials: [],
      contact: {
        organisation: "Miejski Ośrodek Pomocy w Tarnowskich Górach",
        channels: [{ type: "www", value: "https://www.mopstg.pl/p,164,biblioteka-senior-dla-seniora" }],
      },
    },
  ],
  knowledge: [
    { title: "Plan zajęć warsztatowych", url: KAPSULA_PLAN, type: "pdf", for_innovation_id: "inn-nat-649" },
    {
      title: "Poradnik dla prowadzących",
      url: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/43350/Skrypt%20(poradnik).pdf",
      type: "pdf",
      for_innovation_id: "inn-nat-649",
    },
    {
      title: "Instrukcja do gry",
      url: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/13052/681_01_instrukcja_do_gry.pdf",
      type: "pdf",
      for_innovation_id: "inn-nat-865",
    },
    abcDiagnozy,
  ],
  people: {
    innovators: [
      {
        organisation: "Gmina Zarzecze",
        channels: [{ type: "www", value: "https://innoes.pl/innowacje/7" }],
        persons_public: [],
        innovation_id: "inn-nat-649",
      },
      { organisation: "BLOOM Katarzyna Majewska", channels: [], persons_public: [], innovation_id: "inn-nat-865" },
    ],
    implementers_nearby: [],
    advisor: advisor("seniorzy"),
    readiness: { count: 0, names_with_consent: [] },
  },
  path: {
    applicant_type: "jst",
    cost_band: "low",
    paths: [
      { path_id: "asy-priorytet-v", why_pl: "Gmina może otworzyć klub seniora w świetlicy lub innym wolnym lokalu." },
      { path_id: "maly-grant-19a", why_pl: "Organizacja z gminy może szybko zacząć zajęcia z grą lub warsztaty." },
      { path_id: "inicjatywa-lokalna", why_pl: "Mieszkańcy mogą sami zorganizować spotkania w świetlicy z pomocą gminy." },
    ],
  },
  next_steps: [
    { text_pl: "Pobierz plan zajęć Kapsuły czasu.", link: KAPSULA_PLAN },
    { text_pl: "Poproś Gminę Zarzecze o rozmowę.", link: "/kontakt?innowacja=inn-nat-649&droga={route}" },
    { text_pl: "Sprawdź program Aktywni Seniorzy ASY.", link: "#sciezka-asy-priorytet-v" },
  ],
  unknowns_pl: [
    "Nie znamy wdrożeń tych rozwiązań w promieniu 50 km.",
    "Nie wiemy, czy lokal jest dostępny dla osób poruszających się na wózku.",
  ],
};

const createNewPaths = (first: string): Route["path"] => ({
  applicant_type: "ngo",
  cost_band: "unknown",
  paths: [
    { path_id: "iws-inkubator", why_pl: first },
    { path_id: "maly-grant-19a", why_pl: "Mały grant wystarczy na pilotaż nowego pomysłu." },
    { path_id: "inicjatywa-lokalna", why_pl: "Mieszkańcy mogą zacząć sami, z pomocą gminy." },
  ],
});

const bankSteps = (third: Route["next_steps"][number]): Route["next_steps"] => [
  { text_pl: "Zapisz potrzebę w banku potrzeb.", link: "/zapisz-potrzebe?droga={route}" },
  { text_pl: "Napisz do Działu Innowacji Społecznych ROPS.", link: "/kontakt?droga={route}" },
  third,
];

const youth: Route = {
  ...common,
  id: "przyklad-mlodziez",
  input: {
    problem_text: t("s1.examples.youth.text"),
    place_terc: null,
    place_name: null,
    role: "organizacja-spoleczna",
    target_groups: ["dzieci-mlodziez-rodziny"],
  },
  mode: "partial",
  need_summary_pl: "Młodzież bez miejsca spotkań i picie alkoholu na przystanku",
  mode_reason_pl:
    "Najlepsze dopasowanie to 58 na 100. Rozwiązania pomagają pracować z młodzieżą, ale nie tworzą miejsca spotkań.",
  summary_pl: null,
  solutions: [
    {
      innovation_id: "inn-nat-pomosty",
      fit_score: 58,
      fit_label_pl: "częściowe dopasowanie",
      fit_reasons: [
        {
          field: "jak_dziala",
          quote: "zachęca młodzież do zgłaszania pomysłów na aktywności",
          why_pl: "Młodzież sama wybiera, co chce robić.",
        },
      ],
      gaps_pl: [
        "Działa w młodzieżowych ośrodkach socjoterapii, a nie w otwartym miejscu spotkań.",
        "Nie obejmuje profilaktyki picia alkoholu.",
      ],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["ops-cus-pcpr", "placowka"],
        cost_band: "medium",
        time_to_implement: "months",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [],
      contact: { organisation: null, channels: [] },
    },
    {
      innovation_id: "inn-nat-scenariusze-przyszlosci",
      fit_score: 49,
      fit_label_pl: "częściowe dopasowanie",
      fit_reasons: [
        {
          field: "problem",
          quote: "braku w szkolnej edukacji przestrzeni do krytycznego i odważnego myślenia o własnej przyszłości",
          why_pl: "Daje młodym ludziom przestrzeń i poczucie sprawczości.",
        },
      ],
      gaps_pl: ["To warsztaty w szkole, a nie stałe miejsce spotkań.", "Nie dotyczy picia alkoholu."],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["placowka"],
        cost_band: "low",
        time_to_implement: "weeks",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [],
      contact: { organisation: "Stowarzyszenie Pedagogów Teatru", channels: [] },
    },
  ],
  knowledge: [abcDiagnozy],
  people: noPeople("dzieci-mlodziez-rodziny"),
  path: createNewPaths("Inkubator pomaga zaprojektować i przetestować miejsce spotkań dla młodzieży."),
  next_steps: bankSteps({ text_pl: "Przeczytaj, jak rozpoznać potrzeby młodzieży w gminie.", link: ABC_DIAGNOZY }),
  unknowns_pl: [
    "Nie znamy innowacji, które tworzą miejsca spotkań dla młodzieży.",
    "Nie wiemy, ilu młodych ludzi dotyczy problem.",
  ],
};

const children: Route = {
  ...common,
  id: "przyklad-dzieci",
  input: {
    problem_text: t("s1.examples.children.text"),
    place_terc: null,
    place_name: null,
    role: "mieszkaniec",
    target_groups: ["dzieci-mlodziez-rodziny", "cudzoziemcy"],
  },
  mode: "none",
  need_summary_pl: "Dzieci z rodzin z Ukrainy bez pomocy w odrabianiu lekcji",
  mode_reason_pl:
    "Najlepsze dopasowanie to 41 na 100. W bazach nie ma innowacji o pomocy w lekcjach dla dzieci z Ukrainy.",
  summary_pl: null,
  solutions: [
    {
      innovation_id: "inn-rops-moj-pomocny-virtual-world",
      fit_score: 41,
      fit_label_pl: "niskie dopasowanie",
      fit_reasons: [
        {
          field: "jakich_problemow_dotyczy",
          quote: "trudności w adaptacji w środowisku szkolnym dzieci ukraińskich",
          why_pl: "Dotyczy tych samych dzieci i ich szkoły.",
        },
      ],
      gaps_pl: [
        "To aplikacja ze zwrotami po polsku, a nie pomoc w lekcjach.",
        "Nie ma w niej osoby, która tłumaczy zadania.",
      ],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["placowka"],
        cost_band: "low",
        time_to_implement: "days",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [],
      contact: { organisation: "Stowarzyszenie Edukacja Praktyczna T.K.K", channels: [] },
    },
  ],
  knowledge: [abcDiagnozy],
  people: noPeople("cudzoziemcy"),
  path: createNewPaths("Inkubator pomaga zaprojektować i przetestować pomoc w lekcjach."),
  next_steps: bankSteps({
    text_pl: "Sprawdź, czy gmina ma uchwałę o inicjatywie lokalnej.",
    link: "#sciezka-inicjatywa-lokalna",
  }),
  unknowns_pl: ["Nie wiemy, ilu dzieci dotyczy problem.", "Nie znamy szkół w okolicy, które już pomagają."],
};

const noMatch: Route = {
  ...common,
  id: "brak-rozwiazania",
  input: { problem_text: null, place_terc: null, place_name: null, role: null, target_groups: [] },
  mode: "none",
  need_summary_pl: null,
  mode_reason_pl: "W bazach nie ma innowacji, która odpowiada na ten opis.",
  summary_pl: null,
  solutions: [],
  knowledge: [abcDiagnozy],
  people: noPeople("inne"),
  path: createNewPaths("Inkubator pomaga zaprojektować i przetestować nowe rozwiązanie."),
  next_steps: bankSteps({ text_pl: "Przeczytaj, jak rozpoznać potrzeby mieszkańców gminy.", link: ABC_DIAGNOZY }),
  unknowns_pl: ["Nie wiemy, czy podobną potrzebę zgłosiły inne gminy."],
};

/* S01 kind (13.1): a community need about suicide keeps its route and gets the crisis banner. */
const mentalHealth: Route = {
  ...common,
  id: "przyklad-zdrowie-psychiczne",
  input: {
    problem_text:
      "Jestem pedagożką szkolną. W naszym powiecie przybywa prób samobójczych wśród młodzieży, a uczniowie wracający do szkoły po leczeniu nie mają wsparcia.",
    place_terc: null,
    place_name: null,
    role: "pracownik-instytucji",
    target_groups: ["dzieci-mlodziez-rodziny"],
  },
  mode: "partial",
  need_summary_pl: "Więcej prób samobójczych wśród młodzieży i brak wsparcia po powrocie do szkoły",
  mode_reason_pl:
    "Najlepsze dopasowanie to 62 na 100. Rozwiązania wspierają zdrowie psychiczne uczniów, ale żadne nie jest programem zapobiegania samobójstwom.",
  screening: { ...common.screening, confidence: 0.88, sensitive_topics: ["suicide"], crisis_banner: true },
  summary_pl: null,
  solutions: [
    {
      innovation_id: "inn-rops-bez-presji-z-depresji",
      fit_score: 62,
      fit_label_pl: "częściowe dopasowanie",
      fit_reasons: [
        {
          field: "jakich_problemow_dotyczy",
          quote: "potrzeby dzieci i młodzieży borykających się z problemami zdrowia psychicznego",
          why_pl: "Wspiera uczniów, którzy wracają do szkoły po leczeniu.",
        },
        {
          field: "na_czym_polega",
          quote: "tworząc sieć wsparcia najbliższego otoczenia",
          why_pl: "Angażuje rodzinę, nauczycieli i klasę.",
        },
      ],
      gaps_pl: [
        "To materiały na powrót do szkoły po leczeniu, a nie program zapobiegania samobójstwom.",
        "Nie uczy rozpoznawania sygnałów ostrzegawczych.",
      ],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["placowka"],
        cost_band: "low",
        time_to_implement: "weeks",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [{ title: "Materiały do pobrania", url: BEZ_PRESJI, type: "zip" }],
      contact: { organisation: "Instytut HR Ewa Gordziej-Niewczyk", channels: [] },
    },
    {
      innovation_id: "inn-nat-masz-te-moc-marz-odkrywaj-ustalaj-cele",
      fit_score: 51,
      fit_label_pl: "częściowe dopasowanie",
      fit_reasons: [
        {
          field: "problem",
          quote: "może prowadzić do m.in. zaburzeń psychicznych, takich jak depresja i stany lękowe",
          why_pl: "Wzmacnia uczniów, zanim pojawi się kryzys.",
        },
      ],
      gaps_pl: ["Obejmuje uczniów klas IV-VIII, a nie starszą młodzież.", "To zajęcia profilaktyczne, a nie pomoc w kryzysie."],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["placowka"],
        cost_band: "low",
        time_to_implement: "weeks",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [
        {
          title: "Instrukcja użytkowników/użytkowniczek",
          url: "https://cdn.innowacjespoleczne.pl/app/public/docs/innovations/17782/2_instrukcja_użytkownikow_użytkowniczek.pdf",
          type: "pdf",
        },
      ],
      contact: { organisation: null, channels: [{ type: "www", value: "https://popojutrze2.pl/project/masz-te-moc/" }] },
    },
  ],
  knowledge: [
    { title: "Materiały do pobrania", url: BEZ_PRESJI, type: "zip", for_innovation_id: "inn-rops-bez-presji-z-depresji" },
    abcDiagnozy,
  ],
  people: {
    ...noPeople("dzieci-mlodziez-rodziny"),
    innovators: [
      {
        organisation: "Instytut HR Ewa Gordziej-Niewczyk",
        channels: [],
        persons_public: [],
        innovation_id: "inn-rops-bez-presji-z-depresji",
      },
    ],
  },
  path: createNewPaths("Inkubator pomaga zaprojektować i przetestować program wsparcia psychicznego młodzieży."),
  next_steps: bankSteps({ text_pl: "Pobierz materiały „Bez presji z depresji”.", link: BEZ_PRESJI }),
  unknowns_pl: [
    "Nie znamy innowacji, która jest programem zapobiegania samobójstwom wśród młodzieży.",
    "Nie wiemy, ile szkół w powiecie ma psychologa.",
  ],
};

/* S02 kind (13.1): domestic violence at community level keeps its route, with the banner and the quick exit. */
const violence: Route = {
  ...common,
  id: "przyklad-przemoc",
  input: {
    problem_text:
      "Pracuję w gminnym ośrodku pomocy społecznej. Przybywa zgłoszeń przemocy domowej, a zespół interdyscyplinarny nie nadąża. Rodziny, u których podejrzewamy przemoc, długo czekają na pomoc.",
    place_terc: "1214012",
    place_name: "Koniusza",
    role: "pracownik-instytucji",
    target_groups: ["dzieci-mlodziez-rodziny"],
  },
  mode: "route",
  need_summary_pl: "Przemoc domowa w gminie wiejskiej i zbyt mało sił w zespole interdyscyplinarnym",
  mode_reason_pl: "Jedno rozwiązanie odpowiada bezpośrednio na opisany problem.",
  screening: { ...common.screening, confidence: 0.9, sensitive_topics: ["violence"], crisis_banner: true },
  summary_pl:
    "Mobilna pomoc terapeutyczna to model pracy ośrodka pomocy społecznej z rodzinami, u których podejrzewa się przemoc, zanim trafią do systemu pomocy. Pracownicy socjalni działają w nim razem ze specjalistami.",
  solutions: [
    {
      innovation_id: "inn-rops-mobilna-pomoc-terapeutyczna",
      fit_score: 84,
      fit_label_pl: "dobre dopasowanie",
      fit_reasons: [
        {
          field: "jakich_problemow_dotyczy",
          quote: "brak adekwatnej pomocy dla osób doświadczających przemocy",
          why_pl: "Dotyczy rodzin, u których podejrzewasz przemoc, a które nie dostają jeszcze pomocy.",
        },
        {
          field: "na_czym_polega",
          quote: "nowego schematu pracy pracowników socjalnych, w połączeniu z osobami świadczącymi specjalistyczne poradnictwo",
          why_pl: "Odciąża zespół, bo pracownicy socjalni działają razem ze specjalistami.",
        },
      ],
      gaps_pl: [],
      adaptation_note_pl: "W małej gminie specjalistów można zapraszać wspólnie z sąsiednią gminą.",
      what_it_takes: {
        implementer_types: ["ops-cus-pcpr"],
        cost_band: "medium",
        time_to_implement: "months",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [{ title: "Materiały do pobrania", url: MOBILNA_POMOC, type: "zip" }],
      contact: { organisation: "Gmina Proszowice - Gminny Ośrodek Pomocy Społecznej w Proszowicach", channels: [] },
    },
    {
      innovation_id: "inn-nat-dac-nadzieje-siec-wsparcia-dla-kobiet-doswiadczajacych-przemocy-w-rodzinie-2",
      fit_score: 63,
      fit_label_pl: "częściowe dopasowanie",
      fit_reasons: [
        {
          field: "komu_sluzy",
          quote: "Kobiety doświadczające przemocy w rodzinie, pozostające bez zatrudnienia",
          why_pl: "Pomaga kobietom, które doświadczyły przemocy, wrócić do pracy i samodzielności.",
        },
      ],
      gaps_pl: ["Dotyczy aktywizacji zawodowej kobiet, a nie pracy z całą rodziną."],
      adaptation_note_pl: null,
      what_it_takes: {
        implementer_types: ["jst", "ngo", "ops-cus-pcpr"],
        cost_band: "medium",
        time_to_implement: "months",
        evidence_level: "tested",
      },
      where_it_runs: { count: 0, nearest: [] },
      materials: [
        {
          title: "Podręcznik „Zaryzykować i zakwitnąć”",
          url: "https://cdn.innowacjespoleczne.pl/Attachments/i022/592/1.%20Podrecznik%20Zaryzykowac%20i%20zakwitnac.pdf",
          type: "pdf",
        },
      ],
      contact: { organisation: "Stowarzyszenie „TEEN CHALLENGE” Chrześcijańska Misja Społeczna", channels: [] },
    },
  ],
  knowledge: [
    { title: "Materiały do pobrania", url: MOBILNA_POMOC, type: "zip", for_innovation_id: "inn-rops-mobilna-pomoc-terapeutyczna" },
    {
      title: "Podręcznik „Zaryzykować i zakwitnąć”",
      url: "https://cdn.innowacjespoleczne.pl/Attachments/i022/592/1.%20Podrecznik%20Zaryzykowac%20i%20zakwitnac.pdf",
      type: "pdf",
      for_innovation_id: "inn-nat-dac-nadzieje-siec-wsparcia-dla-kobiet-doswiadczajacych-przemocy-w-rodzinie-2",
    },
    abcDiagnozy,
  ],
  people: {
    innovators: [
      {
        organisation: "Gmina Proszowice - Gminny Ośrodek Pomocy Społecznej w Proszowicach",
        channels: [],
        persons_public: [],
        innovation_id: "inn-rops-mobilna-pomoc-terapeutyczna",
      },
    ],
    implementers_nearby: [],
    advisor: advisor("dzieci-mlodziez-rodziny"),
    readiness: { count: 0, names_with_consent: [] },
  },
  path: {
    applicant_type: "jst",
    cost_band: "medium",
    paths: [
      {
        path_id: "usluga-wrazliwa-b",
        why_pl: "Grant ROPS jest na wdrożenie innowacji z biblioteki ROPS, takiej jak Mobilna pomoc terapeutyczna.",
      },
      { path_id: "maly-grant-19a", why_pl: "Organizacja z gminy może szybko zacząć zajęcia wsparcia dla rodzin." },
    ],
  },
  next_steps: [
    { text_pl: "Pobierz materiały Mobilnej pomocy terapeutycznej.", link: MOBILNA_POMOC },
    {
      text_pl: "Poproś ośrodek w Proszowicach o rozmowę.",
      link: "/kontakt?innowacja=inn-rops-mobilna-pomoc-terapeutyczna&droga={route}",
    },
    { text_pl: "Zapytaj ROPS o kolejny nabór „Usługi wrażliwej”.", link: "#sciezka-usluga-wrazliwa-b" },
  ],
  unknowns_pl: [
    "Nie wiemy, ilu specjalistów może zaangażować gmina.",
    "Nie znamy wyników tej innowacji w innych gminach.",
  ],
};

/* FR-2.3: no place and no group recognised, so S3 asks one question. */
const clarification: Route = {
  ...noMatch,
  id: "przyklad-doprecyzowanie",
  input: {
    problem_text: "Brakuje miejsca, w którym można spokojnie porozmawiać przy herbacie i poczuć się potrzebnym.",
    place_terc: null,
    place_name: null,
    role: null,
    target_groups: [],
  },
  clarification_needed: true,
};

/* FR-2.5: the gate removed personal data (R11 kind) and the route says how many fragments. */
const redacted: Route = {
  ...seniors,
  id: "przyklad-usuniete-dane",
  input: {
    ...seniors.input,
    problem_text: `${t("s1.examples.seniors.text")} Kontakt: [usunięto], [usunięto].`,
  },
  screening: { ...seniors.screening, redactions: 2 },
};

const screeningOutcome = (id: string, mode: Route["mode"], category: string): Route => ({
  ...common,
  id,
  input: { problem_text: null, place_terc: null, place_name: null, role: null, target_groups: [] },
  mode,
  need_summary_pl: null,
  mode_reason_pl: null,
  screening: { ...common.screening, category },
  summary_pl: null,
  solutions: [],
  knowledge: [],
  people: noPeople("inne"),
  path: { applicant_type: "", cost_band: "unknown", paths: [] },
  next_steps: [],
  unknowns_pl: [],
});

const templates: Route[] = [
  seniors,
  youth,
  children,
  mentalHealth,
  violence,
  noMatch,
  clarification,
  redacted,
  screeningOutcome("pomoc-czlowieka", "redirected", "crisis"),
  { ...screeningOutcome("z-tym-nie-pomozemy", "declined", "harm"), reference_code: "HM-2026-0417" },
  screeningOutcome("inny-cel", "off_topic", "off_topic"),
];

/** Replaces the "{route}" placeholder in the links with the route's own id. */
export function withRouteId(route: Route, id: string): Route {
  const copy = structuredClone(route);
  copy.id = id;
  copy.next_steps = copy.next_steps.map((step) => ({ ...step, link: step.link.replace("{route}", id) }));
  return copy;
}

const examples = new Map(templates.map((route) => [route.id, withPlaceFacts(withRouteId(route, route.id))]));

/** The example routes, reachable at /droga/{id} in every run of the prototype. */
export function getExampleRoute(id: string): Route | undefined {
  return examples.get(id);
}
