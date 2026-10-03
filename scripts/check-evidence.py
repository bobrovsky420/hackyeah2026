"""Check the evidence files of a /research-paths run against their drafts and saved copies.

Run from the repository root:

    .venv/Scripts/python scripts/check-evidence.py --run .local/paths-research/<date> [<id> ...]

For every <run>/<id>/evidence.md (all of the run by default) it reads the draft <run>/drafts/<id>.yaml and,
if present, the live data/built/paths/<id>.yaml, and checks the layout of worker.md step 2:

- the header lines Status and Subject;
- the Copies table: keys, copies inside the path's own sources folder with their text beside them, issuer,
  role and P/S;
- the Facts table: every quote found verbatim in the text of a cited copy (after joining line-break hyphens
  and normalising quotes, dashes, spaces and case), every field of the draft covered, the four rows
  applicant_types:jst/ngo/pes/mieszkancy agreeing with the draft, amounts, timing, steps, applicant types and
  target groups resting on the subject's own documents or on an act or programme, an annual timing kind
  resting on an act or programme document;
- the Changes table: one row per field that differs from the live file, kinds from the closed list,
  quotes found like the Facts quotes;
- the sections after Changes, in their order.

Prints one line per problem ("<id>: <section>: <problem>"; warnings start with "warning:") and exits 1 when
there is any error. build-paths-report.py reads the evidence with the functions of this file.
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
LIVE = ROOT / "data" / "built" / "paths"

STATUSES = {"unchanged", "changed", "new", "not verified"}
ROLES = {"act", "amendment", "consolidated", "programme", "rules", "call", "change", "results", "page", "news",
         "api", "other-body", "cross-check"}
KINDS = {"error", "outdated", "imprecise", "added", "unverifiable", "derived"}
COUNTED = ["error", "outdated", "imprecise", "added", "unverifiable"]
APPLICANT_CODES = ["jst", "ngo", "pes", "mieszkancy"]
COPIES_HEADER = ["Key", "Copy", "URL", "Issuer", "Date", "Role", "P/S"]
FACTS_HEADER = ["Field", "Value", "Quote", "Copy", "P/S"]
CHANGES_HEADER = ["Field", "Old value", "New value", "Kind", "Quote", "Copy", "P/S"]
AFTER_CHANGES = ["Not used", "Not verified", "Sources failed", "Contradictions", "Outside this path", "14.4 row"]
SECTIONS = ["Copies", "Facts", "Changes", *AFTER_CHANGES]
# Fields whose rows must rest on the subject's own documents, an act or the programme document.
SUBJECT_FIELDS = ("amount_", "timing.", "steps_pl", "applicant_types", "target_groups")
STRONG_ROLES = {"act", "amendment", "programme"}
NOT_COVERED = {"id", "fit", "reviewer"}
NO_QUOTE_FIELDS = ("verified_on", "source_url", "fit")
MIN_WORDS = 3
SEPARATOR = re.compile(r"\s*(?:\[\.\.\.\]|\[…\]|\.\.\.|…)\s*")


# ---------------------------------------------------------------- parsing

def split_row(line: str) -> list[str]:
    """The cells of a Markdown table row; a pipe inside a cell is written as \\|."""
    inner = line.strip()
    inner = inner[1:] if inner.startswith("|") else inner
    inner = inner[:-1] if inner.endswith("|") and not inner.endswith("\\|") else inner
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", inner)]


def parse(text: str) -> dict:
    """The parts of an evidence file: header lines, sections (raw lines) and tables (header, rows)."""
    ev = {"status": None, "subject": None, "strand": None, "sections": {}, "order": [], "tables": {}}
    current = None
    for line in text.splitlines():
        m = re.match(r"^Status:\s*(.+?)\s*$", line)
        if m and current is None:
            ev["status"] = m.group(1).strip().lower()
            continue
        m = re.match(r"^Subject:\s*(.+?)\s*$", line)
        if m and current is None:
            body, _, strand = m.group(1).partition("|")
            ev["subject"], ev["strand"] = body.strip(), strand.strip()
            continue
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            current = m.group(1)
            ev["order"].append(current)
            ev["sections"].setdefault(current, [])
            continue
        if current is not None:
            ev["sections"][current].append(line)
    for name, lines in ev["sections"].items():
        rows = [l for l in lines if l.strip().startswith("|")]
        if len(rows) >= 2 and re.fullmatch(r"[\s|:-]+", rows[1]):
            ev["tables"][name] = (split_row(rows[0]), [split_row(r) for r in rows[2:]])
    return ev


def table(ev: dict, name: str) -> list[dict]:
    """The rows of a table as dicts keyed by the header."""
    header, rows = ev["tables"].get(name, ([], []))
    return [dict(zip(header, r + [""] * (len(header) - len(r)))) for r in rows]


def section_text(ev: dict, name: str) -> str:
    return "\n".join(ev["sections"].get(name, [])).strip()


def keys_of(cell: str) -> list[tuple[str, bool]]:
    """The copy keys of a cell ("A, C!"): (key, jumbled)."""
    return [(k.rstrip("!"), k.endswith("!")) for k in re.findall(r"\b[A-Z]{1,2}!?", cell)]


# ---------------------------------------------------------------- quotes

def norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text).replace("\xad", "")
    text = re.sub(r"--- page \d+ ---", " ", text)
    text = re.sub(r"[„”\"“‟«»]", '"', text)
    text = re.sub(r"[‘’‚`]", "'", text)
    text = re.sub(r"[–—‑]", "-", text)
    return re.sub(r"\s+", " ", text).strip().casefold()


def copy_texts(text: str) -> list[str]:
    """Two readings of a copy's text: line-break hyphens joined, and kept."""
    joined = re.sub(r"(\w)-[ \t]*\n\s*(\w)", r"\1\2", text)
    return [norm(joined), norm(text)]


def fragments(quote: str) -> list[str]:
    q = quote.strip()
    q = re.sub(r'^[„"“]+|[”"“]+$', "", q).strip()
    parts = [p.strip(' "„”“') for p in SEPARATOR.split(q)]
    return [p for p in parts if p]


def is_note(quote: str) -> bool:
    """A cell that is not a quote: empty, "-", or a note in parentheses."""
    q = quote.strip()
    return q in ("", "-") or q.startswith("(")


# ---------------------------------------------------------------- the draft

def flatten(value, prefix: str = "") -> dict:
    """Field paths to values; lists of scalars stay whole, lists of mappings by index."""
    out = {}
    if isinstance(value, dict):
        for k, v in value.items():
            out.update(flatten(v, f"{prefix}.{k}" if prefix else k))
    elif isinstance(value, list) and any(isinstance(v, dict) for v in value):
        for i, v in enumerate(value):
            out.update(flatten(v, f"{prefix}[{i}]"))
        if not value:
            out[prefix] = []
    elif isinstance(value, list) and prefix == "steps_pl":
        for i, v in enumerate(value):
            out[f"{prefix}[{i}]"] = v
    else:
        out[prefix] = value
    return out


def changed_fields(old: dict | None, new: dict) -> list[str]:
    """The field paths whose values differ (verified_on and fit ignored)."""
    a, b = flatten(old or {}), flatten(new)
    paths = sorted(set(a) | set(b))
    out = [p for p in paths if a.get(p, "<missing>") != b.get(p, "<missing>")]
    return [p for p in out if p != "verified_on" and not p.startswith("fit.")]


def covers(row_field: str, path: str) -> bool:
    """True when a row about row_field accounts for the field path (either may be the more general)."""
    f = row_field.strip("` ")
    f = f.split(":")[0] if f.startswith("applicant_types:") else f
    return f == path or path.startswith(f + ".") or path.startswith(f + "[") or f.startswith(path + ".") \
        or f.startswith(path + "[")


def load_yaml(path: Path):
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------- checks

class Checker:
    def __init__(self, run: Path, pid: str, live: Path):
        self.run, self.id = run, pid
        self.sources = (run / pid / "sources").resolve()
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.text = (run / pid / "evidence.md").read_text(encoding="utf-8")
        self.ev = parse(self.text)
        self.draft = load_yaml(run / "drafts" / f"{pid}.yaml")
        self.old = load_yaml(live / f"{pid}.yaml")
        self.copies: dict[str, dict] = {}
        self.texts: dict[str, list[str]] = {}

    def err(self, section: str, msg: str):
        self.errors.append(f"{self.id}: {section}: {msg}")

    def warn(self, section: str, msg: str):
        self.warnings.append(f"{self.id}: warning: {section}: {msg}")

    def run_all(self):
        if self.draft is None:
            self.err("draft", f"missing {self.run.name}/drafts/{self.id}.yaml")
            return self
        self.header()
        self.sections()
        self.copies_table()
        self.facts_table()
        self.changes_table()
        return self

    def header(self):
        if self.ev["status"] not in STATUSES:
            self.err("header", f"Status must be one of {sorted(STATUSES)}, got {self.ev['status']!r}")
        if not self.ev["subject"]:
            self.err("header", 'a "Subject: <body> | <strand>" line is missing')

    def sections(self):
        present = [s for s in self.ev["order"] if s in SECTIONS]
        for name in SECTIONS:
            if name not in self.ev["sections"]:
                self.err("sections", f'"## {name}" is missing')
        expected = [s for s in SECTIONS if s in present]
        if present != expected:
            self.err("sections", f"order must be {SECTIONS}")

    def check_header(self, name: str, want: list[str]):
        header = self.ev["tables"].get(name, (None, None))[0]
        if header is None:
            self.err(name, "no table")
            return False
        if header != want:
            self.err(name, f"header must be | {' | '.join(want)} |, got | {' | '.join(header)} |")
            return False
        return True

    def resolve(self, cell: str) -> Path:
        p = cell.strip("` ")
        return (ROOT / p).resolve() if p.startswith(("data/", ".local/")) else (self.sources / p).resolve()

    def copies_table(self):
        if not self.check_header("Copies", COPIES_HEADER):
            return
        for row in table(self.ev, "Copies"):
            key = row["Key"]
            if not re.fullmatch(r"[A-Z]{1,2}", key):
                self.err("Copies", f"key {key!r} must be one or two capital letters")
                continue
            if key in self.copies:
                self.err("Copies", f"key {key} twice")
            self.copies[key] = row
            path = self.resolve(row["Copy"])
            if self.sources not in path.parents:
                self.err("Copies", f"{key}: copy outside this path's folder: {row['Copy']}")
            elif not path.exists():
                self.err("Copies", f"{key}: copy not found: {row['Copy']}")
            elif not Path(str(path) + ".txt").exists():
                self.warn("Copies", f"{key}: no text beside the copy; its quotes cannot be checked")
            else:
                self.texts[key] = copy_texts(Path(str(path) + ".txt").read_text(encoding="utf-8", errors="replace"))
            if not row["Issuer"]:
                self.err("Copies", f"{key}: Issuer is empty")
            if row["Role"] not in ROLES:
                self.err("Copies", f"{key}: Role {row['Role']!r} not in {sorted(ROLES)}")
            if row["P/S"] not in ("P", "S"):
                self.err("Copies", f"{key}: P/S must be P or S")

    def check_quote(self, section: str, field: str, quote: str, cell: str, required: bool):
        keys = keys_of(cell)
        if not keys:
            if required:
                self.err(section, f"{field}: no copy key")
            return
        for k, _ in keys:
            if k not in self.copies:
                self.err(section, f"{field}: unknown copy key {k}")
        if is_note(quote):
            if required:
                self.warn(section, f"{field}: no quote, only a note; the checker reads it")
            return
        if any(j for _, j in keys):
            self.warn(section, f"{field}: jumbled copy {', '.join(k + '!' for k, j in keys if j)}; the checker reads it")
            return
        texts = [t for k, _ in keys for t in self.texts.get(k, [])]
        if not texts:
            return
        for frag in fragments(quote):
            if len(re.findall(r"\w+", frag)) < MIN_WORDS:
                self.err(section, f"{field}: fragment too short to be verbatim: {frag!r}")
                continue
            if not any(norm(frag) in t for t in texts):
                self.err(section, f"{field}: quote not found in {', '.join(k for k, _ in keys)}: {frag[:80]!r}")

    def strong(self, cell: str) -> bool:
        subject = norm(self.ev["subject"] or "")
        for k, _ in keys_of(cell):
            c = self.copies.get(k)
            if c and (c["Role"] in STRONG_ROLES or (subject and norm(c["Issuer"]) == subject)):
                return True
        return False

    def facts_table(self):
        if not self.check_header("Facts", FACTS_HEADER):
            return
        rows = table(self.ev, "Facts")
        for row in rows:
            field = row["Field"].strip("` ")
            required = not field.startswith(NO_QUOTE_FIELDS)
            self.check_quote("Facts", field, row["Quote"], row["Copy"], required)
            if field.startswith(SUBJECT_FIELDS) and keys_of(row["Copy"]) and not self.strong(row["Copy"]):
                self.err("Facts", f"{field}: cites only copies of another body (the subject's own document, "
                                  "an act or the programme document is needed)")
            if field.startswith(SUBJECT_FIELDS) and keys_of(row["Copy"]) and all(
                    self.copies.get(k, {}).get("P/S") == "S" for k, _ in keys_of(row["Copy"])):
                self.warn("Facts", f"{field}: rests on a secondary source; say so in notes_pl")
        self.coverage(rows)

    def coverage(self, rows: list[dict]):
        fields = [r["Field"].strip("` ") for r in rows]
        for key, value in self.draft.items():
            if key in NOT_COVERED or value is None or value == []:
                continue
            if key == "timing":
                for sub in ("kind", "note_pl"):
                    if not any(covers(f, f"timing.{sub}") for f in fields):
                        self.err("Facts", f"no row for timing.{sub}")
                for i, call in enumerate(value.get("calls") or []):
                    for date in ("opens_on", "closes_on"):
                        if call.get(date) is not None and f"timing.calls[{i}].{date}" not in fields:
                            self.err("Facts", f"no row for timing.calls[{i}].{date}")
                continue
            if key == "applicant_types":
                continue
            if not any(covers(f, key) for f in fields):
                self.err("Facts", f"no row for {key}")
        listed = set(self.draft.get("applicant_types") or [])
        for code in APPLICANT_CODES:
            match = [r for r in rows if r["Field"].strip("` ") == f"applicant_types:{code}"]
            if not match:
                self.err("Facts", f"no row applicant_types:{code} (yes or no, with its quote)")
                continue
            value = match[0]["Value"].strip().lower()
            if value not in ("yes", "no"):
                self.err("Facts", f"applicant_types:{code}: Value must be yes or no")
            elif (value == "yes") != (code in listed):
                self.err("Facts", f"applicant_types:{code} says {value} but the draft "
                                  f"{'lacks' if value == 'yes' else 'lists'} {code}")
        timing = self.draft.get("timing") or {}
        if timing.get("kind") == "annual":
            kind_rows = [r for r in rows if r["Field"].strip("` ") == "timing.kind"]
            if not any(c.get("Role") in STRONG_ROLES for r in kind_rows for k, _ in keys_of(r["Copy"])
                       for c in [self.copies.get(k, {})]):
                self.err("Facts", "timing.kind annual must rest on an act or the programme document "
                                  "(role act, amendment or programme), not on past calls")

    def changes_table(self):
        if not self.check_header("Changes", CHANGES_HEADER):
            return
        rows = table(self.ev, "Changes")
        for row in rows:
            field = row["Field"].strip("` ")
            kind = row["Kind"].strip()
            if kind not in KINDS:
                self.err("Changes", f"{field}: Kind {kind!r} not in {sorted(KINDS)}")
                continue
            required = kind in ("error", "outdated", "imprecise", "added") and not field.startswith(NO_QUOTE_FIELDS)
            self.check_quote("Changes", field, row["Quote"], row["Copy"], required)
        fields = [r["Field"].strip("` ") for r in rows]
        if self.old is None:
            for key, value in self.draft.items():
                if key not in NOT_COVERED and key != "verified_on" and value not in (None, []) \
                        and not any(covers(f, key) for f in fields):
                    self.err("Changes", f"new path: no row for {key}")
            return
        changed = changed_fields(self.old, self.draft)
        for path in changed:
            if not any(covers(f, path) for f in fields):
                self.err("Changes", f"{path} differs from the live file but has no row")
        for f in fields:
            if f != "verified_on" and not f.startswith("fit") and not any(covers(f, p) for p in changed):
                self.warn("Changes", f"{f}: a row, but the field did not change")
        status = self.ev["status"]
        if status == "unchanged" and changed:
            self.err("header", f"Status unchanged, but {len(changed)} fields changed")
        if status == "changed" and not changed:
            self.warn("header", "Status changed, but no field differs from the live file")


def counts(ev: dict) -> dict:
    """The changed fields per kind of the Changes table (derived not counted)."""
    out = dict.fromkeys(COUNTED, 0)
    for row in table(ev, "Changes"):
        kind = row.get("Kind", "").strip()
        if kind in out:
            out[kind] += 1
    return out


def ids_of(run: Path, wanted: list[str]) -> list[str]:
    if wanted:
        return wanted
    return sorted(p.parent.name for p in run.glob("*/evidence.md"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("ids", nargs="*", help="path ids (default: every evidence file of the run)")
    ap.add_argument("--run", required=True, help="the run folder, e.g. .local/paths-research/<date>")
    ap.add_argument("--live", default=str(LIVE), help="the live path files")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    run = Path(args.run).resolve()
    ids = ids_of(run, args.ids)
    if not ids:
        print(f"no evidence files in {run}")
        return 1
    failed = warned = 0
    for pid in ids:
        if not (run / pid / "evidence.md").exists():
            print(f"{pid}: evidence: missing {pid}/evidence.md")
            failed += 1
            continue
        c = Checker(run, pid, Path(args.live)).run_all()
        for line in c.errors + c.warnings:
            print(line)
        failed += bool(c.errors)
        warned += len(c.warnings)
    print(f"{len(ids)} evidence files checked, {failed} with errors, {warned} warnings")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
