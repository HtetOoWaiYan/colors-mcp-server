#!/usr/bin/env python3
"""Runs the 3 suites for this repo's server and pinned third-party servers, 3 jobs at a time.

Each suite gets one base run (no-tools + this repo's `main`); every third-party server then reuses
that run's no-tools cells (--reuse-from). Exit code 2 from the CLI means HTTP 429: wait, then resume
the same run id, which only re-runs unfinished cells. The caller must have started the proxy, so no
job stops it under the others.
"""
import os, subprocess, sys, threading, time

EVALS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS = os.path.join(EVALS, ".cache", "bench-logs")
os.makedirs(LOGS, exist_ok=True)
SUITES = {"v1": "v1", "gen": "generalization", "fresh": "fresh"}
SERVERS = sys.argv[1].split(",")
WORKERS = int(os.environ.get("BENCH_WORKERS", "3"))
lock = threading.Lock()
done, failed = set(), set()
jobs = []  # (name, suite_key, args, dep)
for k, s in SUITES.items():
    jobs.append((f"base-{k}", k, ["--suite", s, "--run-id", f"bench-base-{k}", "--server-ref", "main"], None))
for sid in SERVERS:
    for k, s in SUITES.items():
        jobs.append((f"{sid}-{k}", k, ["--suite", s, "--run-id", f"bench-{sid}-{k}", "--server-id", sid, "--reuse-from", f"bench-base-{k}"], f"base-{k}"))
pending = list(jobs)

def run_job(name, args):
    log = open(os.path.join(LOGS, f"{name}.log"), "a")
    for attempt in range(40):
        code = subprocess.call(["npx", "tsx", "src/cli.ts", "run", *args], cwd=EVALS, stdout=log, stderr=subprocess.STDOUT)
        log.write(f"\n--- exit {code} (attempt {attempt + 1})\n"); log.flush()
        if code == 0:
            return True
        time.sleep(900 if code == 2 else 60)  # 429: wait out the usage window
        if code not in (2,) and attempt >= 2:
            return False
    return False

def worker():
    while True:
        with lock:
            ready = [j for j in pending if j[3] is None or j[3] in done]
            if not ready:
                if not pending or all(j[3] in failed for j in pending if j[3]):
                    return
                job = None
            else:
                # longest suites first: v1 > fresh > gen
                ready.sort(key=lambda j: {"v1": 0, "fresh": 1, "gen": 2}[j[1]])
                job = ready[0]; pending.remove(job)
        if job is None:
            time.sleep(30); continue
        print(time.strftime("%H:%M:%S"), "start", job[0], flush=True)
        ok = run_job(job[0], job[2])
        with lock:
            (done if ok else failed).add(job[0])
        print(time.strftime("%H:%M:%S"), "done " if ok else "FAILED", job[0], flush=True)

ts = [threading.Thread(target=worker) for _ in range(WORKERS)]
[t.start() for t in ts]; [t.join() for t in ts]
print("ALL DONE; failed:", sorted(failed), flush=True)
