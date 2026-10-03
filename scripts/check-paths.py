"""Validate the legal and funding paths in data/built/paths/*.yaml (spec 8.7, FR-8.1).

Run from the repository root:

    .venv/Scripts/python scripts/check-paths.py [--dir data/built/paths]

Checks every file: the fields of schema 8.7 and nothing else, id equal to the
file name, codes from data/curated/taxonomies.json and from the closed lists below,
amounts numeric or null, dates ISO, the timing kind consistent with the
calls, three short imperative steps, fit derived from the amounts and the
applicant types, reviewer null (no legal review in the hackathon, decided)
and notes_pl opening with the prototype note of FR-1.8
followed by "Sprawdź u źródła.". Prints one line per error and exits 1 when
there is any. Warnings (prefix "warning:") do not change the exit code: an
annual path whose latest call has passed (the app rolls it forward a year and
shows a date no source gives), a home page as source_url, and Polish wording
that spec 11 points 2 to 5 discourage.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
TAXONOMIES = json.loads((ROOT / "data" / "curated" / "taxonomies.json").read_text(encoding="utf-8"))

# The prototype note of FR-1.8 (spec 7.1), then the fixed reminder of 14.4.
PROTOTYPE_NOTE = (
    "Prototyp z hackathonu HackYeah 2026: treści pochodzą z publicznych katalogów innowacji "
    "społecznych na licencjach podanych przy wpisie i nie były weryfikowane prawnie. "
    "Sprawdź źródło przed użyciem."
)
CHECK_AT_SOURCE = "Sprawdź u źródła."

# Who applies: the paths_applicant_type values of the implementer types in the
# taxonomies ("jst-or-ngo" of a placowka expands to jst and ngo); "mieszkancy"
# is the residents' type of rule 1 in 8.7.
APPLICANT_TYPES = {t["paths_applicant_type"] for t in TAXONOMIES["implementer_types"]} - {"jst-or-ngo"} | {"jst", "ngo"}
# Who decides: the applicant codes plus the state (government administration,
# its agencies and state funds: ministry, voivode, NIW-CRSO, PFRON) and the
# operator of an EU programme (a foreign agency, a euroregion).
DECIDES = APPLICANT_TYPES - {"pes"} | {"panstwo", "operator-ue"}
PURPOSES = {
    "zadanie-publiczne", "inicjatywa-mieszkancow", "program-uslug-spolecznych",
    "wdrozenie-innowacji", "testowanie-innowacji", "doradztwo", "rozwoj-organizacji",
    "wolontariat", "usluga-opiekuncza", "tworzenie-miejsc", "dostepnosc",
    "wspolpraca-miedzynarodowa",
}
# lokalna: a legal vehicle of every gmina; malopolska and krakow count as
# regional for rule 3 of 8.7; krajowa and ue are national and EU programmes.
SCOPES = {"lokalna", "malopolska", "krakow", "krajowa", "ue"}
TIMING_KINDS = {"rolling", "annual", "fixed", "closed", "per-call"}
TARGET_GROUPS = {t["code"] for t in TAXONOMIES["target_groups"]}
COST_BANDS = {t["code"] for t in TAXONOMIES["cost_bands"]}
IMPLEMENTER_TYPES = {t["code"] for t in TAXONOMIES["implementer_types"]}
ROLES = {"pracownik-instytucji", "organizacja-spoleczna", "mieszkaniec", "urzad-gminy"}
# Rule 1 of 8.7 read backwards: the roles an applicant type serves.
ROLES_OF = {"jst": ["pracownik-instytucji", "urzad-gminy"], "ngo": ["organizacja-spoleczna"],
            "mieszkancy": ["mieszkaniec"], "pes": []}
BOOST_OF = {a: [t["code"] for t in TAXONOMIES["implementer_types"] if t["paths_applicant_type"] == a]
            for a in APPLICANT_TYPES}

FIELDS = {
    "id": str, "name_pl": str, "legal_basis_pl": str, "applicant_types": list, "decides": str,
    "purposes": list, "target_groups": list, "scope": str, "amount_min_pln": (int, float, type(None)),
    "amount_max_pln": (int, float, type(None)), "amount_note_pl": str, "timing": dict,
    "decision_maker_pl": str, "steps_pl": list, "fit": dict, "source_url": str,
    "verified_on": (str, dt.date), "reviewer": type(None), "notes_pl": str,
}
TIMING_FIELDS = {"kind", "note_pl", "calls"}
CALL_FIELDS = {"label_pl", "applicant_types", "opens_on", "closes_on"}
FIT_FIELDS = {"cost_bands", "roles", "boost_when_implementer_types"}
MAX_STEP_WORDS = 12  # spec 11, rule 11
DASHES = re.compile("[–—]")
# Polish lint over the user-facing text (spec 11, points 2 to 5).
NGO = re.compile(r"\bNGO\b(?! Generator)")   # "NGO Generator" is the name of an application
# The noun "samorząd" alone; "jednostka samorządu terytorialnego", "samorząd województwa" and the adjective pass.
SAMORZAD = re.compile(r"(?<!jednostka )(?<!jednostki )(?<!jednostce )(?<!jednostek )\bsamorz[aą]d(y|ów|om|ami|ach|u|owi|em|zie)?\b(?! terytorialn| województwa| gminy| powiatu)")
SHORT_AMOUNT = re.compile(r"\d\s?(mln|mld|tys\.)\s?zł")
ABOUT_SOURCE = re.compile(r"(?i)\b(źródł\w*|ogłoszeni\w*|stron\w*|regulamin\w*|program\w*) nie poda")


def expected_cost_bands(lo: float | None, hi: float | None) -> list[str]:
    """Bands of the best solution a path can pay for (fit.cost_bands).

    A band is listed when the path's maximum reaches half of the band's upper
    bound (low 5 000 zł, medium 50 000 zł) or exceeds 100 000 zł (high), and
    the path's minimum stays below the band's upper bound; "unknown" when the
    maximum is not known. Paths whose amounts are only in EUR set the bands
    by hand.
    """
    lo_v = lo or 0
    hi_v = float("inf") if hi is None else hi
    bands = []
    if hi_v >= 5000 and lo_v < 10000:
        bands.append("low")
    if hi_v >= 50000 and lo_v < 100000:
        bands.append("medium")
    if hi_v > 100000:
        bands.append("high")
    if hi is None:
        bands.append("unknown")
    return bands


def as_date(value, where: str, errors: list[str]) -> dt.date | None:
    if value is None:
        return None
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            return dt.date.fromisoformat(value)
        except ValueError:
            pass
    errors.append(f"{where}: not an ISO date: {value!r}")
    return None


def check_codes(values, allowed: set[str], where: str, errors: list[str], allow_empty=False) -> None:
    if not isinstance(values, list) or (not values and not allow_empty):
        errors.append(f"{where}: must be a non-empty list")
        return
    for v in values:
        if v not in allowed:
            errors.append(f"{where}: unknown code {v!r}")
    if len(set(values)) != len(values):
        errors.append(f"{where}: duplicate codes")


def user_texts(data: dict) -> list[tuple[str, str]]:
    """The fields a user reads, with their names."""
    texts = [(k, data[k]) for k in ("name_pl", "amount_note_pl", "decision_maker_pl", "notes_pl") if isinstance(data.get(k), str)]
    timing = data.get("timing") if isinstance(data.get("timing"), dict) else {}
    if isinstance(timing.get("note_pl"), str):
        texts.append(("timing.note_pl", timing["note_pl"]))
    for i, call in enumerate(timing.get("calls") or []):
        if isinstance(call, dict) and isinstance(call.get("label_pl"), str):
            texts.append((f"timing.calls[{i}].label_pl", call["label_pl"]))
    texts += [(f"steps_pl[{i}]", s) for i, s in enumerate(data.get("steps_pl") or []) if isinstance(s, str)]
    return texts


def check_file(path: Path, warnings: list[str] | None = None) -> list[str]:
    """The errors of one path file; warnings, if a list is given, are appended to it."""
    errors: list[str] = []
    warnings = [] if warnings is None else warnings
    text = path.read_text(encoding="utf-8")
    if DASHES.search(text):
        errors.append("contains an en or em dash; write the ASCII hyphen")
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        return [f"YAML error: {exc}"]
    if not isinstance(data, dict):
        return ["the file is not a mapping"]

    for key, kind in FIELDS.items():
        if key not in data:
            errors.append(f"missing field {key}")
        elif not isinstance(data[key], kind) or isinstance(data[key], bool):
            errors.append(f"{key}: wrong type {type(data[key]).__name__}")
    for key in set(data) - set(FIELDS):
        errors.append(f"unknown field {key}")
    if errors:
        return errors

    if data["id"] != path.stem:
        errors.append(f"id {data['id']!r} differs from the file name {path.stem!r}")
    for key in ("name_pl", "legal_basis_pl", "amount_note_pl", "decision_maker_pl", "notes_pl"):
        if not data[key].strip():
            errors.append(f"{key}: empty")

    check_codes(data["applicant_types"], APPLICANT_TYPES, "applicant_types", errors)
    if data["decides"] not in DECIDES:
        errors.append(f"decides: unknown code {data['decides']!r}")
    check_codes(data["purposes"], PURPOSES, "purposes", errors)
    if data["target_groups"] != ["any"]:
        check_codes(data["target_groups"], TARGET_GROUPS, "target_groups", errors)
    if data["scope"] not in SCOPES:
        errors.append(f"scope: unknown code {data['scope']!r}")

    lo, hi = data["amount_min_pln"], data["amount_max_pln"]
    for key, v in (("amount_min_pln", lo), ("amount_max_pln", hi)):
        if v is not None and v < 0:
            errors.append(f"{key}: negative")
    if lo is not None and hi is not None and lo > hi:
        errors.append("amount_min_pln above amount_max_pln")

    verified = as_date(data["verified_on"], "verified_on", errors)
    timing = data["timing"]
    if set(timing) != TIMING_FIELDS:
        errors.append(f"timing: fields must be {sorted(TIMING_FIELDS)}, got {sorted(timing)}")
    else:
        if timing["kind"] not in TIMING_KINDS:
            errors.append(f"timing.kind: unknown {timing['kind']!r}")
        if not isinstance(timing["note_pl"], str) or not timing["note_pl"].strip():
            errors.append("timing.note_pl: empty")
        calls = timing["calls"]
        if not isinstance(calls, list):
            errors.append("timing.calls: must be a list")
            calls = []
        open_after_verified = False
        for i, call in enumerate(calls):
            where = f"timing.calls[{i}]"
            if not isinstance(call, dict) or set(call) != CALL_FIELDS:
                errors.append(f"{where}: fields must be {sorted(CALL_FIELDS)}")
                continue
            if not isinstance(call["label_pl"], str) or not call["label_pl"].strip():
                errors.append(f"{where}.label_pl: empty")
            check_codes(call["applicant_types"], set(data["applicant_types"]), f"{where}.applicant_types", errors)
            opens = as_date(call["opens_on"], f"{where}.opens_on", errors)
            closes = as_date(call["closes_on"], f"{where}.closes_on", errors)
            if closes is None:
                errors.append(f"{where}.closes_on: a call needs its closing date")
            if opens and closes and opens > closes:
                errors.append(f"{where}: opens after it closes")
            if closes and verified and closes >= verified:
                open_after_verified = True
        kind = timing["kind"]
        if kind == "fixed" and not open_after_verified:
            errors.append("timing.kind fixed needs a call that closes on or after verified_on")
        if kind == "closed" and open_after_verified:
            errors.append("timing.kind closed, but a call closes on or after verified_on")
        if kind == "annual" and not calls:
            errors.append("timing.kind annual needs the latest known call")
        if kind == "rolling" and calls:
            errors.append("timing.kind rolling must have calls: [] (a closing date makes it fixed)")
        if kind == "annual" and calls and verified and not open_after_verified:
            latest = max((as_date(c.get("closes_on"), "", []) for c in calls if isinstance(c, dict)), default=None, key=lambda d: d or dt.date.min)
            if latest:
                try:
                    rolled = latest.replace(year=latest.year + 1)
                except ValueError:   # 29 February
                    rolled = latest + dt.timedelta(days=365)
                warnings.append(f"timing.kind annual, latest call closed {latest}; the app shows {rolled} as the next "
                                "deadline, a date no source gives (roll-forward, decision open)")

    steps = data["steps_pl"]
    if len(steps) != 3:
        errors.append(f"steps_pl: {len(steps)} steps, 3 required")
    for i, step in enumerate(steps):
        where = f"steps_pl[{i}]"
        if not isinstance(step, str) or not step.strip():
            errors.append(f"{where}: empty")
            continue
        if not step.endswith("."):
            errors.append(f"{where}: must end with a full stop")
        if "(" in step or ")" in step:
            errors.append(f"{where}: no parentheses (spec 11)")
        words = len(re.findall(r"\S+", step.replace(" - ", " ")))
        if words > MAX_STEP_WORDS:
            errors.append(f"{where}: {words} words, at most {MAX_STEP_WORDS} (spec 11)")

    fit = data["fit"]
    if set(fit) != FIT_FIELDS:
        errors.append(f"fit: fields must be {sorted(FIT_FIELDS)}, got {sorted(fit)}")
    else:
        check_codes(fit["cost_bands"], COST_BANDS, "fit.cost_bands", errors)
        if hi is not None and fit["cost_bands"] != expected_cost_bands(lo, hi):
            errors.append(f"fit.cost_bands {fit['cost_bands']} differ from the amounts rule {expected_cost_bands(lo, hi)}")
        check_codes(fit["roles"], ROLES, "fit.roles", errors)
        roles = [r for a in data["applicant_types"] for r in ROLES_OF[a]]
        if sorted(set(fit["roles"])) != sorted(set(roles)):
            errors.append(f"fit.roles {fit['roles']} differ from the applicant types {sorted(set(roles))}")
        check_codes(fit["boost_when_implementer_types"], IMPLEMENTER_TYPES, "fit.boost_when_implementer_types", errors)
        boost = [b for a in data["applicant_types"] for b in BOOST_OF[a]]
        if sorted(set(fit["boost_when_implementer_types"])) != sorted(set(boost)):
            errors.append(f"fit.boost_when_implementer_types differ from the applicant types {sorted(set(boost))}")

    if not re.fullmatch(r"https://\S+", data["source_url"]):
        errors.append(f"source_url: not an https URL: {data['source_url']!r}")
    elif re.fullmatch(r"https://[^/?#]+/?", data["source_url"]):
        warnings.append("source_url: a home page is not a source; name the programme, call or ELI page")
    for where, text in user_texts(data):
        if NGO.search(text):
            errors.append(f'{where}: "NGO"; write "organizacja pozarządowa" (spec 11)')
        if SAMORZAD.search(text):
            warnings.append(f'{where}: "samorząd" alone; write gmina, powiat, województwo or jednostka samorządu terytorialnego')
        if SHORT_AMOUNT.search(text):
            warnings.append(f"{where}: write the full amount (spec 11 point 4); an approximate pool may keep it, say so in the evidence")
        if ABOUT_SOURCE.search(text):
            warnings.append(f"{where}: a sentence about the source in user text; name the gap in the evidence instead")
    if verified and verified > dt.date.today():
        errors.append("verified_on: in the future")
    if data["reviewer"] is not None:
        errors.append("reviewer: must be null (no legal review in the hackathon)")
    if not data["notes_pl"].startswith(PROTOTYPE_NOTE + " " + CHECK_AT_SOURCE):
        errors.append('notes_pl: must start with the prototype note of FR-1.8, then "Sprawdź u źródła."')
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", default=str(ROOT / "data" / "built" / "paths"), help="folder of the path files")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    folder = Path(args.dir)
    files = sorted(folder.glob("*.yaml"))
    if not files:
        print(f"no path files in {folder}")
        return 1
    failed = warned = 0
    for path in files:
        warnings: list[str] = []
        errors = check_file(path, warnings)
        if errors:
            failed += 1
            for error in errors:
                print(f"{path.name}: {error}")
        warned += len(warnings)
        for warning in warnings:
            print(f"{path.name}: warning: {warning}")
    print(f"{len(files)} paths checked, {failed} with errors, {warned} warnings")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
