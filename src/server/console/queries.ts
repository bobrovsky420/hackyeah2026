import type { ContactRequest, ContactStatus } from "@/lib/contracts";
import { placeText } from "@/lib/places";
import { fold } from "@/lib/text";
import type { Repository } from "@/server/db";
import { getRoute } from "@/server/route-service";
import { listDeclinedReview } from "./review";

/*
 * What the console's pages read: the contact requests of a filter (FR-9.2,
 * the parameters of the page's GET form) and the moderation queues of
 * FR-12.8.
 */

/**
 * The contact requests of a filter. A request has no gmina of its own: the
 * place is its route's, and a request without a route matches no gmina.
 */
export async function listContactsFiltered(
  repo: Repository,
  filter: { status?: ContactStatus; gmina: string },
): Promise<ContactRequest[]> {
  const contacts = await repo.listContacts({ status: filter.status });
  if (!filter.gmina) return contacts;
  const wanted = fold(filter.gmina);
  const places = await Promise.all(
    contacts.map(async (contact) => (contact.route_id ? placeText((await getRoute(contact.route_id))?.input.place_terc) : "")),
  );
  return contacts.filter((_, index) => fold(places[index]).includes(wanted));
}

/** The moderation queues of FR-12.8: what still waits for a decision, newest first, every queue at once. */
export async function loadQueues(repo: Repository, now = Date.now()) {
  const [needs, contacts, readiness, reports, declined] = await Promise.all([
    repo.listNeeds({ publishable: true, moderation: "do-weryfikacji" }),
    repo.listContacts({ moderation: "do-weryfikacji" }),
    repo.listReadiness({ status: "niezweryfikowane" }),
    repo.listReports({ moderation: "do-weryfikacji" }),
    listDeclinedReview(repo, now),
  ]);
  return { needs, contacts, readiness, reports, declined };
}
