"""Embed every built record for the retriever of stage 1 (FR-3.7) into data/index-vectors.json.

Input:  data/innovations/<id>.json (derive-records.py build) and data/data-version.json.
Model:  --model or EMBEDDING_MODEL, default OPI-PIB/PolDense-400M;
        the fallback is OPI-PIB/PolDense-150M. Passages take no prefix, queries take "[query]: ".
Document per record, the same composition scripts/embedding-probe.py measured: title, summary_pl,
        problem_pl, mechanism_pl, keywords_pl.
Output: data/index-vectors.json (git-ignored): the model id, the vector size, the prefixes, the data
        version, the document composition, and one unit-length vector per record (5 decimals), so the
        app computes cosine as a dot product and can refuse vectors built with another model.

Usage (from the repository root, with the embedding environment):
  .venv-embedding/Scripts/python scripts/build-index-vectors.py [--model OPI-PIB/PolDense-150M] [--check]
--check embeds three sample needs afterwards and prints their nearest records.
"""
import argparse, glob, json, os, sys, time

import numpy as np
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env.dev"))  # the environment wins, as in the app
INNOVATIONS = os.path.join(ROOT, "data", "innovations")
OUT = os.path.join(ROOT, "data", "index-vectors.json")
DEFAULT_MODEL = "OPI-PIB/PolDense-400M"
QUERY_PREFIX = "[query]: "
DOCUMENT = "title, summary_pl, problem_pl, mechanism_pl, keywords_pl"
CHECK_NEEDS = [
    "Samotni seniorzy na wsi nie mają z kim porozmawiać i nie wychodzą z domu",
    "Uczniowie z autyzmem nie radzą sobie z hałasem i zmianami w szkole",
    "Osoby głuche nie mogą załatwić sprawy w urzędzie gminy",
]


def log(msg):
    print(msg, flush=True)


def document(record):
    d = record.get("derived") or {}
    parts = [record.get("title"), d.get("summary_pl"), d.get("problem_pl"), d.get("mechanism_pl"),
             ", ".join(d.get("keywords_pl") or [])]
    return "\n".join(p for p in parts if p)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL))
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    files = sorted(glob.glob(os.path.join(INNOVATIONS, "*.json")))
    if not files:
        sys.exit("no data/innovations; run derive-records.py build first")
    version_path = os.path.join(ROOT, "data", "data-version.json")
    version = json.load(open(version_path, encoding="utf-8"))["version"] if os.path.exists(version_path) else None
    ids, docs, titles = [], [], {}
    for f in files:
        r = json.load(open(f, encoding="utf-8"))
        ids.append(r["id"])
        docs.append(document(r))
        titles[r["id"]] = r["title"]
    from sentence_transformers import SentenceTransformer
    t0 = time.time()
    model = SentenceTransformer(a.model)
    log(f"model {a.model} loaded in {time.time() - t0:.0f} s; embedding {len(docs)} records")
    t0 = time.time()
    vecs = model.encode(docs, batch_size=16, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
    log(f"embedded in {time.time() - t0:.0f} s; {vecs.shape[1]} dimensions")
    dumps = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("{\n")
        for k, v in {"model": a.model, "dims": int(vecs.shape[1]), "normalized": True, "query_prefix": QUERY_PREFIX,
                     "passage_prefix": "", "document": DOCUMENT, "data_version": version, "records_count": len(ids),
                     "licence": "PolDense: Gemma Terms of Use; cite Dadas et al. 2026, Parameter-Efficient Retrievers for Polish and European Languages"}.items():
            f.write(f"{dumps(k)}: {dumps(v)},\n")
        f.write('"vectors": {\n')
        for i, (rid, v) in enumerate(zip(ids, vecs)):
            row = [round(float(x), 5) for x in v]
            f.write(f"  {dumps(rid)}: {dumps(row)}" + (",\n" if i < len(ids) - 1 else "\n"))
        f.write("}\n}\n")
    log(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB) for data version {version}")
    if a.check:
        qv = model.encode([QUERY_PREFIX + q for q in CHECK_NEEDS], normalize_embeddings=True, convert_to_numpy=True)
        sims = qv @ vecs.T
        for q, row in zip(CHECK_NEEDS, sims):
            top = np.argsort(-row)[:3]
            log(f"need: {q}")
            for j in top:
                log(f"   {row[j]:.3f}  {ids[j]}  {titles[ids[j]]}")


if __name__ == "__main__":
    main()
