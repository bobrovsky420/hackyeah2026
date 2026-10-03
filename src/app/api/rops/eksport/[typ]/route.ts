import { getGmina } from "@/lib/mock/data";
import { isAuthenticated } from "@/lib/server/auth";
import { toCsv } from "@/lib/server/csv";
import { store } from "@/lib/server/store";

const gminaName = (terc: string | null) => getGmina(terc)?.name ?? "";

/* "Eksportuj CSV" of the console (S7), with the moderation columns of FR-12.8. */
const exports = {
  potrzeby: () =>
    toCsv(
      ["id", "data", "gmina", "teryt", "rola", "opis", "streszczenie", "grupy", "zgoda_na_publikacje", "status", "moderacja", "moderujacy", "data_decyzji", "powod", "notatka", "przyklad"],
      store.needs.map((need) => [
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
  kontakty: () =>
    toCsv(
      ["id", "data", "imie_i_nazwisko", "organizacja", "email", "cel", "cel_id", "droga", "wiadomosc", "status", "moderacja", "moderujacy", "data_decyzji", "powod", "notatka"],
      store.contacts.map((contact) => [
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
  gotowosc: () =>
    toCsv(
      ["id", "data", "nazwa", "organizacja", "gmina", "teryt", "tematy", "kanal", "kontakt", "pokazac_nazwe", "weryfikacja", "weryfikujacy", "data_weryfikacji", "przechowywac_do", "notatka"],
      store.readiness.map((entry) => [
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
      ]),
    ),
};

export async function GET(_request: Request, { params }: RouteContext<"/api/rops/eksport/[typ]">) {
  if (!(await isAuthenticated())) return new Response("Brak dostępu", { status: 401 });
  const { typ } = await params;
  if (!Object.hasOwn(exports, typ)) return new Response("Nie ma takiego eksportu", { status: 404 });
  const csv = exports[typ as keyof typeof exports]();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${typ}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
