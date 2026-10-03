"use client";

import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { login, type LoginState } from "@/app/rops/actions";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FieldError, Hint, Label, TextInput } from "@/components/ui/field";
import { t } from "@/lib/i18n";

/**
 * "Wpisz kod dostępu" (S7). A password field that accepts paste and password
 * managers, so the login needs no memory test (WCAG 3.3.8).
 */
export function LoginForm() {
  const pathname = usePathname();
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <form action={action} className="grid max-w-[28rem] gap-6">
      <input type="hidden" name="next" value={pathname} />
      <Field invalid={Boolean(state.error)}>
        <Label htmlFor="kod">{t("console.login.label")}</Label>
        <Hint id="kod-podpowiedz">{t("console.login.hint")}</Hint>
        {state.error && <FieldError id="kod-blad">{state.error}</FieldError>}
        <TextInput
          id="kod"
          name="token"
          type="password"
          autoComplete="current-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy("kod-podpowiedz", state.error && "kod-blad")}
        />
      </Field>
      <div>
        <Button type="submit" aria-disabled={pending ? true : undefined}>
          {t("console.login.submit")}
        </Button>
      </div>
    </form>
  );
}
