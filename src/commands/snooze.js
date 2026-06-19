// src/commands\snooze.js — Snooze notifications for later review

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SNOOZE_FILE = path.join(os.homedir(), '.notifyiq', 'snoozed.json');

function loadSnoozed() {
  try {
    if (fs.existsSync(SNOOZE_FILE)) {
      return JSON.parse(fs.readFileSync(SNOOZE_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

function saveSnoozed(snoozed) {
  const dir = path.dirname(SNOOZE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SNOOZE_FILE, JSON.stringify(snoozed, null, 2));
}

export default async function snoozeCommand(options) {
  const {
    time = '1d',
    repo = null,
    filter = null,
    list = false,
    unsnooze: unsnoozeId = null,
    clear = false,
  } = options;

  // List snoozed
  if (list) {
    const snoozed = loadSnoozed();
    if (snoozed.length === 0) {
      console.log(chalk.green('\n✅ No snoozed notifications.\n'));
      return;
    }
    console.log(chalk.bold.cyan('\n💤 Snoozed Notifications\n'));
    for (const item of snoozed) {
      const wakeAt = new Date(item.wakeAt);
      const remaining = getTimeRemaining(wakeAt);
      console.log(`  ${chalk.bold(item.title)} — ${chalk.dim(item.repo)}`);
      console.log(chalk.dim(`    Wake in: ${remaining} (snoozed at ${item.snoozedAt})`));
      console.log('');
    }
    return;
  }

  // Unsnooze
  if (unsnoozeId) {
    let snoozed = loadSnoozed();
    const before = snoozed.length;
    snoozed = snoozed.filter(item => String(item.id) !== String(unsnoozeId));
    saveSnoozed(snoozed);
    if (snoozed.length < before) {
      console.log(chalk.green(`\n✅ Notification ${unsnoozeId} unsnoozed.\n`));
    } else {
      console.log(chalk.yellow(`\n⚠️  No snoozed notification with id ${unsnoozeId}.\n`));
    }
    return;
  }

  // Clear all
  if (clear) {
    saveSnoozed([]);
    console.log(chalk.green('\n✅ All snoozed notifications cleared.\n'));
    return;
  }

  // Snooze — need repo or a notification list
  if (!repo) {
    console.log(chalk.yellow('\n⚠️  Specify --repo <owner/repo> to snooze all notifications from a repo.\n'));
    return;
  }

  const spinner = ora(chalk.cyan(`Snoozing ${repo} notifications for ${time}...`)).start();

  try {
    const { fetchNotifications, extractThreadId } = await import('../services/github.js');
    let notifications = fetchNotifications({ all: false });

    notifications = notifications.filter(n =>
      n.repository?.full_name.toLowerCase() === repo.toLowerCase()
    );

    if (filter) {
      notifications = notifications.filter(n => n.subject?.type.toLowerCase() === filter.toLowerCase());
    }

    if (notifications.length === 0) {
      spinner.warn(chalk.yellow(`No notifications found for ${repo}`));
      return;
    }

    const wakeMs = parseDuration(time);
    const snoozed = loadSnoozed();

    for (const n of notifications) {
      const id = extractThreadId(n);
      if (!id) continue;

      // Don't duplicate
      if (snoozed.some(s => s.id === id)) continue;

      snoozed.push({
        id,
        title: n.subject?.title,
        repo: n.repository?.full_name,
        type: n.subject?.type,
        reason: n.reason,
        url: n.subject?.url,
        snoozedAt: new Date().toISOString(),
        wakeAt: new Date(Date.now() + wakeMs).toISOString(),
      });
    }

    saveSnoozed(snoozed);
    spinner.succeed(chalk.green(`💤 Snoozed ${notifications.length} notifications from ${repo} for ${time}`));
    console.log(chalk.dim(`  Run "notifyiq snooze --list" to view snoozed items.`));
    console.log('');

  } catch (err) {
    spinner.fail(chalk.red('Failed to snooze'));
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

function parseDuration(str) {
  const match = str.match(/^(\d+)(h|d|w)$/);
  if (!match) return 24 * 60 * 60 * 1000; // default 1 day
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  if (unit === 'w') return amount * 7 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function getTimeRemaining(wakeDate) {
  const diff = wakeDate - Date.now();
  if (diff <= 0) return chalk.red('OVERDUE');
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours < 1) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
