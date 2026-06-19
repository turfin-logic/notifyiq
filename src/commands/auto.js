// src/commands/auto.js — Auto-action engine for notifications

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import os from 'os';

const RULES_FILE = path.join(os.homedir(), '.notifyiq', 'rules.json');

const DEFAULT_RULES = {
  spam: {
    enabled: true,
    description: 'Auto-mark detected spam as read',
    action: 'mark-read',
    filters: {
      score: 0,          // Only spam-scored (0) notifications
      types: ['Issue'],
    },
  },
  'ci-green': {
    enabled: false,
    description: 'Auto-resolve CI-green notifications (merged PRs, passed checks)',
    action: 'mark-read',
    filters: {
      reason: ['author'],
      types: ['PullRequest'],
      keywords: ['merged', 'ci passed', 'checks passed', 'all checks passed'],
    },
  },
  mention: {
    enabled: false,
    description: 'Auto-label high-priority mentions',
    action: 'flag',
    filters: {
      reason: ['mention', 'team_mention'],
      minScore: 70,
    },
  },
  release: {
    enabled: false,
    description: 'Auto-read release notifications for muted repos',
    action: 'mark-read',
    filters: {
      types: ['Release'],
    },
  },
};

function loadRules() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      return JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

function saveRules(rules) {
  const dir = path.dirname(RULES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

export default async function autoCommand(options) {
  const {
    enable = null,
    disable = null,
    list = false,
    run = false,
    dryRun = false,
  } = options;

  // List rules
  if (list) {
    const rules = loadRules();
    console.log('');
    console.log(chalk.bold.cyan('🤖 NotifyIQ Auto-Rules\n'));

    for (const [name, rule] of Object.entries(rules)) {
      const status = rule.enabled ? chalk.green.bold('✓ ON ') : chalk.red.bold('✗ OFF');
      console.log(`  ${status}  ${chalk.bold(name)}`);
      console.log(chalk.dim(`         ${rule.description}`));
      console.log(chalk.dim(`         Action: ${rule.action}`));
      console.log('');
    }

    console.log(chalk.dim('  Enable:  notifyiq auto --enable <rule>'));
    console.log(chalk.dim('  Disable: notifyiq auto --disable <rule>'));
    console.log(chalk.dim('  Run:     notifyiq auto --run'));
    console.log('');
    return;
  }

  // Enable a rule
  if (enable) {
    const rules = loadRules();
    if (!rules[enable]) {
      console.log(chalk.yellow(`\n⚠️  Unknown rule "${enable}". Run --list to see available rules.\n`));
      return;
    }
    rules[enable].enabled = true;
    saveRules(rules);
    console.log(chalk.green(`\n✅ Rule "${enable}" enabled.\n`));
    return;
  }

  // Disable a rule
  if (disable) {
    const rules = loadRules();
    if (!rules[disable]) {
      console.log(chalk.yellow(`\n⚠️  Unknown rule "${disable}". Run --list to see available rules.\n`));
      return;
    }
    rules[disable].enabled = false;
    saveRules(rules);
    console.log(chalk.green(`\n✅ Rule "${disable}" disabled.\n`));
    return;
  }

  // Run auto-actions
  if (run || dryRun) {
    const spinner = ora(chalk.cyan(dryRun ? 'Dry-running auto-actions...' : 'Running auto-actions...')).start();
    try {
      const { fetchNotifications, markNotificationRead, extractThreadId } = await import('../services/github.js');
      const { classifyNotification } = await import('../classifiers/classifier.js');

      const notifications = fetchNotifications({ all: false });
      const rules = loadRules();
      const enabledRules = Object.entries(rules).filter(([, r]) => r.enabled);

      let actioned = 0;
      const actions = [];

      for (const n of notifications) {
        const iq = classifyNotification(n);
        const id = extractThreadId(n);

        for (const [ruleName, rule] of enabledRules) {
          if (matchesRule(n, iq, rule)) {
            actions.push({
              rule: ruleName,
              action: rule.action,
              title: n.subject?.title,
              repo: n.repository?.full_name,
              id,
            });

            if (!dryRun && rule.action === 'mark-read' && id) {
              markNotificationRead(id);
            }
            actioned++;
          }
        }
      }

      spinner.stop();

      if (actions.length === 0) {
        console.log(chalk.green('\n✅ No auto-actions triggered.\n'));
      } else {
        console.log('');
        console.log(chalk.bold(dryRun ? chalk.yellow('🔍 Dry Run — Auto-Actions Preview') : chalk.green('🤖 Auto-Actions Applied')));
        console.log(chalk.dim('─'.repeat(55)));

        for (const action of actions) {
          const icon = action.action === 'mark-read' ? '✓' : '⚑';
          const color = dryRun ? chalk.yellow : chalk.green;
          console.log(`  ${color(icon)} [${chalk.bold(action.rule)}] ${action.title}`);
          console.log(chalk.dim(`    ${action.repo} — ${action.action}${dryRun ? ' (would execute)' : ' (executed)'}`));
          console.log('');
        }

        console.log(chalk.dim('─'.repeat(55)));
        console.log(`  Total: ${chalk.bold(actions.length)} action(s)${dryRun ? ' would be' : ' were'} taken.`);
        console.log('');
      }
      return;
    } catch (err) {
      spinner.fail(chalk.red('Auto-actions failed'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  // No options — show help
  console.log(chalk.yellow('\n⚠️  Provide an action. Examples:\n'));
  console.log(chalk.dim('  notifyiq auto --list            List all rules'));
  console.log(chalk.dim('  notifyiq auto --enable <rule>   Enable a rule'));
  console.log(chalk.dim('  notifyiq auto --disable <rule>  Disable a rule'));
  console.log(chalk.dim('  notifyiq auto --run             Run auto-actions'));
  console.log(chalk.dim('  notifyiq auto --dry-run         Preview auto-actions'));
  console.log('');
}

function matchesRule(notification, iq, rule) {
  const { filters } = rule;
  const type = notification.subject?.type;
  const reason = notification.reason;

  // Check type filter
  if (filters.types && !filters.types.includes(type)) return false;

  // Check reason filter
  if (filters.reason && !filters.reason.includes(reason)) return false;

  // Check score filter
  if (filters.score !== undefined && iq.score !== filters.score) return false;

  if (filters.minScore !== undefined && iq.score < filters.minScore) return false;

  // Check keyword filter
  if (filters.keywords) {
    const title = (notification.subject?.title || '').toLowerCase();
    const matches = filters.keywords.some(kw => title.includes(kw.toLowerCase()));
    if (!matches) return false;
  }

  return true;
}
