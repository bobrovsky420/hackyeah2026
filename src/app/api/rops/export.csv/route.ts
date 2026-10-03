import { getGmina } from "@/lib/catalogue";
import { t } from "@/lib/i18n";
import { toCsv } from "@/lib/server/csv";
import { apiError, withConsole } from "@/server/console/api";
import { repository } from "@/server/db";

const gminaName = (terc: string | null) => getGmina(terc)?.name ?? "";

/* "Eksportuj CSV" of the console (S7), with the moderation columns of FR-12.8. */
const exports = {
  needs: async () =>
    toCsv(
      ["id", "data", "gmina", "teryt", "rola", "opis", "streszczenie", "grupy", "zgoda_na_publikacje", "status", "moderacja", "moderujacy", "data_decyzji", "powod", "notatka", "przyklad"],
      (await repository().listNeeds()).map((need) => [
        need.id,
        need.created_at,
        gminaName(need.place_terc),
        need.place_terc,
        need.role,
        need.problem_text,
        need.summary_pl,
        need.target_groups.join(", "),
        need.consents.publish_anonymised,
        need.status,
        need.moderation.status,
        need.moderation.reviewer,
        need.moderation.decided_at,
        need.moderation.reason_pl,
        need.note_pl,
        need.example,
      ]),
    ),
  contacts: async () =>
    toCsv(
      ["id", "data", "imie_i_nazwisko", "organizacja", "email", "cel", "cel_id", "droga", "wiadomosc", "status", "moderacja", "moderujacy", "data_decyzji", "powod", "notatka"],
      (await repository().listContacts()).map((contact) => [
        contact.id,
        contact.created_at,
        contact.requester.name,
        contact.requester.organisation,
        contact.requester.email,
        contact.target.type,
        contact.target.id,
        contact.route_id,
        contact.message,
        contact.status,
        contact.moderation.status,
        contact.moderation.reviewer,
        contact.moderation.decided_at,
        contact.moderation.reason_pl,
        contact.note_pl,
      ]),
    ),
  readiness: async () =>
    toCsv(
      ["id", "data", "nazwa", "organizacja", "gmina", "teryt", "tematy", "kanal", "kontakt", "pokazac_nazwe", "weryfikacja", "weryfikujacy", "data_weryfikacji", "przechowywac_do", "notatka", "przyklad"],
      (await repository().listReadiness()).map((entry) => [
        entry.id,
        entry.created_at,
        entry.display_name,
        entry.is_organisation,
        gminaName(entry.place_terc),
        entry.place_terc,
        entry.topics.join(", "),
        entry.channel.type,
        entry.channel.value,
        entry.consent_display_name,
        entry.verification.status,
        entry.verification.reviewer,
        entry.verification.decided_at,
        entry.retention_until,
        entry.note_pl,
        entry.example ?? false,
      ]),
    ),
  reports: async () =>
    toCsv(
      ["id", "data", "rodzaj_tresci", "tresc_id", "powod_zgloszenia", "komentarz", "moderacja", "moderujacy", "data_decyzji", "powod"],
      (await repository().listReports()).map((report) => [
        report.id,
        report.created_at,
        report.target.type,
        report.target.id,
        report.reason,
        report.comment,
        report.moderation.status,
        report.moderation.reviewer,
        report.moderation.decided_at,
        report.moderation.reason_pl,
      ]),
    ),
  // FR-12.7: the log as the repository keeps it, so a text only while it is kept (declined and spam, seven days).
  screening: async () =>
    toCsv(
      ["id", "data", "rodzaj", "kategoria", "pewnosc", "wynik", "tematy_wrazliwe", "usuniete_fragmenty", "reguly", "wersja_promptu", "skrot_tekstu", "tekst", "tekst_do", "droga", "przejrzano"],
      (await repository().listScreeningLog(Date.now())).map((entry) => [
        entry.id,
        entry.at,
        entry.kind,
        entry.category,
        entry.confidence,
        entry.outcome,
        entry.sensitive_topics.join(", "),
        entry.redaction_count,
        entry.rules_fired.join(", "),
        entry.prompt_version,
        entry.text_sha256,
        entry.text,
        entry.text_until,
        entry.ref,
        entry.reviewed_at,
      ]),
    ),
};

type ExportName = keyof typeof exports;

// The downloaded file is named in Polish: the reader sees it.
const fileNames: Record<ExportName, string> = {
  needs: "potrzeby",
  contacts: "kontakty",
  readiness: "gotowosc",
  reports: "zgloszenia-tresci",
  screening: "dziennik-sprawdzania",
};

/** GET /api/rops/export.csv?what=needs|contacts|readiness|reports|screening (9.2). */
export async function GET(request: Request) {
  return withConsole(request, async () => {
    const what = new URL(request.url).searchParams.get("what") ?? "";
    if (!Object.hasOwn(exports, what)) return apiError(404, "unknown_export", t("api.rops.unknownExport"));
    const name = what as ExportName;
    const csv = await exports[name]();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileNames[name]}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
