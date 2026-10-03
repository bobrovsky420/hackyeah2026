import { saveMentor } from "@/app/admin/actions";
import { AdminLogin, gate } from "@/components/admin/admin-gate";
import { AdminShell, wasSaved } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { controlClass, Label } from "@/components/ui/field";
import type { Mentor } from "@/lib/contracts";
import { t } from "@/lib/i18n";
import { targetGroupCodes, targetGroupLabel } from "@/lib/labels";
import { repository } from "@/server/db";

export const metadata = { title: t("admin.mentors.title") };

/** One mentor's form; works without JavaScript, so its checkboxes are native. */
function MentorForm({ mentor, prefix }: { mentor: Mentor | null; prefix: string }) {
  return (
    <form action={saveMentor} className="grid gap-3">
      {mentor && <input type="hidden" name="id" value={mentor.id} />}
      <input type="hidden" name="wroc" value="/rops/mentorzy" />
      <div className="grid gap-1">
        <Label htmlFor={`${prefix}-imie`}>{t("admin.mentors.name")}</Label>
        <input id={`${prefix}-imie`} name="imie" required maxLength={200} defaultValue={mentor?.name ?? ""} className={controlClass} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${prefix}-dziedzina`}>{t("admin.mentors.expertise")}</Label>
        <textarea id={`${prefix}-dziedzina`} name="dziedzina" required rows={2} maxLength={500} defaultValue={mentor?.expertise_pl ?? ""} className={controlClass} />
      </div>
      <fieldset className="grid gap-1">
        <legend className="mb-1 font-bold">{t("admin.mentors.groups")}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {targetGroupCodes.map((code) => (
            <label key={code} className="inline-flex min-h-11 items-center gap-2">
              <input type="checkbox" name="grupy" value={code} defaultChecked={mentor?.target_groups.includes(code)} className="size-5" />
              {targetGroupLabel(code)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="inline-flex min-h-11 items-center gap-2">
        <input type="checkbox" name="aktywny" defaultChecked={mentor?.active ?? true} className="size-5" />
        {t("admin.mentors.active")}
      </label>
      <div>
        <Button type="submit" variant={mentor ? "secondary" : "primary"}>
          {t(mentor ? "admin.mentors.save" : "admin.mentors.add")}
        </Button>
      </div>
    </form>
  );
}

/** Module V in the panel: the mentors ROPS can invite into a conversation. */
export default async function AdminMentorsPage({ searchParams }: PageProps<"/admin/mentors">) {
  const session = await gate();
  if (!session) return <AdminLogin />;
  const query = await searchParams;
  const mentors = await repository().listMentors();

  return (
    <AdminShell session={session} current="mentors" title={t("admin.mentors.title")} lead={t("admin.mentors.lead")} saved={wasSaved(query)}>
      <section aria-labelledby="nowy-mentor" className="grid max-w-[48rem] gap-3 rounded-lg border border-border p-4">
        <h2 id="nowy-mentor" className="text-[1.2rem] font-bold">
          {t("admin.mentors.new")}
        </h2>
        <MentorForm mentor={null} prefix="nowy" />
      </section>
      {mentors.length === 0 ? (
        <p>{t("admin.empty")}</p>
      ) : (
        <ul className="grid gap-4">
          {mentors.map((mentor) => (
            <li key={mentor.id} className="grid max-w-[48rem] gap-3 rounded-lg border border-border p-4">
              <h2 className="text-[1.15rem] font-bold">
                {mentor.name}
                {!mentor.active && ` (${t("admin.mentors.inactive")})`}
                {mentor.demo && ` · ${t("admin.demo")}`}
              </h2>
              <MentorForm mentor={mentor} prefix={mentor.id} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
