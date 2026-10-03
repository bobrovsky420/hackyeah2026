import { contactStatuses, isOneOf, needStatuses } from "@/lib/console";
import type { ContactRequest, ContactStatus, NeedStatus } from "@/lib/contracts/records";
import { targetGroupCodes } from "@/lib/labels";
import { placeText } from "@/lib/places";
import { placesMatching } from "@/lib/server/place-filter";
import { getRoute } from "@/lib/server/routes";
import { fold } from "@/lib/text";
import type { NeedFilter, Repository } from "@/server/db";
import { listDeclinedReview } from "./review";

/*
 * What the console reads, shared by its pages and the JSON API of 9.2: the
 * list filters of FR-9.2 (the parameters of the pages' GET forms: status,
 * gmina, kategoria) and the moderation queues of FR-12.8.
 */

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function param(params: Params, name: string): string {
  const value = params instanceof URLSearchParams ? params.get(name) : params[name];
  return typeof value === "string" ? value.trim() : "";
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

/** The needs list's filters (Potrzeby): status, gmina (typed text) and kategoria (a target group code). */
export function needFilterFrom(params: Params): Parsed<NeedFilter & { status?: NeedStatus }> {
  const status = param(params, "status");
  if (status && !isOneOf(needStatuses, status)) return { ok: false, field: "status" };
  const category = param(params, "kategoria");
  if (category && !targetGroupCodes.includes(category)) return { ok: false, field: "kategoria" };
  return {
    ok: true,
    value: {
      status: (status || undefined) as NeedStatus | undefined,
      category: category || undefined,
      places: placesMatching(param(params, "gmina")),
    },
  };
}

/** The contact requests' filters (Prośby o kontakt): status and gmina. */
export function contactFilterFrom(params: Params): Parsed<{ status?: ContactStatus; gmina: string }> {
  const status = param(params, "status");
  if (status && !isOneOf(contactStatuses, status)) return { ok: false, field: "status" };
  return { ok: true, value: { status: (status || undefined) as ContactStatus | undefined, gmina: param(params, "gmina") } };
}

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

/** The moderation queues of FR-12.8: what still waits for a decision, newest first. */
const queues = {
  needs: (repo: Repository) => repo.listNeeds({ publishable: true, moderation: "do-weryfikacji" }),
  contacts: (repo: Repository) => repo.listContacts({ moderation: "do-weryfikacji" }),
  readiness: (repo: Repository) => repo.listReadiness({ status: "niezweryfikowane" }),
  reports: (repo: Repository) => repo.listReports({ moderation: "do-weryfikacji" }),
  declined: (repo: Repository, now: number) => listDeclinedReview(repo, now),
};

export type QueueName = keyof typeof queues;
export const queueNames = Object.keys(queues) as QueueName[];

export function isQueueName(value: string): value is QueueName {
  return isOneOf(queues, value);
}

export function loadQueue(repo: Repository, name: QueueName, now = Date.now()) {
  return queues[name](repo, now);
}

/** Every queue at once, for the moderation tab. */
export async function loadQueues(repo: Repository, now = Date.now()) {
  const [needs, contacts, readiness, reports, declined] = await Promise.all([
    queues.needs(repo),
    queues.contacts(repo),
    queues.readiness(repo),
    queues.reports(repo),
    queues.declined(repo, now),
  ]);
  return { needs, contacts, readiness, reports, declined };
}
