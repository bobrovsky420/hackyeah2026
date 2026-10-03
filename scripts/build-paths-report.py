"""Build the report (or the hints file) of a /research-paths run from its evidence files and drafts.

Run from the repository root:

    .venv/Scripts/python scripts/build-paths-report.py --run .local/paths-research/<date>
    .venv/Scripts/python scripts/build-paths-report.py --run .local/paths-research/<date> --hints

Without --hints it writes <run>/report.md: the comparison of every draft with its live file (status from
the evidence header; changed fields per kind counted from the Changes table, derived not counted; the selection
fields that changed, computed from the files), the totals, the warnings of check-paths.py and the error count of
check-evidence.py on the drafts, then per path its Changes table and the sections Not used, Not verified,
Sources failed, Contradictions and 14.4 row, and at the end every "Outside this path" line. The two sections
"The most serious errors" and "Decisions for a person" are written by the coordinator; a rebuild keeps what is
there.

With --hints it writes only <run>/hints.md: the "Outside this path" lines of every evidence file present,
grouped by the path id or section each line starts with, so a worker can find its own id. A hint is a lead,
never evidence.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

spec = importlib.util.spec_from_file_location("check_evidence", HERE / "check-evidence.py")
ce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ce)

SELECTION = ["applicant_types", "decides", "purposes", "target_groups", "scope", "amount_min_pln", "amount_max_pln",
             "timing.kind", "timing.calls"]
HAND_WRITTEN = ["The most serious errors", "Decisions for a person"]
PLACEHOLDER = "(to be written by the coordinator)"


def selection_changes(old: dict | None, new: dict) -> str:
    if old is None:
        return "new path"
    out = []
    for field in SELECTION:
        a, b = old, new
        for part in field.split("."):
            a, b = (a or {}).get(part), (b or {}).get(part)
        if a == b:
            continue
        if field == "timing.calls":
            out.append(f"`timing.calls` {len(a or [])} to {len(b or [])} calls" if len(a or []) != len(b or [])
                       else "`timing.calls` dates or labels")
        elif isinstance(a, list) and isinstance(b, list):
            added, removed = [x for x in b if x not in a], [x for x in a if x not in b]
            parts = [f"+ {', '.join(added)}" if added else "", f"- {', '.join(removed)}" if removed else ""]
            out.append(f"`{field}` {' '.join(p for p in parts if p)}")
        else:
            out.append(f"`{field}` {a} to {b}")
    return "; ".join(out) or "none"


def outside_lines(ev: dict) -> list[str]:
    lines = [l.strip() for l in ev["sections"].get("Outside this path", []) if l.strip()]
    return [re.sub(r"^[-*]\s*", "", l) for l in lines if l.lower() not in ("none", "- none")]


def hand_written(report: Path) -> dict:
    """The coordinator's sections of an existing report, to keep them on a rebuild."""
    if not report.exists():
        return {}
    text = report.read_text(encoding="utf-8")
    kept = {}
    for name in HAND_WRITTEN:
        m = re.search(rf"^## {re.escape(name)}\n(.*?)(?=^## |^# |\Z)", text, re.M | re.S)
        if m and m.group(1).strip() and m.group(1).strip() != PLACEHOLDER:
            kept[name] = m.group(1).strip()
    return kept


def run_tool(args: list[str]) -> list[str]:
    result = subprocess.run([sys.executable, *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    return result.stdout.splitlines()


def build_report(run: Path, live: Path) -> Path:
    ids = ce.ids_of(run, [])
    rows, sections, outside = [], [], []
    totals = dict.fromkeys(ce.COUNTED, 0)
    for pid in ids:
        ev = ce.parse((run / pid / "evidence.md").read_text(encoding="utf-8"))
        draft = ce.load_yaml(run / "drafts" / f"{pid}.yaml")
        old = ce.load_yaml(live / f"{pid}.yaml")
        n = ce.counts(ev)
        for k in totals:
            totals[k] += n[k]
        selection = selection_changes(old, draft) if draft else "no draft"
        rows.append(f"| {pid} | {ev['status'] or '?'} | " + " | ".join(str(n[k]) for k in ce.COUNTED) + f" | {selection} |")
        part = [f"## {pid}: {ev['status'] or '?'}", "", f"Subject: {ev['subject'] or '?'}"
                + (f" | {ev['strand']}" if ev["strand"] else ""), "",
                "Counts: " + ", ".join(f"{k} {n[k]}" for k in ce.COUNTED) + f". Selection fields: {selection}.", ""]
        changes = [l for l in ev["sections"].get("Changes", []) if l.strip().startswith("|")]
        part += changes or ["No changes."]
        for name in ("Not used", "Not verified", "Sources failed", "Contradictions", "14.4 row"):
            body = ce.section_text(ev, name)
            if body and body.lower() != "none":
                part += ["", f"**{name}.**", "", body]
        sections.append("\n".join(part))
        outside += [f"- from {pid}: {l}" for l in outside_lines(ev)]

    warnings = [l for l in run_tool(["scripts/check-paths.py", "--dir", str(run / "drafts")]) if ": warning: " in l]
    evidence = run_tool(["scripts/check-evidence.py", "--run", str(run)])
    with_errors = [l for l in evidence if ": " in l and ": warning: " not in l and "evidence files checked" not in l]
    report = run / "report.md"
    kept = hand_written(report)
    paths_with_error = sum(1 for r in rows if r.split(" | ")[2] != "0")

    out = [f"# Paths research of {run.name}: comparison with the live files", "",
           f"Built by scripts/build-paths-report.py on {dt.date.today()}. Nothing in data/built/paths/ or in the "
           "specification has changed; the drafts are in drafts/, the evidence and the saved copies in <id>/.", ""]
    for name in HAND_WRITTEN:
        out += [f"## {name}", "", kept.get(name, PLACEHOLDER), ""]
    out += ["## Comparison per path", "",
            f"{len(ids)} path{'' if len(ids) == 1 else 's'}; {paths_with_error} with at least one error; "
            + ", ".join(f"{k} {totals[k]}" for k in ce.COUNTED) + ".", "",
            "| Path | Status | error | outdated | imprecise | added | unverif. | Selection fields changed |",
            "|---|---|---|---|---|---|---|---|", *rows,
            "| **Total** | | " + " | ".join(f"**{totals[k]}**" for k in ce.COUNTED) + " | |", ""]
    out += ["## Validators", "",
            f"check-evidence.py: {len(with_errors)} error lines"
            + (" (run it for the details)" if with_errors else "") + ".", "",
            "check-paths.py warnings on the drafts (annual paths whose date the app rolls forward, home pages, wording):",
            ""] + ([f"- {w}" for w in warnings] or ["- none"]) + [""]
    checks = sorted((run / "checks").glob("*.md")) if (run / "checks").exists() else []
    if checks:
        out += ["Second-check replies: " + ", ".join(f"checks/{c.name}" for c in checks) + ".", ""]
    out += ["## Outside the paths", ""] + (outside or ["none"]) + ["", "# Sections per path", ""]
    out += [s + "\n" for s in sections]
    report.write_text("\n".join(out), encoding="utf-8", newline="\n")
    return report


def build_hints(run: Path) -> Path:
    groups: dict[str, list[str]] = {}
    for pid in ce.ids_of(run, []):
        ev = ce.parse((run / pid / "evidence.md").read_text(encoding="utf-8"))
        for line in outside_lines(ev):
            m = re.match(r"`?([\w.-]+(?: [\w.]+)?)`?\s*:", line)
            key = m.group(1) if m else "general"
            groups.setdefault(key, []).append(f"- from {pid}: {line}")
    out = ["# Hints of the run", "",
           "Built by scripts/build-paths-report.py --hints from the \"Outside this path\" sections. A hint is a lead, "
           "never evidence: confirm it in your own saved copies or leave it out.", ""]
    for key in sorted(groups):
        out += [f"## {key}", "", *groups[key], ""]
    path = run / "hints.md"
    path.write_text("\n".join(out), encoding="utf-8", newline="\n")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--run", required=True, help="the run folder, e.g. .local/paths-research/<date>")
    ap.add_argument("--hints", action="store_true", help="write only hints.md")
    ap.add_argument("--live", default=str(ce.LIVE), help="the live path files")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    run = Path(args.run).resolve()
    if not ce.ids_of(run, []):
        print(f"no evidence files in {run}")
        return 1
    path = build_hints(run) if args.hints else build_report(run, Path(args.live))
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
