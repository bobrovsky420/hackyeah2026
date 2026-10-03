"""Manage the derived records of the innovation catalogue (docs/innovation-record.md).

The parser (scripts/parse-catalogues.py) writes .local/pipeline/sources/<id>.json;
the extraction workers of the skill .claude/skills/extract-innovations write
.local/pipeline/derived/<id>.json; this script is the referee and the bookkeeper
between them and builds the final records into data/, which holds only what
the app serves.

Subcommands (from the repository root, with the project venv):
  status                         counts per source: parsed, valid, invalid, stale, missing; rewrites the manifest
  batches [--size N] [--source nat|rops] [--all]
                                 JSON: lists of ids still to derive (missing, invalid or stale), in batches of N
  validate <id> ... | --all      validate derived records against the schema, the closed lists, the word
                                 limits, the grounding and the personal-data rules; updates the manifest;
                                 exit code 1 when any record has errors
  validate --file <path>         validate one derived record at a path (the worked example) without the manifest
  build                          write data/innovations/<id>.json (source + derived, duplicates merged),
                                 data/index-cards.json, data/data-version.json, .local/pipeline/duplicates.json
  sample [--n 20] [--seed 1]     write docs/review-sample.md (committed) for the human check (FR-1.3)
  show <id>                      print the source text and the derived record of one innovation
"""
import argparse, collections, datetime, difflib, hashlib, json, os, random, re, sys, unicodedata

try:
    import jsonschema
except ImportError:
    sys.exit("jsonschema is missing: .venv/Scripts/python -m pip install -r requirements.txt")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIPE = os.path.join(ROOT, ".local", "pipeline")            # the pipeline's working files, machine-local
SOURCES = os.path.join(PIPE, "sources")
DERIVED = os.path.join(PIPE, "derived")
INNOVATIONS = os.path.join(ROOT, "data", "innovations")    # data/ holds only what the app serves
EXAMPLE = os.path.join(ROOT, "prompts", "extract-example.json")
SCHEMAS = os.path.join(ROOT, "schemas")
TAXONOMIES = json.load(open(os.path.join(ROOT, "data", "taxonomies.json"), encoding="utf-8"))
PROMPT_FILE = os.path.join(ROOT, "prompts", "extract.md")
MANIFEST = os.path.join(PIPE, "manifest.json")
DECISIONS = os.path.join(ROOT, "data", "duplicates-decisions.json")   # a person's decisions on flagged pairs (FR-1.4)
LINK_CHECK = os.path.join(PIPE, "link-check.json")                    # scripts/check-links.py (spec 12.13)

CODES = {
    "target_groups": {t["code"] for t in TAXONOMIES["target_groups"]},
    "domains": {t["code"] for t in TAXONOMIES["domains"]},
    "implementer_types": {t["code"] for t in TAXONOMIES["implementer_types"]},
    "setting": {t["code"] for t in TAXONOMIES["settings"]},
    "scale": {t["code"] for t in TAXONOMIES["scales"]},
    "cost_band": {t["code"] for t in TAXONOMIES["cost_bands"]},
    "time_to_implement": {t["code"] for t in TAXONOMIES["time_to_implement"]},
    "evidence_level": {t["code"] for t in TAXONOMIES["evidence_levels"]},
}
WORD_LIMITS = {"summary_pl": 60, "problem_pl": 60, "mechanism_pl": 60, "index_card_pl": 30, "notes_pl": 40}
# What each prompt version demands beyond the schema. A record is judged by the rules of
# the current prompt (pipeline) or of its own declared version (comparisons, --file).
RULES = {
    "extract-v1": {"anchors": False, "wording_error": False, "drop_with_note": False},
    "extract-v2": {"anchors": True, "wording_error": True, "drop_with_note": True},
    "extract-v3": {"anchors": True, "wording_error": True, "drop_with_note": True},
    "extract-v4": {"anchors": True, "wording_error": True, "drop_with_note": True},
}
QUOTE_WORDS = 20
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?<![\d\w])(?:\+?48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}(?![\d\w])")
URL_RE = re.compile(r"https?://|www\.", re.I)
ENGLISH_RE = re.compile(r"\b(the|and|with|for|of|this|that|which|from)\b", re.I)
STIGMA = [
    (r"\bbezdomn(i|ych|ym|ymi|ego|emu)\b", "osoby w kryzysie bezdomności"),
    (r"\bniepełnosprawn(i|ych|ym|ymi|ego|emu)\b", "osoby z niepełnosprawnościami"),
    (r"\bupośledz", "osoby z niepełnosprawnością intelektualną"),
    (r"\bkalek", "osoby z niepełnosprawnością"),
    # the adjective names an object ("wózek inwalidzki", "renta inwalidzka") and is allowed (user decision of 28 September 2026)
    (r"\binwalid(?!zk)", "osoby z niepełnosprawnością"),
    (r"\bpatologi", "opis sytuacji bez etykiety"),
    (r"\bmargines", "opis sytuacji bez etykiety"),
    (r"\bstarcy\b|\bstaruszk", "osoby starsze, seniorzy"),
    (r"\bnielegaln\w*\s+(imigran|migran)", "osoby bez uregulowanego pobytu"),
    (r"\bnarkoman|\balkoholi(k|cy|ków)\b", "osoby uzależnione"),
    (r"\bchor(y|zy|ych)\s+psychicznie", "osoby w kryzysie psychicznym"),
]


def log(msg):
    print(msg, flush=True)


def prompt_version():
    m = re.search(r"^version:\s*(extract-v\d+)\s*$", open(PROMPT_FILE, encoding="utf-8").read(), re.M)
    return m.group(1) if m else "extract-v0"


def words(s):
    return len((s or "").split())


def normalise(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", s).replace("_", " ")).strip()


def quote_found(quote, text):
    q, t = normalise(quote), normalise(text)
    if not q:
        return False
    if q in t:
        return True
    size = len(q)
    step = max(1, size // 5)
    best = 0.0
    for i in range(0, max(1, len(t) - size + 1), step):
        window = t[i: i + size + step]
        sm = difflib.SequenceMatcher(None, q, window)
        if sm.quick_ratio() < 0.8:
            continue
        best = max(best, sm.ratio())
        if best >= 0.8:
            return True
    return False


def fold(s):
    """Lowercase without diacritics, for matching declined names (Łódź, Łodzi)."""
    return "".join(c for c in unicodedata.normalize("NFKD", normalise(s)) if not unicodedata.combining(c))


def place_found(place, text):
    """A place name, also when the source declines it (Dąbrowa Górnicza, Dąbrowy Górniczej; Stalowa Wola, Stalowej Woli)."""
    p, t = fold(place), fold(text)
    if p in t:
        return True
    words_t = t.split()
    for w in p.split():
        stem = w[: max(3, len(w) - (2 if len(w) > 5 else 1))]
        if not any(x.startswith(stem) for x in words_t):
            return False
    return True


def load_json(path):
    return json.load(open(path, encoding="utf-8"))


def dump_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_sources():
    out = {}
    for fn in sorted(os.listdir(SOURCES)) if os.path.isdir(SOURCES) else []:
        if fn.endswith(".json"):
            out[fn[:-5]] = load_json(os.path.join(SOURCES, fn))
    return out


def source_kind(sid):
    if sid.startswith("inn-nat-"):
        return "nat"
    return "partner" if sid.startswith("inn-partner-") else "rops"


# ---------------------------------------------------------------- validation

class Validator:
    def __init__(self):
        self.schema = jsonschema.Draft202012Validator(load_json(os.path.join(SCHEMAS, "derived-record.schema.json")))
        self.version = prompt_version()

    def check(self, sid, src, path=None, version=None):
        """Returns (status, errors, warnings, meta). status: valid, invalid, stale, missing.
        version: the prompt version whose rules apply; default the current prompt."""
        path = path or os.path.join(DERIVED, sid + ".json")
        expected = version if version in RULES else self.version
        rules = RULES.get(expected, RULES[max(RULES)])
        if not os.path.exists(path):
            return "missing", [], [], {}
        try:
            der = load_json(path)
        except Exception as e:
            return "invalid", [f"invalid JSON: {str(e)[:120]}"], [], {}
        errors, warnings = [], []
        for e in self.schema.iter_errors(der):
            where = "/".join(str(p) for p in e.absolute_path) or "(root)"
            errors.append(f"schema {where}: {e.message[:160]}")
        if not isinstance(der, dict):
            return "invalid", errors, warnings, {}
        meta = {k: der.get(k) for k in ("generated_by", "generated_at", "prompt_version")}
        if der.get("id") != sid:
            errors.append(f"id is {der.get('id')!r}, file name says {sid!r}")
        if der.get("source_fingerprint") != src["fingerprint"]:
            return "stale", errors + ["stale: the source record changed since this record was generated"], warnings, meta
        if der.get("prompt_version") != expected:
            errors.append(f"prompt_version {der.get('prompt_version')!r} is not the expected {expected!r}")
        if errors and any(e.startswith("schema (root)") for e in errors):
            return "invalid", errors, warnings, meta

        # closed lists
        for field in ("target_groups", "domains", "implementer_types"):
            for code in der.get(field) or []:
                if code not in CODES[field]:
                    errors.append(f"{field}: unknown code {code!r}")
        for field in ("setting", "scale", "cost_band", "time_to_implement", "evidence_level"):
            if der.get(field) not in CODES[field]:
                errors.append(f"{field}: unknown code {der.get(field)!r}")

        # the mapped codes must survive
        mapped_tg = set(src["mapped"]["target_groups"])
        got_tg = set(der.get("target_groups") or [])
        if "inne" in mapped_tg and got_tg - {"inne"}:
            mapped_tg.discard("inne")
        mapped_it = set(src["mapped"]["implementer_types"])
        dropped_it = mapped_it - set(der.get("implementer_types") or [])
        for field, dropped in (("target_groups", mapped_tg - got_tg), ("implementer_types", dropped_it)):
            if not dropped:
                continue
            if rules["drop_with_note"] and der.get("notes_pl"):
                warnings.append(f"{field}: mapped code dropped with a note: {', '.join(sorted(dropped))}; note: {der['notes_pl']}")
            elif rules["drop_with_note"]:
                errors.append(f"{field} must keep the mapped codes or notes_pl must say why not: " + ", ".join(sorted(dropped)))
            else:
                errors.append(f"{field} must keep the mapped codes: " + ", ".join(sorted(dropped)))

        # lengths
        for field, limit in WORD_LIMITS.items():
            if isinstance(der.get(field), str) and words(der[field]) > limit:
                errors.append(f"{field}: {words(der[field])} words, limit {limit}")
        for item in der.get("requires_pl") or []:
            if isinstance(item, str) and words(item) > 8:
                errors.append(f"requires_pl item over 8 words: {item[:60]!r}")
        for item in der.get("keywords_pl") or []:
            if isinstance(item, str):
                if words(item) > 3:
                    errors.append(f"keywords_pl item over 3 words: {item!r}")
                if item != item.lower():
                    warnings.append(f"keyword not lowercase: {item!r}")
        if isinstance(der.get("index_card_pl"), str) and "\n" in der["index_card_pl"]:
            errors.append("index_card_pl must be one line")

        # evidence and grounding
        ev = der.get("evidence") or {}
        text = src["text_pl"]

        def check_quote(field):
            item = ev.get(field) or {}
            basis, quote = item.get("basis"), item.get("quote")
            if basis == "quote":
                if not quote:
                    errors.append(f"evidence.{field}: basis quote needs a quote")
                elif words(quote) > QUOTE_WORDS:
                    errors.append(f"evidence.{field}: quote has {words(quote)} words, limit {QUOTE_WORDS}")
                elif not quote_found(quote, text):
                    errors.append(f"evidence.{field}: quote not found in the source: {quote[:70]!r}")
            elif quote:
                warnings.append(f"evidence.{field}: quote given with basis {basis}; it was checked anyway")
                if not quote_found(quote, text):
                    errors.append(f"evidence.{field}: quote not found in the source: {quote[:70]!r}")
            return basis

        for field in ("cost_band", "time_to_implement"):
            basis = check_quote(field)
            value = der.get(field)
            if value == "unknown" and basis != "unknown":
                errors.append(f"{field} is unknown but evidence.{field}.basis is {basis!r}")
            if value != "unknown" and basis == "unknown":
                errors.append(f"{field} is {value!r} but evidence.{field}.basis is unknown")
            if basis == "inference":
                warnings.append(f"{field} inferred: {value}")
        for field in ("setting", "scale"):
            check_quote(field)
        for field in ("problem_pl", "mechanism_pl"):
            item = ev.get(field)
            if rules["anchors"] and (not item or item.get("basis") != "quote" or not item.get("quote")):
                errors.append(f"evidence.{field}: an anchoring quote from the source is required (basis quote)")
            elif item:
                check_quote(field)
        basis = check_quote("evidence_level")
        level = der.get("evidence_level")
        selected = src["origin"].get("selected_for_dissemination") is True
        quote_norm = normalise((ev.get("evidence_level") or {}).get("quote") or "")
        if level == "in-regional-model":
            errors.append("evidence_level in-regional-model cannot be derived from these sources")
        elif level == "selected-for-dissemination" and not selected and "upowszechni" not in quote_norm:
            errors.append("evidence_level selected-for-dissemination needs the source label or a quote with 'upowszechni'")
        elif level == "implemented-elsewhere" and basis != "quote":
            errors.append("evidence_level implemented-elsewhere needs a quote")
        if selected and level not in ("selected-for-dissemination", "implemented-elsewhere"):
            warnings.append("the source carries the dissemination label, evidence_level says " + str(level))

        # personal data and names
        texts = [der.get(k) for k in ("summary_pl", "problem_pl", "mechanism_pl", "index_card_pl", "notes_pl")]
        texts += list(der.get("requires_pl") or []) + list(der.get("keywords_pl") or [])
        joined = " ".join(t for t in texts if isinstance(t, str))
        if EMAIL_RE.search(joined):
            errors.append("an e-mail address appears in the derived text")
        if PHONE_RE.search(joined):
            errors.append("a phone number appears in the derived text")
        if URL_RE.search(joined):
            errors.append("a URL appears in the derived text")
        jn = normalise(joined)
        for name in src.get("persons_public") or []:
            n = normalise(name)
            if len(n) > 5 and n in jn:
                errors.append(f"the derived text names a person: {name!r}")
        place = der.get("origin_place_pl")
        if place is not None and not place_found(place, text):
            errors.append(f"origin_place_pl {place!r} does not appear in the source")

        # language and dignity: the title inside the index card and quoted source words are exempt
        card = der.get("index_card_pl") if isinstance(der.get("index_card_pl"), str) else ""
        if card.lower().startswith(src["title"].lower()):
            card = card[len(src["title"]):]
        own_words = " ".join([t for t in texts if isinstance(t, str) and t != der.get("index_card_pl")] + [card])
        own_words = re.sub(r"[„\"«][^”\"»]*[”\"»]", " ", own_words)
        for pattern, better in STIGMA:
            m = re.search(pattern, own_words, re.I)
            if m:
                (errors if rules["wording_error"] else warnings).append(f"wording: {m.group(0)!r} reduces a person to a condition; write {better}")
        m = ENGLISH_RE.search(joined)
        if m:
            warnings.append(f"English fragment? {m.group(0)!r}")
        if "inne" in (der.get("domains") or []):
            warnings.append("domain 'inne' used" + (f": {der.get('notes_pl')}" if der.get("notes_pl") else ""))
        hints = set(src["mapped"].get("domain_hints") or [])
        if hints and not hints & set(der.get("domains") or []):
            warnings.append("domains share nothing with the topic hints " + ", ".join(sorted(hints)))
        if der.get("confidence") == "low":
            warnings.append("confidence low")
        return ("invalid" if errors else "valid"), errors, warnings, meta


def validate_all(ids=None, verbose=True):
    sources = load_sources()
    v = Validator()
    manifest = load_json(MANIFEST) if os.path.exists(MANIFEST) else {"records": {}}
    now = datetime.datetime.now().isoformat(timespec="seconds")
    targets = ids or sorted(sources)
    unknown = [i for i in targets if i not in sources]
    if unknown:
        log("unknown ids (no source record): " + ", ".join(unknown))
    results = {}
    for sid in targets:
        if sid not in sources:
            continue
        status, errors, warnings, meta = v.check(sid, sources[sid])
        results[sid] = status
        manifest["records"][sid] = {
            "source": source_kind(sid), "status": status, "errors": errors, "warnings": warnings,
            "generated_by": meta.get("generated_by"), "generated_at": meta.get("generated_at"),
            "prompt_version": meta.get("prompt_version"), "fingerprint": sources[sid]["fingerprint"], "validated_at": now,
        }
        if verbose and (errors or warnings) and status != "missing":
            log(f"{sid}: {status}")
            for e in errors:
                log(f"  ERROR {e}")
            for w in warnings:
                log(f"  warn  {w}")
    for sid in list(manifest["records"]):
        if sid not in sources:
            del manifest["records"][sid]
    manifest["updated_at"] = now
    manifest["prompt_version"] = v.version
    manifest["parser_version"] = next((s["parser_version"] for s in sources.values()), None)
    manifest["records"] = dict(sorted(manifest["records"].items()))
    dump_json(MANIFEST, manifest)
    counts = collections.Counter(results.values())
    log("validated {} records: {}".format(len(results), ", ".join(f"{k} {counts[k]}" for k in ("valid", "invalid", "stale", "missing") if counts[k])))
    return results, manifest


# ---------------------------------------------------------------- commands

def cmd_status(args):
    results, manifest = validate_all(verbose=False)
    rows = collections.defaultdict(collections.Counter)
    for sid, st in results.items():
        rows[source_kind(sid)][st] += 1
        rows["all"][st] += 1
    log(f"{'source':8s} {'parsed':>7s} {'valid':>7s} {'invalid':>8s} {'stale':>6s} {'missing':>8s}")
    for k in ("nat", "rops", "partner", "all"):
        c = rows[k]
        log(f"{k:8s} {sum(c.values()):7d} {c['valid']:7d} {c['invalid']:8d} {c['stale']:6d} {c['missing']:8d}")
    warn = sum(len(r["warnings"]) for r in manifest["records"].values())
    inne = sum(1 for r in manifest["records"].values() if any(w.startswith("domain 'inne'") for w in r["warnings"]))
    log(f"warnings {warn}, records with domain 'inne' {inne}, prompt {manifest['prompt_version']}, parser {manifest['parser_version']}")
    return 0


def cmd_batches(args):
    results, _ = validate_all(verbose=False)
    ids = [sid for sid, st in sorted(results.items()) if args.all or st in ("missing", "invalid", "stale")]
    if args.source:
        ids = [i for i in ids if source_kind(i) == args.source]
    batches = [ids[i: i + args.size] for i in range(0, len(ids), args.size)]
    log(f"{len(ids)} ids in {len(batches)} batches of up to {args.size}")
    print(json.dumps(batches, ensure_ascii=False))
    return 0


def cmd_validate(args):
    if args.file:
        der = load_json(args.file)
        sources = load_sources()
        sid = der.get("id") if isinstance(der, dict) else None
        if sid not in sources:
            sys.exit(f"{args.file}: id {sid!r} has no source record")
        declared = der.get("prompt_version") if der.get("prompt_version") in RULES else None
        status, errors, warnings, _ = Validator().check(sid, sources[sid], path=args.file, version=declared)
        log(f"{args.file}: {status} (rules of {declared or 'the current prompt'})")
        for e in errors:
            log(f"  ERROR {e}")
        for w in warnings:
            log(f"  warn  {w}")
        return 0 if status == "valid" else 1
    ids = None if args.all else args.ids
    if not ids and not args.all:
        sys.exit("give ids or --all")
    results, _ = validate_all(ids)
    return 1 if any(st in ("invalid", "stale") for st in results.values()) else 0


def normalise_title(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


ORG_STOPWORDS = {"w", "i", "im", "z", "na", "the", "of", "sp", "o", "oo", "s", "a"}


def same_organisation(a, b):
    """True when either name is unknown or the names share at least half of their words (spelling variants, GOPS vs OPS)."""
    if not a or not b:
        return True
    ta = {w for w in a.split() if w not in ORG_STOPWORDS and len(w) > 1}
    tb = {w for w in b.split() if w not in ORG_STOPWORDS and len(w) > 1}
    if not ta or not tb:
        return True
    shared = {w for w in ta if any(w == x or (len(w) > 4 and len(x) > 4 and w[:5] == x[:5]) for x in tb)}
    return len(shared) / len(ta | tb) >= 0.4


def merge_records(primary, secondary):
    out = json.loads(json.dumps(primary))
    out["sources"] = out["sources"] + secondary["sources"]
    seen = {m["url"] for m in out["materials"]}
    out["materials"] += [m for m in secondary["materials"] if m["url"] not in seen]
    seen = {l["url"] for l in out["links"]}
    out["links"] += [l for l in secondary["links"] if l["url"] not in seen]
    out["source_fields_secondary"] = {secondary["source"]: secondary["source_fields"]}
    out["text_pl"] = out["text_pl"] + "\n\n[" + secondary["source"] + "]\n" + secondary["text_pl"]
    out["persons_public"] = sorted(set(out["persons_public"]) | set(secondary["persons_public"]))
    out["organisation"] = out["organisation"] or secondary["organisation"]
    out["intro_pl"] = out["intro_pl"] or secondary["intro_pl"]
    out["contact_in_source"] = out["contact_in_source"] or secondary["contact_in_source"]
    if not out["tags"]["advanced"] and not out["tags"]["simple"]:
        out["tags"] = secondary["tags"]
    for k in out["mapped"]:
        out["mapped"][k] = sorted(set(out["mapped"][k]) | set(secondary["mapped"].get(k, [])))
    for k, v in out["origin"].items():
        if v in (None, False) and secondary["origin"].get(k) not in (None, False):
            out["origin"][k] = secondary["origin"][k]
    if out["innovator"]["place_name"] is None:
        out["innovator"] = secondary["innovator"]
    out["review_flags"] = sorted(set(out["review_flags"]) | set(secondary["review_flags"]) | {"merged:" + secondary["source"]})
    out["merged_from"] = [secondary["id"]]
    return out


def load_duplicate_decisions():
    """Hand-written decisions on the pairs the build flags: keep-both, or merge with primary and secondary."""
    if not os.path.exists(DECISIONS):
        return []
    items = load_json(DECISIONS)["decisions"]
    for d in items:
        if d["decision"] not in ("keep-both", "merge") or len(d["ids"]) != 2:
            sys.exit(f"duplicates-decisions.json: bad entry {d}")
        if d["decision"] == "merge" and not (d.get("primary") in d["ids"] and d.get("secondary") in d["ids"]):
            sys.exit(f"duplicates-decisions.json: a merge names primary and secondary among its ids: {d}")
    return items


def cmd_build(args):
    sources = load_sources()
    link_check = load_json(LINK_CHECK) if os.path.exists(LINK_CHECK) else {}   # scripts/check-links.py, spec 12.13
    results, manifest = validate_all(verbose=False)
    derived = {sid: load_json(os.path.join(DERIVED, sid + ".json")) for sid, st in results.items() if st == "valid"}
    # duplicates across the two catalogues by normalised title, then organisation
    by_title = collections.defaultdict(list)
    for sid, src in sources.items():
        by_title[normalise_title(src["title"])].append(sid)
    merged, possible, secondary_of = [], [], {}
    decisions = load_duplicate_decisions()
    for title, ids in by_title.items():
        if len(ids) < 2:
            continue
        rops = [i for i in ids if source_kind(i) == "rops"]
        nat = [i for i in ids if source_kind(i) == "nat"]
        if rops and nat:
            for r in rops:
                for n in nat:
                    org_r = normalise_title((sources[r]["organisation"] or {}).get("name"))
                    org_n = normalise_title((sources[n]["organisation"] or {}).get("name"))
                    if same_organisation(org_r, org_n):
                        secondary_of[n] = r
                        merged.append({"primary": r, "secondary": n, "title": sources[r]["title"], "organisations": [org_r or None, org_n or None]})
                    else:
                        possible.append({"ids": [r, n], "title": sources[r]["title"], "reason": "same title, different organisations", "organisations": [org_r, org_n]})
        partner = [i for i in ids if source_kind(i) == "partner"]
        if partner and (rops or nat):
            possible.append({"ids": ids, "title": sources[ids[0]]["title"], "reason": "partner row with the title of a catalogue record; decide in duplicates-decisions.json"})
        if len(rops) > 1 or len(nat) > 1 or len(partner) > 1:
            possible.append({"ids": ids, "title": sources[ids[0]]["title"], "reason": "same title inside one catalogue; not merged"})
    # A person's decisions (data/duplicates-decisions.json) override the flags.
    decided = []
    for d in decisions:
        key = frozenset(d["ids"])
        flagged = [p for p in possible if frozenset(p["ids"]) == key]
        possible = [p for p in possible if frozenset(p["ids"]) != key]
        if d["decision"] == "merge":
            secondary_of[d["secondary"]] = d["primary"]
            merged.append({"primary": d["primary"], "secondary": d["secondary"], "title": sources[d["primary"]]["title"],
                           "organisations": [], "decided": True})
        decided.append({**d, "was_flagged": bool(flagged)})
    os.makedirs(INNOVATIONS, exist_ok=True)
    for fn in os.listdir(INNOVATIONS):
        if fn.endswith(".json"):
            os.remove(os.path.join(INNOVATIONS, fn))
    written, skipped, cards = 0, [], []
    for sid, src in sorted(sources.items()):
        if sid in secondary_of:
            continue
        rec = src
        der = derived.get(sid)
        secondaries = [n for n, r in secondary_of.items() if r == sid]
        for n in secondaries:
            rec = merge_records(rec, sources[n])
            der = der or derived.get(n)
        if not der:
            skipped.append(sid)
            continue
        out = {k: v for k, v in rec.items() if k != "parsed_at"}
        out["derived"] = {k: v for k, v in der.items() if k not in ("id", "source_fingerprint")}
        out["status"] = "active"
        for coll in ("materials", "links"):
            out[coll] = [dict(item) for item in out.get(coll) or []]
            for item in out[coll]:
                lc = link_check.get(item.get("url"))
                if lc:
                    item["link_status"] = "ok" if lc["ok"] else ("dead" if lc["ok"] is False else "unknown")
                    item["link_checked_at"] = lc.get("checked_at")
        card = der["index_card_pl"].strip()
        if not normalise(card).startswith(normalise(src["title"])[:20]):
            card = f"{src['title']}: {card}"
        cards.append({"id": sid, "title": src["title"], "card": card, "target_groups": der["target_groups"], "domains": der["domains"],
                      "implementer_types": der["implementer_types"], "cost_band": der["cost_band"], "evidence_level": der["evidence_level"]})
        dump_json(os.path.join(INNOVATIONS, sid + ".json"), out)
        written += 1
    dump_json(os.path.join(ROOT, "data", "index-cards.json"), cards)
    dump_json(os.path.join(PIPE, "duplicates.json"), {"merged": merged, "possible": possible, "decided": decided})
    # The version follows the served content: ids and source fingerprints, the taxonomy and the prompt.
    digest = hashlib.sha256(("".join(f"{c['id']}{sources[c['id']]['fingerprint']}" for c in cards)
                            + TAXONOMIES["version"] + str(manifest["prompt_version"])).encode()).hexdigest()[:8]
    version = {"version": f"{datetime.date.today().isoformat()}-{digest}", "records": written, "merged": len(merged),
               "skipped_without_valid_derived": len(skipped), "prompt_version": manifest["prompt_version"],
               "parser_version": manifest["parser_version"], "built_at": datetime.datetime.now().isoformat(timespec="seconds")}
    dump_json(os.path.join(ROOT, "data", "data-version.json"), version)
    log(f"built {written} innovations ({len(merged)} merged pairs, {len(possible)} possible duplicates to review, {len(decided)} decided), "
        f"{len(skipped)} skipped without a valid derived record; data version {version['version']}")
    return 0


def cmd_sample(args):
    results, manifest = validate_all(verbose=False)
    sources = load_sources()
    rng = random.Random(args.seed)
    valid = [sid for sid, st in results.items() if st == "valid"]
    nat = [i for i in valid if source_kind(i) == "nat"]
    rops = [i for i in valid if source_kind(i) == "rops"]
    pick = rng.sample(nat, min(len(nat), args.n // 2)) + rng.sample(rops, min(len(rops), args.n - args.n // 2))
    lines = [f"# Review sample ({len(pick)} records, seed {args.seed}, {datetime.date.today().isoformat()})", "",
             "Check every record against its source page. Mark each field: ok, or the correction. "
             "A record with a wrong code or an unsupported claim goes back to the queue (delete .local/pipeline/derived/<id>.json and rerun the skill).", ""]
    for sid in pick:
        src, der = sources[sid], load_json(os.path.join(DERIVED, sid + ".json"))
        rec = manifest["records"][sid]
        lines += [f"## {src['title']}", f"- id: `{sid}`", f"- source: {src['sources'][0]['url']}",
                  f"- generated by {der['generated_by']} on {der['generated_at']}, confidence {der['confidence']}", ""]
        for field in ("summary_pl", "problem_pl", "mechanism_pl", "index_card_pl"):
            lines.append(f"- **{field}**: {der[field]}")
        for field in ("target_groups", "domains", "implementer_types", "requires_pl", "keywords_pl"):
            lines.append(f"- **{field}**: {', '.join(der[field])}")
        for field in ("setting", "scale", "cost_band", "time_to_implement", "evidence_level"):
            ev = der["evidence"][field]
            lines.append(f"- **{field}**: {der[field]} ({ev['basis']}" + (f": \"{ev['quote']}\"" if ev["quote"] else "") + ")")
        lines.append(f"- **origin_place_pl**: {der['origin_place_pl']}")
        if der.get("notes_pl"):
            lines.append(f"- **notes_pl**: {der['notes_pl']}")
        if rec["warnings"]:
            lines.append("- validator warnings: " + "; ".join(rec["warnings"]))
        lines += ["", "Reviewer: [ ] ok  [ ] corrections: ", ""]
    path = os.path.join(ROOT, "docs", "review-sample.md")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    log(f"wrote {path} with {len(pick)} records")
    return 0


def cmd_show(args):
    src = load_json(os.path.join(SOURCES, args.id + ".json"))
    print("=== SOURCE", args.id, "|", src["sources"][0]["url"])
    print(src["text_pl"])
    print("mapped:", json.dumps(src["mapped"], ensure_ascii=False))
    print("origin:", json.dumps(src["origin"], ensure_ascii=False))
    p = os.path.join(DERIVED, args.id + ".json")
    print("=== DERIVED" if os.path.exists(p) else "=== DERIVED (missing)")
    if os.path.exists(p):
        print(open(p, encoding="utf-8").read())
    return 0


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    b = sub.add_parser("batches")
    b.add_argument("--size", type=int, default=12)
    b.add_argument("--source", choices=["nat", "rops", "partner"])
    b.add_argument("--all", action="store_true", help="every id, not only the pending ones")
    b.set_defaults(fn=cmd_batches)
    v = sub.add_parser("validate")
    v.add_argument("ids", nargs="*")
    v.add_argument("--all", action="store_true")
    v.add_argument("--file", help="validate one derived record at this path (e.g. prompts/extract-example.json) without touching the manifest")
    v.set_defaults(fn=cmd_validate)
    sub.add_parser("build").set_defaults(fn=cmd_build)
    s = sub.add_parser("sample")
    s.add_argument("--n", type=int, default=20)
    s.add_argument("--seed", type=int, default=1)
    s.set_defaults(fn=cmd_sample)
    sh = sub.add_parser("show")
    sh.add_argument("id")
    sh.set_defaults(fn=cmd_show)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
