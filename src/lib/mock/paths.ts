import type { ImplementationPath } from "@/lib/contracts";
import { t } from "@/lib/i18n";

/*
 * Paths in the shape of schema 8.7, the fallback for data/built/paths/ (FR-8.1), with
 * the facts of section 14.4. No lawyer reviewed them (decided): every
 * path carries the
 * prototype note of FR-1.8.
 */
const prototypeNote = t("attribution.note");

const paths: ImplementationPath[] = [
  {
    id: "asy-priorytet-v",
    name_pl: "Program Aktywni Seniorzy ASY, priorytet V",
    legal_basis_pl: "Rządowy program wieloletni „Aktywni Seniorzy - ASY” na lata 2026-2030, M.P. 2025 poz. 1255",
    applicant_types: ["jst"],
    amount_note_pl:
      "Utworzenie klubu seniora do 200 000 zł, dziennego domu do 400 000 zł, do 80 % kosztów; na działanie do 50 % kosztów.",
    timing: {
      kind: "fixed",
      note_pl: "Nabór w kwietniu, w 2026 r. do 24 kwietnia. Kolejny spodziewany od kwietnia do lipca 2027 r.",
    },
    decision_maker_pl: "Pełnomocnik Rządu do spraw Polityki Senioralnej; oferty ocenia wojewoda",
    steps_pl: [
      "Ustal z wójtem lub burmistrzem, kto przygotuje ofertę.",
      "Opisz lokal, liczbę miejsc i plan zajęć klubu.",
      "Złóż ofertę w kwietniowym naborze.",
    ],
    source_url: "https://www.gov.pl/web/senior/ogloszenie-o-konkursie-priorytet-v---asy-2026",
    verified_on: "2026-10-03",
    reviewer: null,
    notes_pl: prototypeNote,
  },
  {
    id: "maly-grant-19a",
    name_pl: "Mały grant, tryb uproszczony z art. 19a",
    legal_basis_pl:
      "art. 19a ustawy z dnia 24 kwietnia 2003 r. o działalności pożytku publicznego i o wolontariacie, t.j. Dz.U. 2025 poz. 1338, zm. Dz.U. 2026 poz. 1040",
    applicant_types: ["ngo"],
    amount_note_pl:
      "Do 20 000 zł na jedno zadanie i łącznie do 40 000 zł w roku od jednej jednostki samorządu dla jednej organizacji. Limity obowiązują od 1 września 2026 r.",
    timing: { kind: "rolling", note_pl: "W dowolnym momencie. Urząd publikuje ofertę na 7 dni i każdy może zgłosić uwagi." },
    decision_maker_pl: "wójt, burmistrz, prezydent miasta albo zarząd powiatu lub województwa, uznając celowość zadania",
    steps_pl: [
      "Przygotuj ofertę na obowiązującym wzorze i opisz zadanie, koszty i termin.",
      "Złóż ofertę w urzędzie gminy lub starostwie. Urząd publikuje ją na 7 dni.",
      "Po 7 dniach i rozpatrzeniu uwag podpisz umowę i zacznij zadanie.",
    ],
    source_url: "https://eli.gov.pl/eli/DU/2026/1040/ogl/pol",
    verified_on: "2026-10-03",
    reviewer: null,
    notes_pl: `Część urzędów, w tym Kraków, nadal podaje stary limit 10 000 zł. Sprawdź aktualny komunikat urzędu. ${prototypeNote}`,
  },
  {
    id: "inicjatywa-lokalna",
    name_pl: "Inicjatywa lokalna",
    legal_basis_pl:
      "art. 19b do 19h ustawy z dnia 24 kwietnia 2003 r. o działalności pożytku publicznego i o wolontariacie, t.j. Dz.U. 2025 poz. 1338",
    applicant_types: ["mieszkancy", "ngo"],
    amount_note_pl: "Bez stałej kwoty. Gmina wspiera zadanie, a mieszkańcy wnoszą wkład pracą, pieniędzmi lub rzeczowo.",
    timing: {
      kind: "resolution",
      note_pl: "Zasady i terminy określa uchwała rady gminy. W Krakowie wnioski przyjmowane są na bieżąco.",
    },
    decision_maker_pl: "organ wykonawczy gminy, oceniając celowość zadania",
    steps_pl: [
      "Sprawdź uchwałę rady gminy o inicjatywie lokalnej.",
      "Zbierz grupę mieszkańców i opisz zadanie oraz swój wkład.",
      "Złóż wniosek w urzędzie gminy.",
    ],
    source_url: "https://eli.gov.pl/eli/DU/2025/1338/ogl/pol",
    verified_on: "2026-10-03",
    reviewer: null,
    notes_pl: prototypeNote,
  },
  {
    id: "usluga-wrazliwa-b",
    name_pl: "Grant ROPS „Usługa wrażliwa” na wdrożenie innowacji",
    legal_basis_pl:
      "Projekt ROPS w Krakowie „Usługa wrażliwa - upowszechnianie innowacji społecznych w środowiskach lokalnych”, program Fundusze Europejskie dla Małopolski 2021-2027, działanie 6.23",
    applicant_types: ["jst", "ngo", "firmy"],
    amount_note_pl: "Do 600 000 zł, bez wkładu własnego, na najwyżej 18 miesięcy.",
    timing: {
      kind: "none-open",
      note_pl: "Nabór I zakończył się 20 lutego 2026 r., nabór II 30 czerwca 2026 r. Kolejnego naboru nie ogłoszono, sprawdź u źródła.",
    },
    decision_maker_pl: "ROPS w Krakowie",
    steps_pl: [
      "Wybierz innowację z Biblioteki innowacji społecznych ROPS, którą chcesz wdrożyć.",
      "Zapytaj o kolejny nabór pod adresem uw@rops.krakow.pl.",
      "Przygotuj z partnerami plan wdrożenia na najwyżej 18 miesięcy.",
    ],
    source_url:
      "https://rops.krakow.pl/realizowane-projekty-i-zadania/usluga-wrazliwa-upowszechnianie-innowacji-spolecznych-w-srodowiskach-lokalnych,o-projekcie",
    verified_on: "2026-10-03",
    reviewer: null,
    notes_pl: prototypeNote,
  },
  {
    id: "iws-inkubator",
    name_pl: "Grant Inkubatora Włączenia Społecznego 2.0",
    legal_basis_pl: "Projekt ROPS w Krakowie i INNOAGH w programie FERS, działanie 5.1, lata 2024-2028",
    applicant_types: ["osoby", "ngo", "jst", "firmy"],
    amount_note_pl: "Do 120 000 zł, finansowanie w 100 %. Średnio około 70 000 zł.",
    timing: {
      kind: "none-open",
      note_pl: "Jedyny nabór trwał od 13 listopada do 13 grudnia 2024 r. Na 2026 r. nie ogłoszono naboru. Zapytaj ROPS.",
    },
    decision_maker_pl: "ROPS w Krakowie",
    steps_pl: [
      "Zapisz potrzebę w banku potrzeb.",
      "Przygotuj fiszkę potrzeby dla inkubatora.",
      "Zapytaj Dział Innowacji Społecznych ROPS o kolejny nabór.",
    ],
    source_url: "https://mapadotacji.gov.pl/projekty/1677388/",
    verified_on: "2026-10-03",
    reviewer: null,
    notes_pl: prototypeNote,
  },
];

const pathsById = new Map(paths.map((path) => [path.id, path]));

export function getPath(id: string): ImplementationPath | undefined {
  return pathsById.get(id);
}

/** Every path, for the deterministic selection by applicant type (FR-8.2). */
export function allPaths(): ImplementationPath[] {
  return paths;
}
