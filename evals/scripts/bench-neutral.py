#!/usr/bin/env python3
"""Neutral-suite comparison: one run per (server condition, model), 3 jobs at a time.

Per model, a base run holds no-tools plus this repo's `main`; every other condition reuses that
base run's no-tools cells (--reuse-from). Exit code 2 from the CLI means HTTP 429: wait and resume.
The caller must have started the proxy so no job stops it under the others.
"""
import os, subprocess, threading, time

EVALS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS = os.path.join(EVALS, ".cache", "bench-logs-neutral")
os.makedirs(LOGS, exist_ok=True)
MODELS = {"h": "haiku-5-5", "l": "gpt-6-luna"}
# tag -> extra CLI args selecting the server and profile
CONDITIONS = {
    "coolors-mcp": ["--server-id", "coolors-mcp"],
    "mcp-color-convert": ["--server-id", "mcp-color-convert"],
    "color-theory-mcp": ["--server-id", "color-theory-mcp"],
    "color-engine-mcp": ["--server-id", "color-engine-mcp"],
    "mine-instr": ["--server-ref", "main", "--profile", "instructions"],
    "color-engine-mcp-instr": ["--server-id", "color-engine-mcp", "--profile", "instructions"],
}
lock = threading.Lock()
done, failed = set(), set()
pending = []  # (name, args, dep)
for m, model in MODELS.items():
    pending.append((f"base-{m}", ["--suite", "neutral", "--run-id", f"nb-base-{m}", "--server-ref", "main", "--models", model], None))
for tag, extra in CONDITIONS.items():
    for m, model in MODELS.items():
        pending.append((f"{tag}-{m}", ["--suite", "neutral", "--run-id", f"nb-{tag}-{m}", *extra, "--models", model, "--reuse-from", f"nb-base-{m}"], f"base-{m}"))

def run_job(name, args):
    log = open(os.path.join(LOGS, f"{name}.log"), "a")
    for attempt in range(40):
        code = subprocess.call(["npx", "tsx", "src/cli.ts", "run", *args], cwd=EVALS, stdout=log, stderr=subprocess.STDOUT)
        log.write(f"\n--- exit {code} (attempt {attempt + 1})\n"); log.flush()
        if code == 0:
            return True
        time.sleep(900 if code == 2 else 60)
        if code != 2 and attempt >= 2:
            return False
    return False

def worker():
    while True:
        with lock:
            ready = [j for j in pending if j[2] is None or j[2] in done]
            if not ready:
                if not pending or all(j[2] in failed for j in pending if j[2]):
                    return
                job = None
            else:
                job = ready[0]; pending.remove(job)
        if job is None:
            time.sleep(30); continue
        print(time.strftime("%H:%M:%S"), "start", job[0], flush=True)
        ok = run_job(job[0], job[1])
        with lock:
            (done if ok else failed).add(job[0])
        print(time.strftime("%H:%M:%S"), "done " if ok else "FAILED", job[0], flush=True)

ts = [threading.Thread(target=worker) for _ in range(3)]
[t.start() for t in ts]; [t.join() for t in ts]
print("ALL DONE; failed:", sorted(failed), flush=True)
