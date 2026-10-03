"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { targetGroupCodes } from "@/lib/labels";
import { allowRouteRequest, clientAddress } from "@/lib/server/rate-limit";
import { createRoute, getRoute } from "@/lib/server/routes";
import { PipelineUnavailableError } from "@/server/pipeline";

export interface ClarifyState {
  error: string | null;
}

/**
 * The one question of FR-2.3: reruns matching on the stored text with the
 * chosen target group and opens the new route.
 */
export async function clarify(_state: ClarifyState, form: FormData): Promise<ClarifyState> {
  const route = await getRoute(String(form.get("droga") ?? ""));
  const group = String(form.get("grupa") ?? "");
  if (!targetGroupCodes.includes(group)) return { error: t("s3.clarify.error") };
  if (!route?.input.problem_text) return { error: t("s3.clarify.failed") };
  const client = clientAddress(await headers());
  if (!allowRouteRequest(client)) return { error: t("s1.limited.title") };

  let next;
  try {
    ({ route: next } = await createRoute({
      problemText: route.input.problem_text,
      placeTerc: route.input.place_terc,
      role: route.input.role,
      targetGroups: [group],
      client,
    }));
  } catch (error) {
    if (error instanceof PipelineUnavailableError) return { error: t("s3.clarify.failed") };
    throw error;
  }
  // Outside the try: redirect() works by throwing.
  redirect(`/droga/${next.id}`);
}
