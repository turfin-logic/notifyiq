# Claim evidence

Local verification snapshot: 3 September 2026. See GitHub Actions for subsequent remote results. Tests use local fixtures and an injected GitHub CLI executor. Live account mutations and remote CI have not been executed for this revision.

| Claim | Code evidence | Test evidence | Status |
|---|---|---|---|
| Local rule-based classification | `src/classifiers/classifier.js` | Existing classifier tests | VERIFIED |
| LLM-powered classification/providers | No model inference integration | None | FALSE — removed from README/description |
| Security alerts override spam and age penalties | Final security override in classifier | Crypto vulnerability and old alert regressions | VERIFIED for covered heuristics |
| Auto-rules skip classified security alerts | `src/commands/auto.js:matchesRule` | Security rule-protection regression | VERIFIED |
| Unimplemented flag action performs a real mutation | No flag implementation | Unsupported-action regression excludes it | FALSE — removed from defaults and execution claims |
| GitHub request values cannot be shell instructions | `src/services/github.js:createGhApi`, argument array, `shell:false` | Adversarial value stays one argument | VERIFIED |
| Paginated notifications aggregate correctly | `--paginate --slurp`, validated array flattening | Two-page fixture and malformed-page rejection | VERIFIED |
| `--all` includes read notifications | Explicit `all=true` query parameter | Endpoint regression | VERIFIED at request boundary; live API NOT EXECUTED |
| Mark-unread is supported through this REST path | No supported endpoint used | Operation rejects before network | FALSE — CLI option removed |
| Snooze wakes notifications later | Local JSON bookkeeping only | No background scheduler test | FALSE — explicitly disclaimed |
| API keys can safely be stored/shown in config | No AI key needed; input/getter rejects credentials | Credential setter/getter and prototype-path regressions | VERIFIED for guarded paths; legacy files need manual cleanup |
| Clean install/test/lint/package checks work | Lockfile, test script and ESLint config | Node 24.20.0 / Windows checks | VERIFIED within that environment |
| Supported CI matrix passes | Proposed Windows/Linux, Node 22.14/24 workflow | Local Node 22 blocked by EPERM; remote matrix NOT EXECUTED | PARTIAL |

No claim is made that keyword rules detect every security issue, quantify productivity or make automatic read-status changes universally safe. Preview auto-rules and review existing enabled settings before running them.
