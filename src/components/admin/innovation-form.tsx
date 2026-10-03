"use client";

import { useActionState, useState } from "react";
import { saveInnovation, type KnowledgeFormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, RadioList } from "@/components/ui/choice";
import { controlClass, Field, Hint, Label, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { InnovationOverride } from "@/lib/contracts";
import { t } from "@/lib/i18n";

/** ROPS's word on one innovation: verified or hidden, a corrected summary and the materials it adds, a film among them. */
export function InnovationForm({ innovationId, override, summary }: { innovationId: string; override: InnovationOverride | null; summary: string }) {
  const [state, action, pending] = useActionState<KnowledgeFormState, FormData>(saveInnovation, { error: null });
  const [status, setStatus] = useState(override?.status ?? "");
  const [type, setType] = useState("video");
  const [remove, setRemove] = useState<string[]>([]);

  return (
    <form action={action} className="grid max-w-[48rem] gap-6">
      {state.error && (
        <div role="alert">
          <Notice tone="error" title={t("admin.knowledge.failed")}>
            <p>{state.error}</p>
          </Notice>
        </div>
      )}
      <input type="hidden" name="id" value={innovationId} />
      <RadioList
        idPrefix="status"
        name="status"
        legend={t("admin.innovation.statusLegend")}
        options={[
          { value: "", label: t("admin.innovation.noWord") },
          { value: "zweryfikowane", label: t("admin.innovation.verify") },
          { value: "ukryte", label: t("admin.innovation.hide") },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Field>
        <Label htmlFor="streszczenie">{t("admin.innovation.summary")}</Label>
        <Hint id="streszczenie-podpowiedz">{t("admin.innovation.summaryHint")}</Hint>
        <textarea
          id="streszczenie"
          name="streszczenie"
          rows={4}
          maxLength={1500}
          defaultValue={override?.summary_pl ?? ""}
          placeholder={summary}
          className={controlClass}
          aria-describedby="streszczenie-podpowiedz"
        />
      </Field>
      {override && override.extra_materials.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-bold">{t("admin.innovation.materials")}</legend>
          {override.extra_materials.map((material, index) => (
            <Checkbox
              key={material.url}
              id={`usun-${index}`}
              checked={remove.includes(material.url)}
              onChange={(checked) => setRemove(checked ? [...remove, material.url] : remove.filter((url) => url !== material.url))}
            >
              {t("admin.innovation.remove", { title: material.title })}
            </Checkbox>
          ))}
          {/* The checkboxes carry no name: the URLs to remove travel as their own fields. */}
          {remove.map((url) => (
            <input key={url} type="hidden" name="usun" value={url} />
          ))}
        </fieldset>
      )}
      <fieldset className="grid gap-4">
        <legend className="mb-2 font-bold">{t("admin.innovation.addMaterial")}</legend>
        <Hint>{t("admin.innovation.addMaterialHint")}</Hint>
        <RadioList
          idPrefix="material-typ"
          name="material-typ"
          legend={t("admin.innovation.materialType")}
          options={[
            { value: "video", label: t("admin.knowledgeType.video") },
            { value: "document", label: t("admin.innovation.document") },
          ]}
          value={type}
          onChange={setType}
        />
        <Field>
          <Label htmlFor="material-tytul">{t("admin.knowledge.itemTitle")}</Label>
          <TextInput id="material-tytul" name="material-tytul" maxLength={200} />
        </Field>
        <Field>
          <Label htmlFor="material-adres">{t("admin.knowledge.url")}</Label>
          <TextInput id="material-adres" name="material-adres" type="url" maxLength={500} />
        </Field>
      </fieldset>
      <Field>
        <Label htmlFor="notatka">{t("admin.note")}</Label>
        <Hint id="notatka-podpowiedz">{t("admin.noteHint")}</Hint>
        <textarea id="notatka" name="notatka" rows={2} maxLength={1000} defaultValue={override?.note_pl ?? ""} className={controlClass} aria-describedby="notatka-podpowiedz" />
      </Field>
      <div>
        <Button type="submit" aria-disabled={pending ? true : undefined}>
          {t("admin.knowledge.save")}
        </Button>
      </div>
    </form>
  );
}
