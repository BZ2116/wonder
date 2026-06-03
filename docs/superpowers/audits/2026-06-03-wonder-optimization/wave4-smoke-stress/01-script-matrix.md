# Wave 4 Script Matrix

Date: 2026-06-03

## Scripts

| Script | Command | Status |
|---|---|---|
| `test:smoke` | `vitest run tests/smoke` | Pending (directory not created yet) |
| `test:stress` | `vitest run tests/stress` | Pending (directory not created yet) |
| `verify:full` | `npm run verify && npm run test:smoke && npm run test:stress` | Pending (depends on above) |

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `node -e "JSON.parse(...)"` | OK | package.json valid |
| `npm run` | OK | All scripts listed correctly |
| `npm run test:smoke` | SKIPPED | `tests/smoke` directory does not exist |
| `npm run test:stress` | SKIPPED | `tests/stress` directory does not exist |

## Follow-Up

- `tests/smoke/` — needs creation by smoke test agent
- `tests/stress/` — needs creation by stress test agent
- Existing dev/build/test scripts unchanged
