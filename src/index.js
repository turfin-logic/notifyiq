#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import figures from 'figures';

import inboxCommand from './commands/inbox.js';
import digestCommand from './commands/digest.js';
import statsCommand from './commands/stats.js';
import markCommand from './commands/mark.js';
import snoozeCommand from './commands/snooze.js';
import configCommand from './commands/config.js';
import autoCommand from './commands/auto.js';

const VERSION = '1.0.0';

program
  .name('notifyiq')
  .description(chalk.cyan.bold(
    `${figures.star}  NotifyIQ — AI-powered GitHub notification triage\n` +
    `    Stop drowning in notifications. Start acting on what matters.`
  ))
  .version(VERSION);

program
  .command('inbox')
  .alias('in')
  .description('View and triage your GitHub notification inbox')
  .option('-a, --all', 'Show all notifications (read + unread)')
  .option('-f, --filter <type>', 'Filter by type: issue, pr, release, discussion, mention, review')
  .option('-r, --repo <repo>', 'Filter by repository (e.g., owner/repo)')
  .option('-l, --limit <n>', 'Max notifications to show', '30')
  .option('--reason <reason>', 'Filter by reason: author, comment, mention, review_requested, assign, subscribed, team_mention')
  .option('--priority', 'Sort by AI priority score')
  .option('-s, --since <date>', 'Notifications since date (e.g., 2024-01-01 or 7d, 24h)')
  .action(inboxCommand);

program
  .command('digest')
  .alias('d')
  .description('Generate a smart daily/weekly digest of your notifications')
  .option('-p, --period <period>', 'Period: daily, weekly, monthly', 'daily')
  .option('-o, --output <format>', 'Output format: terminal, markdown, json', 'terminal')
  .option('--save', 'Save digest to file')
  .action(digestCommand);

program
  .command('stats')
  .alias('s')
  .description('Show notification analytics and insights')
  .option('-p, --period <period>', 'Period: 7d, 30d, 90d', '30d')
  .option('-r, --repo <repo>', 'Stats for specific repo')
  .option('--top-repos', 'Show noisiest repos ranking')
  .option('--response-time', 'Show your average response time')
  .option('-o, --output <format>', 'Output format: terminal, json', 'terminal')
  .action(statsCommand);

program
  .command('mark')
  .alias('m')
  .description('Manage notification read status')
  .option('--read <id>', 'Mark specific notification as read')
  .option('--unread <id>', 'Mark specific notification as unread')
  .option('--all-read', 'Mark all notifications as read (GitHub lacks this — we do it!)')
  .option('--spam <id>', 'Mark as spam and read')
  .option('--done <id>', 'Mark as done and read')
  .action(markCommand);

program
  .command('snooze')
  .alias('z')
  .description('Snooze notifications to review later')
  .option('-t, --time <duration>', 'Snooze duration: 1h, 4h, 1d, 1w', '1d')
  .option('-r, --repo <repo>', 'Snooze all from a repo')
  .option('-f, --filter <type>', 'Snooze by type')
  .option('--list', 'List snoozed notifications')
  .option('--unsnooze <id>', 'Unsnooze a notification')
  .option('--clear', 'Clear all snoozed')
  .action(snoozeCommand);

program
  .command('config')
  .alias('c')
  .description('Configure NotifyIQ preferences')
  .option('--set <key=value>', 'Set a config value')
  .option('--get <key>', 'Get a config value')
  .option('--reset', 'Reset to defaults')
  .option('--show', 'Show current config')
  .option('--ai-provider <provider>', 'Set AI provider: openai, anthropic, local (ollama)')
  .option('--ai-key <key>', 'Set AI API key')
  .action(configCommand);

program
  .command('auto')
  .alias('a')
  .description('Configure and run auto-actions on notifications')
  .option('--enable <rule>', 'Enable an auto-rule (spam, ci-green, mention, release)')
  .option('--disable <rule>', 'Disable an auto-rule')
  .option('--list', 'List all auto-rules and their status')
  .option('--run', 'Run auto-actions on current inbox')
  .option('--dry-run', 'Preview what auto-actions would do')
  .action(autoCommand);

// Default action — show inbox
program.action(async () => {
  await inboxCommand({ all: false, filter: null, repo: null, limit: '30', reason: null, priority: false, since: null });
});

program.parse(process.argv);
