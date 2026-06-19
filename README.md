<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/GitHub_CLI-Required-181717?style=for-the-badge&logo=github" alt="GitHub CLI" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge" alt="PRs Welcome" />
</p>

<h1 align="center">🧠 NotifyIQ</h1>

<p align="center">
  <strong>AI-powered GitHub notification triage CLI</strong><br/>
  Stop drowning in notifications. Start acting on what matters.
</p>

---

## ⚡ The Problem GitHub Won't Solve

GitHub notifications are **broken** for serious developers:
- 🔔 Maintainers receive **200+ notifications per 12 hours**
- 🚫 GitHub has **no "Mark All Read"** button
- 🤖 AI-generated PRs create **review overload**
- 📊 No way to see **which repos generate the most noise**
- 🧠 No **smart prioritization** — everything looks the same

**NotifyIQ fixes all of this.**

---

## 🎯 What NotifyIQ Does

| Feature | Description |
|---------|-------------|
| 🧠 **Smart Inbox** | View notifications ranked by AI priority score |
| 📬 **Daily Digest** | Auto-generated digest (terminal / markdown / JSON) |
| 📊 **Analytics** | Notification stats, repo noise ranking, hourly heatmap |
| ✅ **Mark All Read** | The feature GitHub forgot — one command to clear all |
| 🗑️ **Spam Detection** | Auto-detect and filter spam notifications |
| 💤 **Snooze** | Snooze notifications from noisy repos for later |
| 🤖 **Auto-Actions** | Configurable rules: auto-read spam, flag mentions, etc. |
| ⚙️ **Configurable** | Tweak priority thresholds, AI provider, rules |

---

## 📦 Installation

```bash
# Clone the repo
git clone https://github.com/turfin-logic/notifyiq.git
cd notifyiq

# Install dependencies
npm install

# Link globally (optional)
npm link
```

### Prerequisites

- **Node.js 18+** — [Install](https://nodejs.org)
- **GitHub CLI (`gh`)** — [Install](https://cli.github.com)
- **GitHub CLI authenticated** — run `gh auth login`

> NotifyIQ uses `gh api` under the hood, so it inherits your GitHub CLI authentication. No separate tokens needed!

---

## 🚀 Quick Start

```bash
# View your smart inbox (AI-prioritized)
notifyiq inbox

# Short alias
notifyiq in

# Generate today's digest
notifyiq digest

# View notification analytics
notifyiq stats

# MARK ALL AS READ (the killer feature!)
notifyiq mark --all-read
```

---

## 📖 Commands

### `notifyiq inbox` (alias: `in`)
Smart notification inbox with AI-prioritized ranking.

```bash
notifyiq inbox                      # Default: unread, top 30
notifyiq in --all                   # Include read notifications
notifyiq in --filter pr             # Only pull requests
notifyiq in --filter issue          # Only issues
notifyiq in --repo owner/repo       # Filter by repo
notifyiq in --reason mention        # Only mentions
notifyiq in --since 7d               # Last 7 days
notifyiq in --priority              # Sort by priority score
notifyiq in --limit 50              # Show 50 notifications
```

### `notifyiq digest` (alias: `d`)
Generate a smart digest of your notifications.

```bash
notifyiq digest                     # Daily digest
notifyiq d --period weekly          # Weekly digest
notifyiq d --output markdown        # Markdown output
notifyiq d --save                   # Save to file
notifyiq d --period monthly --output json  # Monthly JSON
```

### `notifyiq stats` (alias: `s`)
Notification analytics and insights.

```bash
notifyiq stats                      # 30-day analytics
notifyiq s --period 7d              # Last 7 days
notifyiq s --top-repos              # Noisiest repos ranking
notifyiq s --response-time          # Response time analysis
notifyiq s --repo owner/repo        # Stats for one repo
```

### `notifyiq mark` (alias: `m`)
Manage notification read/unread status.

```bash
notifyiq mark --all-read            # 🌟 Mark ALL as read!
notifyiq mark --read <id>           # Mark one as read
notifyiq mark --unread <id>         # Mark one as unread
notifyiq mark --spam <id>           # Mark as spam + read
notifyiq mark --done <id>           # Mark as done + read
```

### `notifyiq snooze` (alias: `z`)
Snooze notifications for later review.

```bash
notifyiq snooze --repo owner/repo   # Snooze all from a repo
notifyiq snooze --repo owner/repo -t 1w  # Snooze for 1 week
notifyiq snooze --list              # View snoozed items
notifyiq snooze --unsnooze <id>     # Unsnooze one
notifyiq snooze --clear             # Clear all snoozed
```

### `notifyiq config` (alias: `c`)
Configure NotifyIQ preferences.

```bash
notifyiq config --show              # View all config
notifyiq config --set ai_provider=ollama  # Use local AI
notifyiq config --ai-key sk-...      # Set API key
notifyiq config --reset              # Reset to defaults
```

### `notifyiq auto` (alias: `a`)
Configure and run auto-actions.

```bash
notifyiq auto --list                # List all auto-rules
notifyiq auto --enable spam         # Enable spam auto-filter
notifyiq auto --run                 # Run auto-actions
notifyiq auto --dry-run             # Preview what would happen
```

---

## 🧠 AI Priority Scoring

Every notification gets a **0-100 priority score** based on:

| Signal | Weight |
|--------|--------|
| Reason (mention, review_requested, etc.) | 60% |
| Type (PR > Issue > Release > Discussion) | 40% |
| Keyword analysis (security, blocker, etc.) | Boost |
| Time decay (older = lower score) | Penalty |
| Unread status | Bonus |
| Spam pattern matching | Zero |

### Priority Levels

| Score | Level | Color | Action |
|-------|-------|-------|--------|
| 80+ | 🔴 Critical | Red | Immediate action |
| 65-79 | 🟠 High | Yellow | Needs attention |
| 45-64 | 🟡 Medium | Cyan | Review when possible |
| 0-44 | 🟢 Low | Gray | Can ignore |

---

## 🔧 Configuration

NotifyIQ stores config in `~/.notifyiq/config.json`:

```json
{
  "ai_provider": "rule-based",
  "inbox_default_limit": 30,
  "digest_default_period": "daily",
  "priority_thresholds": {
    "critical": 80,
    "high": 65,
    "medium": 45
  },
  "auto_rules": {
    "spam": true,
    "ci-green": false,
    "mention": false,
    "release": false
  }
}
```

### AI Providers (optional)

NotifyIQ works great with **rule-based** classification out of the box. For smarter classification, connect an LLM:

```bash
# OpenAI
notifyiq config --set ai_provider=openai
notifyiq config --ai-key sk-your-key

# Anthropic
notifyiq config --set ai_provider=anthropic

# Local Ollama (free!)
notifyiq config --set ai_provider=ollama
notifyiq config --set ollama_model=llama3
```

---

## 🏗️ Architecture

```
src/
├── index.js              # CLI entry point (Commander.js)
├── commands/
│   ├── inbox.js          # Smart inbox view
│   ├── digest.js         # Digest generation
│   ├── stats.js          # Analytics engine
│   ├── mark.js           # Read/unread management
│   ├── snooze.js         # Snooze system
│   ├── config.js         # Configuration manager
│   └── auto.js           # Auto-action engine
├── services/
│   └── github.js         # GitHub API layer (gh CLI)
├── classifiers/
│   └── classifier.js     # AI priority scoring
└── utils/
    └── (helpers)
```

---

## 🤝 Contributing

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📝 License

MIT © [turfin-logic](https://github.com/turfin-logic)

---

<p align="center">
  Made with ❤️ to fight notification fatigue
</p>
