# Python Test Baseline

Date: 2026-06-03

## Environment

| Item | Value |
|---|---|
| Python | 3.14.5 |
| pip | 26.1.1 |

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `python -m pytest backend/tests -q` | FAILED (5 collection errors) | Missing modules: fastapi, anthropic, chromadb |
| `python -m pip install -r backend/requirements.txt` | BLOCKED | pydantic-core 2.23.2 needs source compilation on Python 3.14; process hung during metadata preparation |
| `python -m compileall backend` | OK | All .py files compile without syntax errors |

## Current Status

Python tests are **BLOCKED** — cannot run due to missing runtime dependencies.

Dependency installation fails because `pydantic==2.9.0` pins `pydantic-core==2.23.2`, which has no prebuilt wheel for Python 3.14. Building from source hangs at metadata preparation stage.

## Failures To Carry Forward

| Failure | Evidence | Recommended Next Step |
|---|---|---|
| 5 test collection errors (missing fastapi, anthropic, chromadb) | pytest output shows ModuleNotFoundError for each | Upgrade to pydantic>=2.10 with pydantic-core that ships Python 3.14 wheels, or use Python 3.12/3.13 environment |
| pip install hangs on pydantic-core source build | Task killed after >5 minutes stuck at "Preparing metadata" | Pin pydantic to a version with prebuilt wheels for current Python, or switch to compatible Python version |

## Files Changed

No files changed.
