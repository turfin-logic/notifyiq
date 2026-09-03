# NotifyIQ

[![CI](https://github.com/turfin-logic/notifyiq/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/turfin-logic/notifyiq/actions/workflows/ci.yml)

Experimental, rule-based CLI for sorting GitHub notifications, showing digests and previewing optional read-status actions. The classifier runs locally. There is no OpenAI, Anthropic or Ollama inference integration in this version; it does not need an AI API key.

## Setup and first use

Requires Node.js 22.14+, npm and an authenticated GitHub CLI with access to your notifications. Use a current GitHub CLI supporting `gh api --paginate --slurp`.

```sh
git clone https://github.com/turfin-logic/notifyiq.git
cd notifyiq
npm ci --ignore-scripts
node src/index.js --help
node src/index.js inbox --all --priority
node src/index.js auto --dry-run
```

`inbox --all` includes read and unread notifications. Run `--help` for each command for options. Auto rules are disabled by default in new installations; existing rule files keep their explicit settings. Preview rules before enabling/running them. `auto --run`, mark and subscription commands can change your GitHub state.

## Tests and maintenance

```sh
npm test
npm run lint
npm audit --audit-level=high
npm pack --dry-run
```

Tests cover classification, security priority, auto-rule protection, GitHub argument construction, paginated responses and notification IDs. API-boundary tests use injected process execution and do not contact your account. The application is plain JavaScript; no compilation or TypeScript check is required. The CI workflow is configured to run these checks on Windows and Linux, Node 22.14 and 24.

## Limits and security

- Heuristic scores are approximate. Security keywords and vulnerability alerts cannot be suppressed by spam keywords or old age, and auto-rules skip those alerts; this is not complete security detection.
- GitHub requests use separate arguments, a timeout and explicit pagination aggregation. No shell interprets request values.
- GitHub's REST interface used here does not mark threads unread. Use the GitHub inbox for that operation.
- Snooze is local bookkeeping, not a scheduled reminder service. There is no background wakeup guarantee.
- Legacy configuration keys are not evidence of functioning LLM providers. Do not store API secrets in the config file; legacy AI keys should be removed from it. API-key entry is rejected.
- Stats, digest and classifier scores summarize available notification metadata; they do not measure your productivity or response quality.
- Tests do not prove live permission compatibility across all GitHub account types. The CI badge is live workflow evidence, not a static passing-test claim.

Implementation: commands in `src/commands`, API integration in `src/services/github.js`, classifier in `src/classifiers/classifier.js`. [Claim evidence](docs/claim-evidence.md). MIT license.
