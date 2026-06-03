# JavaScript Test Baseline

Date: 2026-06-03

## Environment

| Item | Value |
|---|---|
| Node | v24.16.0 |
| npm | 11.13.0 |
| Vitest | 4.1.7 |

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `npm test` | FAIL (43/166) | `better-sqlite3` NODE_MODULE_VERSION mismatch: compiled=127, required=137 |
| `npm rebuild better-sqlite3` | OK | Rebuilt native bindings for Node v24 |
| `npm test` | PASS (166/166) | All tests green after rebuild |
| `npx tsc -p tsconfig.json --noEmit` | WARN | TS5101: `baseUrl` deprecated, will stop in TS 7.0. Not a type error. |
| `npx tsc -p tsconfig.server.json --noEmit` | OK | No errors |

## Current Status

JavaScript tests pass (166/166) after rebuilding `better-sqlite3` native bindings.

TypeScript type-checking passes for `tsconfig.server.json`. The main `tsconfig.json` emits a deprecation warning about the `baseUrl` option (TS5101) — this is not a type error and does not block compilation, but will break in TypeScript 7.0.

## Failures To Carry Forward

| Failure | Evidence | Recommended Next Step |
|---|---|---|
| `tsconfig.json` `baseUrl` deprecation | `TS5101` warning on line 18 | Remove `baseUrl` or add `"ignoreDeprecations": "6.0"` before upgrading to TS 7.0 |

## Files Changed

No files changed.
