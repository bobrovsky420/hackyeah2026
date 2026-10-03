"""Compare extraction workers on the pilot set: a model on the Hugging Face router
(Bielik by default) against the Claude Code workers (Haiku, Sonnet).

Every set of records lives in its own folder under .local/pipeline/compare/<label>/
and is validated by the same referee (scripts/derive-records.py), so the three
can be read side by side. Nothing here touches .local/pipeline/derived/ or data/.

Subcommands (from the repository root, with the project venv):
  snapshot --label sonnet [--ids ...]
        copy the current derived records of the pilot ids into compare/<label>/
  run [--model speakleash/Bielik-11B-v3.0-Instruct:publicai] [--label bielik] [--ids ...]
      [--max-tokens 2500] [--temperature 0.2] [--repairs 2]
        derive the pilot ids by calling the model through the router (OpenAI-compatible,
        JSON mode, the same prompt and example the Claude Code workers read, the
        validator's errors fed back for up to --repairs repair rounds); writes
        compare/<label>/<id>.json and compare/<label>/run.jsonl (tokens, latency, rounds)
  report [--ids ...]
        validate every set, print a summary table and write compare/comparison.md
        with the full text of every record per model, for reading

The pilot ids default to .claude/skills/extract-innovations/pilot.json.
"""
import argparse, datetime, importlib.util, io, json, os, re, shutil, sys, time

from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env.dev"))  # the environment wins, as in the app
BASE_URL = "https://router.huggingface.co/v1"
DEFAULT_MODEL = "speakleash/Bielik-11B-v3.0-Instruct:publicai"
PILOT = os.path.join(ROOT, ".claude", "skills", "extract-innovations", "pilot.json")
PROMPT_FILE = os.path.join(ROOT, "prompts", "extract.md")
EXAMPLE_FILE = os.path.join(ROOT, "prompts", "extract-example.json")
TAXONOMIES_FILE = os.path.join(ROOT, "data", "taxonomies.json")

spec = importlib.util.spec_from_file_location("referee", os.path.join(ROOT, "scripts", "derive-records.py"))
referee = importlib.util.module_from_spec(spec)
spec.loader.exec_module(referee)
COMPARE = os.path.join(referee.PIPE, "compare")


def log(msg):
    print(msg, flush=True)


def pilot_ids(args):
    if args.ids:
        return args.ids
    return referee.load_json(PILOT)["ids"]


def token_from_env():
    for k in ("HF_TOKEN", "HUGGINGFACE_HUB_TOKEN", "HUGGING_FACE_HUB_TOKEN", "HF_API_KEY"):
        if os.environ.get(k):
            return os.environ[k]
    sys.exit("no HF_TOKEN in .env.dev or the environment")


# ---------------------------------------------------------------- the prompt for an API call

def compact_taxonomies():
    tax = referee.load_json(TAXONOMIES_FILE)
    lines = []
    for key in ("target_groups", "domains", "implementer_types", "cost_bands", "time_to_implement", "evidence_levels", "settings", "scales"):
        items = ", ".join(t["code"] + (f" ({t['hint_pl']})" if t.get("hint_pl") else "") for t in tax[key])
        lines.append(f"- {key}: {items}")
    return "\n".join(lines)


def system_prompt():
    text = io.open(PROMPT_FILE, encoding="utf-8").read()
    body = text[text.index("## Output shape"):]
    example = io.open(EXAMPLE_FILE, encoding="utf-8").read()
    return (
        "You derive the structured record of one Polish social innovation from its source record. "
        "You answer with one JSON object only: no prose, no code fences, no comments. "
        "The rules below are the contract; the validator that checks your answer enforces them.\n\n"
        "Closed lists (use only these codes):\n" + compact_taxonomies() + "\n\n"
        "A worked example of a correct answer (for another innovation):\n" + example + "\n\n" + body
    )


def user_message(src, model_label, today):
    payload = {
        "id": src["id"], "title": src["title"], "fingerprint": src["fingerprint"],
        "mapped": src["mapped"], "origin": src["origin"], "persons_public": src["persons_public"],
        "text_pl": src["text_pl"],
    }
    return (
        "Source record:\n" + json.dumps(payload, ensure_ascii=False, indent=1) +
        f"\n\nWrite \"generated_by\": \"{model_label}\", \"generated_at\": \"{today}\", "
        f"\"source_fingerprint\": \"{src['fingerprint']}\", \"id\": \"{src['id']}\", "
        f"\"prompt_version\": \"{referee.prompt_version()}\". Return only the JSON object."
    )


def parse_json(text):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.S)
    start, end = t.find("{"), t.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object in the answer")
    return json.loads(t[start: end + 1])


def call(client, model, messages, max_tokens, temperature, json_mode=True):
    kwargs = dict(model=model, messages=messages, max_tokens=max_tokens, temperature=temperature)
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    t0 = time.time()
    try:
        r = client.chat.completions.create(**kwargs, timeout=120)
    except Exception as e:
        if json_mode and ("response_format" in str(e) or "400" in str(e) or "422" in str(e)):
            return call(client, model, messages, max_tokens, temperature, json_mode=False)
        raise
    u = r.usage
    return {"text": r.choices[0].message.content or "", "latency_ms": int((time.time() - t0) * 1000),
            "prompt_tokens": getattr(u, "prompt_tokens", None), "completion_tokens": getattr(u, "completion_tokens", None),
            "json_mode": json_mode}


# ---------------------------------------------------------------- commands

def cmd_snapshot(args):
    ids = pilot_ids(args)
    out = os.path.join(COMPARE, args.label)
    os.makedirs(out, exist_ok=True)
    n = 0
    for sid in ids:
        src = os.path.join(referee.DERIVED, sid + ".json")
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(out, sid + ".json"))
            n += 1
        else:
            log(f"  no derived record for {sid}")
    log(f"snapshot {args.label}: {n} of {len(ids)} records copied to {out}")
    return 0


def cmd_run(args):
    from openai import OpenAI
    ids = pilot_ids(args)
    sources = referee.load_sources()
    client = OpenAI(base_url=BASE_URL, api_key=token_from_env())
    validator = referee.Validator()
    out = os.path.join(COMPARE, args.label)
    os.makedirs(out, exist_ok=True)
    system = system_prompt()
    today = datetime.date.today().isoformat()
    runlog = open(os.path.join(out, "run.jsonl"), "a", encoding="utf-8")
    totals = {"valid": 0, "invalid": 0, "failed": 0, "prompt_tokens": 0, "completion_tokens": 0, "latency_ms": 0}
    for sid in ids:
        src = sources.get(sid)
        if not src:
            log(f"{sid}: no source record")
            continue
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user_message(src, args.model, today)}]
        path = os.path.join(out, sid + ".json")
        entry = {"id": sid, "model": args.model, "rounds": [], "status": "failed", "errors": [], "warnings": []}
        for round_no in range(args.repairs + 1):
            try:
                r = call(client, args.model, messages, args.max_tokens, args.temperature)
            except Exception as e:
                entry["rounds"].append({"error": str(e)[:200]})
                log(f"{sid}: call failed: {str(e)[:120]}")
                break
            totals["prompt_tokens"] += r["prompt_tokens"] or 0
            totals["completion_tokens"] += r["completion_tokens"] or 0
            totals["latency_ms"] += r["latency_ms"]
            rec = {k: v for k, v in r.items() if k != "text"}
            try:
                der = parse_json(r["text"])
            except Exception as e:
                rec["parse_error"] = str(e)[:120]
                entry["rounds"].append(rec)
                messages += [{"role": "assistant", "content": r["text"]},
                             {"role": "user", "content": f"The answer was not a valid JSON object ({str(e)[:80]}). Return the full corrected JSON object only."}]
                continue
            if isinstance(der, dict):
                der["id"], der["prompt_version"], der["source_fingerprint"] = sid, referee.prompt_version(), src["fingerprint"]
                der["generated_by"], der["generated_at"] = args.model, today
            referee.dump_json(path, der)
            status, errors, warnings, _ = validator.check(sid, src, path=path)
            rec.update({"status": status, "errors": len(errors)})
            entry["rounds"].append(rec)
            entry.update({"status": status, "errors": errors, "warnings": warnings})
            if status == "valid" or round_no == args.repairs:
                break
            messages += [{"role": "assistant", "content": json.dumps(der, ensure_ascii=False)},
                         {"role": "user", "content": "The validator rejected the record:\n- " + "\n- ".join(errors) +
                          "\nReturn the full corrected JSON object only, with every field."}]
        totals[entry["status"] if entry["status"] in totals else "failed"] += 1
        runlog.write(json.dumps(entry, ensure_ascii=False) + "\n")
        runlog.flush()
        log(f"{sid}: {entry['status']} after {len(entry['rounds'])} round(s)" + (f"; errors: {'; '.join(entry['errors'])[:200]}" if entry["errors"] else ""))
    runlog.close()
    log(f"{args.label} ({args.model}): valid {totals['valid']}, invalid {totals['invalid']}, failed {totals['failed']}; "
        f"tokens in {totals['prompt_tokens']}, out {totals['completion_tokens']}; total latency {totals['latency_ms'] / 1000:.0f} s")
    return 0 if totals["invalid"] == 0 and totals["failed"] == 0 else 1


def cmd_report(args):
    ids = pilot_ids(args)
    sources = referee.load_sources()
    validator = referee.Validator()
    sets = {}
    if os.path.isdir(COMPARE):
        for label in sorted(os.listdir(COMPARE)):
            if os.path.isdir(os.path.join(COMPARE, label)):
                sets[label] = os.path.join(COMPARE, label)
    sets["derived (current)"] = referee.DERIVED
    text_fields = ("summary_pl", "problem_pl", "mechanism_pl")
    summary, records = {}, {}
    for label, folder in sets.items():
        stats = {"records": 0, "valid": 0, "invalid": 0, "words": 0, "inferred": 0, "unknown": 0, "quotes": 0,
                 "warnings": 0, "wording": 0, "inne": 0, "low_conf": 0, "models": set(), "prompts": set()}
        for sid in ids:
            path = os.path.join(folder, sid + ".json")
            if not os.path.exists(path) or sid not in sources:
                continue
            der = referee.load_json(path)
            declared = der.get("prompt_version") if der.get("prompt_version") in referee.RULES else None
            status, errors, warnings, _ = validator.check(sid, sources[sid], path=path, version=declared)
            records[(label, sid)] = (der, status, errors, warnings)
            stats["prompts"].add(str(der.get("prompt_version")))
            stats["records"] += 1
            stats["valid" if status == "valid" else "invalid"] += 1
            stats["words"] += sum(referee.words(der.get(f, "")) for f in text_fields)
            for f in ("cost_band", "time_to_implement", "evidence_level", "setting", "scale"):
                basis = ((der.get("evidence") or {}).get(f) or {}).get("basis")
                stats["inferred" if basis == "inference" else "unknown" if basis == "unknown" else "quotes"] += 1
            stats["warnings"] += len(warnings)
            stats["wording"] += sum(1 for w in warnings + errors if w.startswith("wording"))
            stats["inne"] += 1 if "inne" in (der.get("domains") or []) else 0
            stats["low_conf"] += 1 if der.get("confidence") == "low" else 0
            stats["models"].add(str(der.get("generated_by")))
        if stats["records"]:
            summary[label] = stats
    lines = [f"# Pilot comparison ({len(ids)} ids, {datetime.date.today().isoformat()})", "",
             "| set | model | prompt | records | valid | words per record (3 text fields) | quotes | inferred | unknown | warnings | wording | domain inne | low confidence |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for label, s in summary.items():
        lines.append(f"| {label} | {', '.join(sorted(s['models']))} | {', '.join(sorted(s['prompts']))} | {s['records']} | {s['valid']} | {s['words'] / s['records']:.0f} | {s['quotes']} | {s['inferred']} | {s['unknown']} | {s['warnings']} | {s['wording']} | {s['inne']} | {s['low_conf']} |")
    lines += ["", "The validator cannot see an unsupported sentence; read each text against the source and mark it below.", ""]
    for sid in ids:
        src = sources.get(sid)
        if not src:
            continue
        lines += [f"## {src['title']} (`{sid}`)", f"Source: {src['sources'][0]['url']}", "",
                  "Mapped: " + json.dumps({"target_groups": src["mapped"]["target_groups"], "implementer_types": src["mapped"]["implementer_types"],
                                          "domain_hints": src["mapped"]["domain_hints"]}, ensure_ascii=False), ""]
        for label in summary:
            item = records.get((label, sid))
            if not item:
                continue
            der, status, errors, warnings = item
            lines += [f"### {label}: {der.get('generated_by')}, {status}", ""]
            for f in ("summary_pl", "problem_pl", "mechanism_pl", "index_card_pl"):
                lines.append(f"- **{f}**: {der.get(f)}")
            lines.append(f"- **codes**: groups {', '.join(der.get('target_groups') or [])}; domains {', '.join(der.get('domains') or [])}; "
                         f"implementers {', '.join(der.get('implementer_types') or [])}; setting {der.get('setting')}; scale {der.get('scale')}; "
                         f"cost {der.get('cost_band')}; time {der.get('time_to_implement')}; evidence {der.get('evidence_level')}; place {der.get('origin_place_pl')}; confidence {der.get('confidence')}")
            ev = der.get("evidence") or {}
            lines.append("- **evidence**: " + "; ".join(f"{f} {((ev.get(f) or {}).get('basis'))}" + (f" \"{(ev.get(f) or {}).get('quote')}\"" if (ev.get(f) or {}).get("quote") else "") for f in ("cost_band", "time_to_implement", "evidence_level", "setting", "scale")))
            lines.append(f"- **requires**: {', '.join(der.get('requires_pl') or [])}")
            lines.append(f"- **keywords**: {', '.join(der.get('keywords_pl') or [])}")
            if der.get("notes_pl"):
                lines.append(f"- **notes**: {der.get('notes_pl')}")
            if errors:
                lines.append("- errors: " + "; ".join(errors))
            if warnings:
                lines.append("- warnings: " + "; ".join(warnings))
            lines += ["- unsupported sentences (reviewer): ", ""]
    os.makedirs(COMPARE, exist_ok=True)
    path = os.path.join(COMPARE, "comparison.md")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    log("\n".join(lines[2: 4 + len(summary)]))
    log(f"wrote {path}")
    return 0


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshot")
    s.add_argument("--label", required=True)
    s.add_argument("--ids", nargs="*")
    s.set_defaults(fn=cmd_snapshot)
    r = sub.add_parser("run")
    r.add_argument("--model", default=DEFAULT_MODEL)
    r.add_argument("--label", default="bielik")
    r.add_argument("--ids", nargs="*")
    r.add_argument("--max-tokens", type=int, default=2500)
    r.add_argument("--temperature", type=float, default=0.2)
    r.add_argument("--repairs", type=int, default=2)
    r.set_defaults(fn=cmd_run)
    p = sub.add_parser("report")
    p.add_argument("--ids", nargs="*")
    p.set_defaults(fn=cmd_report)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
