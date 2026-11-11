#!/usr/bin/env python3
"""Run a set of conditions on one suite, one run per (condition, model), N jobs at a time.

usage: bench-suite.py --suite neutral --prefix nb2 --mine-ref 014fe97 --conds mine,mine-instr [--base base] [--jobs 3]

Conditions: mine, mine-instr (this repo at --mine-ref), and any id from external-servers.json (+ "-instr" for the
instructions profile). The `base` run per model holds no-tools; every other run reuses its no-tools cells
(--reuse-from). When `--base` names an existing run (e.g. nb-base) its no-tools cells are reused and no base job is added.
Exit code 2 from the CLI means HTTP 429: wait and resume. The caller must have started the proxy.
"""
import argparse, os, subprocess, threading, time

EVALS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--suite", required=True)
ap.add_argument("--prefix", required=True)
ap.add_argument("--mine-ref", required=True)
ap.add_argument("--conds", required=True)
ap.add_argument("--base", help="existing run prefix whose no-tools cells are reused, e.g. nb-base (omit to make <prefix>-base)")
ap.add_argument("--jobs", type=int, default=3)
a = ap.parse_args()
LOGS = os.path.join(EVALS, ".cache", f"bench-logs-{a.prefix}")
os.makedirs(LOGS, exist_ok=True)
MODELS = {"h": "haiku-5-5", "l": "gpt-6-luna"}

def sel(tag):
    instr = tag.endswith("-instr")
    core = tag[: -len("-instr")] if instr else tag
    args = ["--server-ref", a.mine_ref] if core == "mine" else ["--server-id", core]
    return args + (["--profile", "instructions"] if instr else [])

lock = threading.Lock()
done, failed, pending = set(), set(), []
base_prefix = a.base or f"{a.prefix}-base"
if not a.base:
    for m, model in MODELS.items():
        pending.append((f"base-{m}", ["--suite", a.suite, "--run-id", f"{base_prefix}-{m}", "--server-ref", a.mine_ref, "--models", model], None))
for tag in a.conds.split(","):
    if tag == "mine" and not a.base:
        continue  # the base run already holds mine
    for m, model in MODELS.items():
        dep = None if a.base else f"base-{m}"
        pending.append((f"{tag}-{m}", ["--suite", a.suite, "--run-id", f"{a.prefix}-{tag}-{m}", *sel(tag), "--models", model, "--reuse-from", f"{base_prefix}-{m}"], dep))

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

ts = [threading.Thread(target=worker) for _ in range(a.jobs)]
[t.start() for t in ts]; [t.join() for t in ts]
print("ALL DONE; failed:", sorted(failed), flush=True)
