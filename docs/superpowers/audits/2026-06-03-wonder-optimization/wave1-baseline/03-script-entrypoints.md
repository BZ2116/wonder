# Script Entrypoints Baseline

Date: 2026-06-03

## Scripts Added Or Confirmed

| Script | Command | Result |
|---|---|---|
| `test` | `vitest run` | PASS (166/166) |
| `test:unit` | `vitest run` | PASS (166/166) |
| `test:server` | `vitest run tests/server` | PASS (115/115) |
| `test:python` | `python -m pytest backend/tests -q` | BLOCKED (missing dependencies) |
| `typecheck` | `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.electron.json --noEmit` | FAIL (TS5101 error in tsconfig.json) |
| `verify` | `npm run typecheck && npm run test:unit && npm run test:python` | BLOCKED (depends on typecheck + python) |

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `node -e "JSON.parse(...)"` | OK | package.json is valid JSON |
| `npm run test:unit` | PASS | 16 test files, 166 tests passed |
| `npm run test:server` | PASS | 10 test files, 115 tests passed |
| `npm run typecheck` | FAIL | TS5101: `baseUrl` deprecated, now error in TS 6.0.3 |
| `npm run test:python` | NOT RUN | Python baseline blocked (missing dependencies) |
| `npm run verify` | NOT RUN | Blocked by typecheck failure + python baseline |

## Follow-Up

1. **typecheck blocked**: `tsconfig.json` line 18 uses deprecated `baseUrl` option. TypeScript 6.0.3 treats TS5101 as error (was warning in earlier versions). Fix: add `"ignoreDeprecations": "6.0"` to `compilerOptions` or remove `baseUrl`.

2. **test:python blocked**: Python dependencies cannot be installed on Python 3.14 (pydantic-core has no prebuilt wheel). Fix: upgrade pydantic or use Python 3.12/3.13.

3. **verify blocked**: Depends on both typecheck and test:python passing.
