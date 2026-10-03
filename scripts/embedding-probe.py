"""Self-retrieval probe of embedding models on the built innovation records (model-evaluation.md, section 7).

Document per record: title, summary_pl, problem_pl, mechanism_pl, keywords_pl (what the retriever of FR-3.7 indexes).
Query sets, both excluded from the document:
  intro    the catalogue's one-line intro of the national base (about 300 records)
  problem  the catalogue's verbatim "Problem" field, first 1 500 characters (records that have one)
Metrics per query set: recall@1, @10, @40 and MRR of the record itself, median rank, seconds per 100 queries;
per model: vector size and seconds per 100 documents.

Models: an Ollama model by name (http://localhost:11434), or a sentence-transformers model as st:<hugging face id>.
Query and document prefixes per model family are in QUERY_PREFIX and DOC_PREFIX.

Usage (from the repository root):
  .venv/Scripts/python scripts/embedding-probe.py st:OPI-PIB/PolDense-400M qwen3-embedding:0.6b [--out path]
Results are merged into the JSON at --out (default .local/embedding-probe.json); runs worth keeping are copied
into docs/model-evaluation/ with the date in the name.
"""
import argparse, glob, json, os, sys, time, urllib.request

import numpy as np
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env.dev"))  # the environment wins, as in the app
OLLAMA = "http://localhost:11434/api/embed"
QUERY_PREFIX = {
    "qwen3-embedding": "Instruct: Given a description of a social problem, retrieve social innovations that address it\nQuery: ",
    "snowflake-arctic-embed2": "query: ",
    "bge-m3": "",
    "embeddinggemma": "task: search result | query: ",
    "nomic-embed-text": "search_query: ",
    "st:OPI-PIB/PolDense": "[query]: ",
    "st:OPI-PIB/EuroDense": "[query]: ",
}
DOC_PREFIX = {"embeddinggemma": "title: none | text: ", "nomic-embed-text": "search_document: "}
_ST = {}


def embed(model, texts, batch=32):
    if model.startswith("st:"):
        from sentence_transformers import SentenceTransformer
        m = _ST.get(model) or _ST.setdefault(model, SentenceTransformer(model[3:]))
        v = m.encode(texts, batch_size=16, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        return v.astype(np.float32)
    out = []
    for i in range(0, len(texts), batch):
        body = json.dumps({"model": model, "input": texts[i:i + batch], "truncate": True}).encode()
        req = urllib.request.Request(OLLAMA, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=600) as resp:
            out.extend(json.load(resp)["embeddings"])
    v = np.array(out, dtype=np.float32)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def load():
    docs, ids, intro_q, prob_q = [], [], [], []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "built", "innovations", "*.json"))):
        r = json.load(open(f, encoding="utf-8"))
        d = r["derived"]
        docs.append("\n".join(x for x in [r["title"], d.get("summary_pl"), d.get("problem_pl"), d.get("mechanism_pl"),
                                          ", ".join(d.get("keywords_pl") or [])] if x))
        ids.append(r["id"])
        if r.get("intro_pl"):
            intro_q.append((len(ids) - 1, r["intro_pl"]))
        p = (r.get("source_fields") or {}).get("problem")
        if p and len(p) > 30:
            prob_q.append((len(ids) - 1, p[:1500]))
    return docs, ids, intro_q, prob_q


def prefix(table, model):
    fam = next((k for k in table if model.startswith(k)), None)
    return table.get(fam, "")


def evaluate(doc_vecs, queries, model):
    texts = [prefix(QUERY_PREFIX, model) + q for _, q in queries]
    t0 = time.time()
    qv = embed(model, texts)
    secs = (time.time() - t0) / len(texts) * 100
    sims = qv @ doc_vecs.T
    ranks = []
    for (target, _), row in zip(queries, sims):
        order = np.argsort(-row)
        ranks.append(int(np.where(order == target)[0][0]) + 1)
    ranks = np.array(ranks)
    return {"n": len(ranks), "recall@1": round(float((ranks <= 1).mean()), 3), "recall@10": round(float((ranks <= 10).mean()), 3),
            "recall@40": round(float((ranks <= 40).mean()), 3), "mrr": round(float((1 / ranks).mean()), 3),
            "median_rank": int(np.median(ranks)), "sec_per_100": round(secs, 1)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("models", nargs="+")
    ap.add_argument("--out", default=os.path.join(ROOT, ".local", "embedding-probe.json"))
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    docs, ids, intro_q, prob_q = load()
    results = json.load(open(a.out, encoding="utf-8")) if os.path.exists(a.out) else {}
    for model in a.models:
        t0 = time.time()
        dv = embed(model, [prefix(DOC_PREFIX, model) + d for d in docs])
        res = {"dims": int(dv.shape[1]), "records": len(docs), "doc_sec_per_100": round((time.time() - t0) / len(docs) * 100, 1),
               "intro": evaluate(dv, intro_q, model), "problem": evaluate(dv, prob_q, model),
               "measured_on": time.strftime("%Y-%m-%d")}
        results[model] = res
        os.makedirs(os.path.dirname(a.out), exist_ok=True)
        json.dump(results, open(a.out, "w", encoding="utf-8"), indent=1)
        print(model, json.dumps(res), flush=True)


if __name__ == "__main__":
    main()
