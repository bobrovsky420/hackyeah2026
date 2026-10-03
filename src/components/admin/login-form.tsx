"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FieldError, Hint, Label, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/** The panel's door (FR-9.1): the shared code and the reviewer's name for the moderation log. */
export function LoginForm({ locked, devHint }: { locked: boolean; devHint: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });

  if (locked) {
    return (
      <Notice tone="error" title={t("admin.login.lockedTitle")} titleAs="h2">
        <p>{t("admin.login.locked")}</p>
      </Notice>
    );
  }

  return (
    <form action={action} className="grid max-w-[32rem] gap-6">
      {state.error && (
        <div role="alert">
          <Notice tone="error" title={t("admin.login.failed")}>
            <p>{state.error}</p>
          </Notice>
        </div>
      )}
      <Field>
        <Label htmlFor="osoba">{t("admin.login.reviewer")}</Label>
        <Hint id="osoba-podpowiedz">{t("admin.login.reviewerHint")}</Hint>
        <TextInput id="osoba" name="osoba" autoComplete="name" maxLength={80} required aria-describedby="osoba-podpowiedz" />
      </Field>
      <Field invalid={Boolean(state.error)}>
        <Label htmlFor="kod">{t("admin.login.code")}</Label>
        {devHint && <Hint id="kod-podpowiedz">{t("admin.login.devHint")}</Hint>}
        {state.error && <FieldError id="kod-blad">{state.error}</FieldError>}
        <TextInput
          id="kod"
          name="kod"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy(devHint && "kod-podpowiedz", state.error && "kod-blad")}
        />
      </Field>
      <div>
        <Button type="submit" aria-disabled={pending ? true : undefined}>
          {t("admin.login.submit")}
        </Button>
      </div>
    </form>
  );
}
