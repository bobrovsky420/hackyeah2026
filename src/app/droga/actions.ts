"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { targetGroupCodes } from "@/lib/labels";
import { allowRouteRequest, clientAddress } from "@/lib/server/rate-limit";
import { createRoute, getRoute, simulateWork } from "@/lib/server/routes";

export interface ClarifyState {
  error: string | null;
}

/**
 * The one question of FR-2.3: reruns matching on the stored text with the
 * chosen target group and opens the new route.
 */
export async function clarify(_state: ClarifyState, form: FormData): Promise<ClarifyState> {
  const route = getRoute(String(form.get("droga") ?? ""));
  const group = String(form.get("grupa") ?? "");
  if (!targetGroupCodes.includes(group)) return { error: t("s3.clarify.error") };
  if (!route?.input.problem_text) return { error: t("s3.clarify.failed") };
  if (!allowRouteRequest(clientAddress(await headers()))) return { error: t("s1.limited.title") };

  await simulateWork();
  const next = createRoute({
    problemText: route.input.problem_text,
    placeTerc: route.input.place_terc,
    role: route.input.role,
    targetGroups: [group],
  });
  redirect(`/droga/${next.id}`);
}
