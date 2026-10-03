"""Local HTTP service that embeds a need for the retriever of stage 1 (FR-3.7); the app calls it per request.

Model:  --model or EMBEDDING_MODEL, default OPI-PIB/PolDense-400M; the fallback is OPI-PIB/PolDense-150M. Loaded once at
        startup. If data/index-vectors.json (build-index-vectors.py) was built with another model, the service refuses
        to start (--allow-mismatch overrides), because the need and the records must come from the same model.
        With the model in the Hugging Face cache, HF_HUB_OFFLINE=1 starts it without contacting the Hub.
Address: --host and --port, or EMBEDDING_HOST and EMBEDDING_PORT, default 127.0.0.1:8765.
Endpoints:
  GET  /health  model, dims, prefixes, the model and data version of data/index-vectors.json (null without the file),
                uptime_s and requests_served (the /embed requests answered with vectors)
  POST /embed   {"texts": ["..."], "kind": "query" | "passage"} -> {"model": ..., "dims": ..., "vectors": [[...], ...]}
                Unit-length vectors, so cosine is a dot product. "query" (the default) prefixes every text with
                "[query]: ", "passage" with nothing, as build-index-vectors.py does. At most 64 non-blank texts of at
                most 8000 characters and of at most the model's token limit; nothing is truncated, anything else is
                HTTP 400 with {"error": ...}.
Privacy: needs are sensitive texts (12.6). The log has one line per request (count, kind, milliseconds, status), never
        a text, a query string or a client address.

Usage (from the repository root):
  .venv/Scripts/python scripts/embedding-service.py [--model OPI-PIB/PolDense-150M] [--port 8765]
  .venv/Scripts/python scripts/embedding-service.py --self-test
--self-test starts no server: it loads the model, embeds one query and two passages, prints the cosines and exits 0
when the shapes and norms are right.
"""
import argparse, json, logging, os, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env.dev"))  # the environment wins, as in the app
VECTORS = os.path.join(ROOT, "data", "index-vectors.json")
DEFAULT_MODEL = "OPI-PIB/PolDense-400M"
PREFIX = {"query": "[query]: ", "passage": ""}
MAX_TEXTS, MAX_CHARS = 64, 8000
MAX_BODY = 4 * 1024 * 1024  # 64 texts of 8000 characters, escaped as JSON, stay below this
log = logging.getLogger("embedding-service")


def index_header():
    """The header of data/index-vectors.json (every key before the vectors), or None without the file."""
    if not os.path.exists(VECTORS):
        return None
    with open(VECTORS, encoding="utf-8") as f:
        head = f.read(8192)
    cut = head.find('"vectors"')
    if cut < 0:  # not the layout build-index-vectors.py writes: read the whole file
        with open(VECTORS, encoding="utf-8") as f:
            return {k: v for k, v in json.load(f).items() if k != "vectors"}
    return json.loads(head[:cut].rstrip().rstrip(",") + "}")


def parse_body(raw):
    """(texts, kind) from a request body, or ValueError with a message that quotes no text."""
    try:
        body = json.loads(raw)
    except ValueError:
        raise ValueError("the body is not JSON") from None
    if not isinstance(body, dict):
        raise ValueError('the body must be an object {"texts": [...], "kind": "query" | "passage"}')
    texts, kind = body.get("texts"), body.get("kind") or "query"
    if not isinstance(kind, str) or kind not in PREFIX:
        raise ValueError('kind must be "query" or "passage"')
    if not isinstance(texts, list) or not texts:
        raise ValueError("texts must be a non-empty list")
    if len(texts) > MAX_TEXTS:
        raise ValueError(f"{len(texts)} texts; at most {MAX_TEXTS} per request")
    for i, t in enumerate(texts):
        if not isinstance(t, str) or not t.strip():
            raise ValueError(f"text {i} is not a non-blank string")
        if len(t) > MAX_CHARS:
            raise ValueError(f"text {i} has {len(t)} characters; at most {MAX_CHARS}")
    return texts, kind


def embed(model, texts, kind):
    """Unit-length vectors for the texts with the prefix of the kind; ValueError if a text exceeds the token limit."""
    prefixed = [PREFIX[kind] + t for t in texts]
    limit = model.max_seq_length
    for i, ids in enumerate(model.tokenizer(prefixed)["input_ids"]):
        if limit and len(ids) > limit:
            raise ValueError(f"text {i} has {len(ids)} tokens; the model takes at most {limit}")
    return model.encode(prefixed, batch_size=16, normalize_embeddings=True, convert_to_numpy=True,
                        show_progress_bar=False)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload, count="-", kind="-"):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        ms = (time.perf_counter() - self.t0) * 1000
        log.info("%s %s status=%d count=%s kind=%s ms=%.0f%s", self.command, self.path.split("?")[0], status, count,
                 kind, ms, f" error={payload['error']}" if "error" in payload else "")  # errors quote no text

    def log_message(self, *args):  # the default access log names the client address; reply() logs instead
        pass

    def do_GET(self):
        self.t0, srv = time.perf_counter(), self.server
        if self.path.split("?")[0] != "/health":
            return self.reply(404, {"error": "not found; GET /health or POST /embed"})
        index = index_header() or {}
        self.reply(200, {"status": "ok", "model": srv.model_id, "dims": srv.dims, "query_prefix": PREFIX["query"],
                         "passage_prefix": PREFIX["passage"], "max_texts": MAX_TEXTS, "max_chars": MAX_CHARS,
                         "index_model": index.get("model"), "index_data_version": index.get("data_version"),
                         "uptime_s": round(time.time() - srv.started), "requests_served": srv.served})

    def do_POST(self):
        self.t0, srv = time.perf_counter(), self.server
        if self.path.split("?")[0] != "/embed":
            return self.reply(404, {"error": "not found; GET /health or POST /embed"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if not 0 < length <= MAX_BODY:
                raise ValueError(f"the body needs a Content-Length between 1 and {MAX_BODY} bytes")
            texts, kind = parse_body(self.rfile.read(length))
            with srv.lock:  # the tokenizer and the model are not safe to call from two threads at once
                vectors = embed(srv.model, texts, kind)
                srv.served += 1
        except ValueError as e:
            return self.reply(400, {"error": str(e)})
        except Exception as e:  # the message could echo input, so only the type is logged and returned
            log.error("embedding failed: %s", type(e).__name__)
            return self.reply(500, {"error": f"embedding failed ({type(e).__name__})"})
        self.reply(200, {"model": srv.model_id, "dims": srv.dims, "vectors": vectors.tolist()}, len(texts), kind)


def self_test(model, model_id):
    query = ["Samotni seniorzy na wsi nie mają z kim porozmawiać i nie wychodzą z domu"]
    passages = ["Klub seniora w sołectwie: cotygodniowe spotkania, wspólne wyjścia i rozmowy z wolontariuszami",
                "Szkolenie z obsługi drukarki 3D dla uczniów technikum"]
    t0 = time.perf_counter()
    q = embed(model, query, "query")
    ms = (time.perf_counter() - t0) * 1000
    p = embed(model, passages, "passage")
    dims = model.get_embedding_dimension()
    print(f"model {model_id}, {dims} dimensions, one query embedded in {ms:.0f} ms")
    print(f"cosine query-related passage   {float(q[0] @ p[0]):.3f}")
    print(f"cosine query-unrelated passage {float(q[0] @ p[1]):.3f}")
    norms = np.linalg.norm(np.vstack([q, p]), axis=1)
    ok = q.shape == (1, dims) and p.shape == (2, dims) and np.allclose(norms, 1, atol=1e-3)
    print("self-test " + ("passed" if ok else "FAILED: wrong shape or vectors not unit length"))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL))
    ap.add_argument("--host", default=os.environ.get("EMBEDDING_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("EMBEDDING_PORT", "8765")))
    ap.add_argument("--allow-mismatch", action="store_true",
                    help="serve even if data/index-vectors.json was built with another model")
    ap.add_argument("--self-test", action="store_true", help="embed three sample texts, print the cosines and exit")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(message)s", stream=sys.stdout)
    log.setLevel(logging.INFO)  # this service's lines only; the libraries stay at warnings
    index = index_header()
    if not a.self_test and index and index.get("model") != a.model and not a.allow_mismatch:
        sys.exit(f"data/index-vectors.json was built with {index.get('model')}, not {a.model}: serve that model "
                 "(--model or EMBEDDING_MODEL), rebuild the vectors with build-index-vectors.py "
                 "or pass --allow-mismatch")
    from sentence_transformers import SentenceTransformer
    t0 = time.time()
    model = SentenceTransformer(a.model)
    log.info("model %s loaded in %.0f s", a.model, time.time() - t0)
    if a.self_test:
        sys.exit(self_test(model, a.model))
    server = ThreadingHTTPServer((a.host, a.port), Handler)
    server.model, server.model_id, server.dims = model, a.model, model.get_embedding_dimension()
    server.started, server.served, server.lock = time.time(), 0, threading.Lock()
    log.info("serving %s (%d dimensions) on http://%s:%d; index %s, data version %s", a.model, server.dims, a.host,
             a.port, index.get("model") if index else "missing", index.get("data_version") if index else "-")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("stopped")


if __name__ == "__main__":
    main()
