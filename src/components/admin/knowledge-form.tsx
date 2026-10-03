"use client";

import { useActionState, useState } from "react";
import { saveKnowledge, type KnowledgeFormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxList } from "@/components/ui/choice";
import { controlClass, Field, Hint, Label, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { KnowledgeEntry } from "@/lib/contracts";
import { t } from "@/lib/i18n";

/** Adds a knowledge item, or edits or hides one (a curated item through its `base_id`). */
export function KnowledgeForm({
  entry,
  types,
  groups,
}: {
  entry: Pick<KnowledgeEntry, "base_id" | "title_pl" | "description_pl" | "url" | "type" | "target_groups" | "always_show" | "hidden"> & { id: string | null };
  types: { value: string; label: string }[];
  groups: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<KnowledgeFormState, FormData>(saveKnowledge, { error: null });
  const [selected, setSelected] = useState<string[]>(entry.target_groups.filter((code) => code !== "any"));
  const [always, setAlways] = useState(entry.always_show);
  const [hidden, setHidden] = useState(entry.hidden);

  return (
    <form action={action} className="grid max-w-[48rem] gap-6">
      {state.error && (
        <div role="alert">
          <Notice tone="error" title={t("admin.knowledge.failed")}>
            <p>{state.error}</p>
          </Notice>
        </div>
      )}
      {entry.id && <input type="hidden" name="id" value={entry.id} />}
      {entry.base_id && <input type="hidden" name="bazowy" value={entry.base_id} />}
      <Field>
        <Label htmlFor="tytul">{t("admin.knowledge.itemTitle")}</Label>
        <TextInput id="tytul" name="tytul" required maxLength={200} defaultValue={entry.title_pl} />
      </Field>
      <Field>
        <Label htmlFor="adres">{t("admin.knowledge.url")}</Label>
        <Hint id="adres-podpowiedz">{t("admin.knowledge.urlHint")}</Hint>
        <TextInput id="adres" name="adres" type="url" required maxLength={500} defaultValue={entry.url} aria-describedby="adres-podpowiedz" />
      </Field>
      <Field>
        <Label htmlFor="typ">{t("admin.knowledge.type")}</Label>
        <select id="typ" name="typ" defaultValue={entry.type} className={controlClass}>
          {types.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <Label htmlFor="opis">{t("admin.knowledge.description")}</Label>
        <textarea id="opis" name="opis" rows={3} maxLength={1000} defaultValue={entry.description_pl} className={controlClass} />
      </Field>
      <CheckboxList
        idPrefix="grupy"
        name="grupy"
        legend={t("admin.knowledge.groups")}
        hint={t("admin.knowledge.groupsHint")}
        options={groups}
        values={selected}
        onChange={setSelected}
      />
      <Checkbox id="zawsze" name="zawsze" checked={always} onChange={setAlways}>
        {t("admin.knowledge.always")}
      </Checkbox>
      <Checkbox id="ukryte" name="ukryte" checked={hidden} onChange={setHidden} hint={t("admin.knowledge.hideHint")}>
        {t("admin.knowledge.hide")}
      </Checkbox>
      <div>
        <Button type="submit" aria-disabled={pending ? true : undefined}>
          {t("admin.knowledge.save")}
        </Button>
      </div>
    </form>
  );
}
