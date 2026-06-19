// src/commands/stats.js — Notification analytics and insights

import chalk from 'chalk';
import ora from 'ora';

import { fetchNotifications, getNotificationCounts } from '../services/github.js';

export default async function statsCommand(options) {
  const {
    period = '30d',
    repo: repoFilter = null,
    topRepos = false,
    responseTime = false,
    output = 'terminal',
  } = options;

  const spinner = ora(chalk.cyan('Analyzing notifications...')).start();

  try {
    const since = parsePeriod(period);
    let notifications = fetchNotifications({ all: true });

    // Filter by period
    notifications = notifications.filter(n => new Date(n.updated_at) > since);

    if (repoFilter) {
      notifications = notifications.filter(n =>
        n.repository?.full_name.toLowerCase().includes(repoFilter.toLowerCase())
      );
    }

    spinner.stop();

    if (output === 'json') {
      const data = computeStats(notifications, period);
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    renderStats(notifications, period, topRepos, responseTime);

  } catch (err) {
    spinner.fail(chalk.red('Failed to get stats'));
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

function computeStats(notifications, period) {
  // By type
  const byType = {};
  // By reason
  const byReason = {};
  // By repo
  const byRepo = {};
  // By hour of day
  const byHour = new Array(24).fill(0);
  // By day of week
  const byDay = new Array(7).fill(0);

  for (const n of notifications) {
    const type = n.subject?.type || 'Unknown';
    const reason = n.reason || 'Unknown';
    const repo = n.repository?.full_name || 'Unknown';
    const date = new Date(n.updated_at);

    byType[type] = (byType[type] || 0) + 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
    byRepo[repo] = (byRepo[repo] || 0) + 1;
    byHour[date.getHours()]++;
    byDay[date.getUTCDay()]++;
  }

  // Average response time estimation (time from notification to next update)
  let avgResponseHours = null;
  const responseTimes = [];
  for (const n of notifications) {
    const updatedAt = new Date(n.updated_at);
    const lastReadAt = n.last_read_at ? new Date(n.last_read_at) : null;
    if (lastReadAt && lastReadAt > updatedAt) {
      responseTimes.push((lastReadAt - updatedAt) / (1000 * 60 * 60));
    }
  }
  if (responseTimes.length > 0) {
    avgResponseHours = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  // Busiest hour
  const busiestHour = byHour.indexOf(Math.max(...byHour));
  // Busiest day
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const busiestDay = dayNames[byDay.indexOf(Math.max(...byDay))];

  return {
    period,
    total: notifications.length,
    unread: notifications.filter(n => n.unread).length,
    byType,
    byReason,
    byRepo,
    busiestHour: `${busiestHour}:00`,
    busiestDay,
    avgResponseHours: avgResponseHours ? Math.round(avgResponseHours) : null,
    topRepos: Object.entries(byRepo).sort((a, b) => b[1] - a[1]).slice(0, 10),
    dailyAverage: Math.round(notifications.length / parsePeriodDays(period)),
  };
}

function renderStats(notifications, period, showTopRepos, showResponse) {
  const stats = computeStats(notifications, period);

  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.cyan('  📈 NotifyIQ Analytics'));
  console.log(chalk.bold.cyan(`  Period: ${period} (${parsePeriodDays(period)} days)`));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');

  // Key metrics
  console.log(chalk.bold('  📊 Key Metrics'));
  console.log(chalk.dim('  ──────────────────────────────────'));
  console.log(`  Total notifications: ${chalk.bold(stats.total)}`);
  console.log(`  Unread:              ${chalk.bold(stats.unread)}`);
  console.log(`  Daily average:       ${chalk.bold(stats.dailyAverage)}`);
  console.log(`  Busiest time:        ${chalk.bold(stats.busiestHour)} on ${chalk.bold(stats.busiestDay)}`);
  if (stats.avgResponseHours) {
    const h = Math.floor(stats.avgResponseHours);
    const m = Math.round((stats.avgResponseHours - h) * 60);
    console.log(`  Avg response time:   ${chalk.bold(`${h}h ${m}m`)}`);
  }
  console.log('');

  // By type breakdown
  console.log(chalk.bold('  📋 By Type'));
  console.log(chalk.dim('  ──────────────────────────────────'));
  const typeEntries = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of typeEntries) {
    const pct = ((count / stats.total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / stats.total * 25));
    console.log(`  ${padEnd(type, 20)} ${chalk.bold(count.toString().padStart(4))}  ${chalk.dim(`${pct}% ${bar}`)}`);
  }
  console.log('');

  // By reason breakdown
  console.log(chalk.bold('  🎯 By Reason'));
  console.log(chalk.dim('  ──────────────────────────────────'));
  const reasonEntries = Object.entries(stats.byReason).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of reasonEntries) {
    const pct = ((count / stats.total) * 100).toFixed(1);
    console.log(`  ${padEnd(reason, 20)} ${chalk.bold(count.toString().padStart(4))}  ${chalk.dim(`${pct}%`)}`);
  }
  console.log('');

  // Top repos (always show if there's data)
  if (stats.topRepos.length > 0) {
    console.log(chalk.bold('  🔊 Noisiest Repos'));
    console.log(chalk.dim('  ──────────────────────────────────'));
    for (const [repo, count] of stats.topRepos) {
      const bar = '█'.repeat(Math.min(Math.round(count / stats.topRepos[0][1] * 20), 20));
      console.log(`  ${chalk.cyan(padEnd(repo, 40))} ${chalk.yellow(count.toString().padStart(4))} ${chalk.dim(bar)}`);
    }
    console.log('');
  }

  // Hourly heatmap
  console.log(chalk.bold('  ⏰ Hourly Activity'));
  console.log(chalk.dim('  ──────────────────────────────────'));
  const byHour = new Array(24).fill(0);
  for (const n of notifications) {
    byHour[new Date(n.updated_at).getHours()]++;
  }
  const maxHour = Math.max(...byHour, 1);
  let line = '  ';
  for (let h = 0; h < 24; h++) {
    const pct = byHour[h] / maxHour;
    const char = pct === 0 ? '·' : pct < 0.25 ? '▁' : pct < 0.5 ? '▃' : pct < 0.75 ? '▅' : '█';
    line += pct > 0.5 ? chalk.bold.yellow(char) : chalk.dim(char);
  }
  line += chalk.dim('  (00:00 → 23:00)');
  console.log(line);

  // Insights
  console.log('');
  console.log(chalk.bold('  💡 Insights'));
  console.log(chalk.dim('  ──────────────────────────────────'));

  if (stats.topRepos.length > 0) {
    const [noisiest] = stats.topRepos;
    console.log(`  ${chalk.cyan('→')} ${chalk.bold(noisiest[0])} generates ${noisiest[1]} notifications (${Math.round(noisiest[1] / stats.total * 100)}% of all). Consider unwatching or filtering.`);
  }

  if (stats.avgResponseHours && stats.avgResponseHours > 48) {
    console.log(`  ${chalk.cyan('→')} Your avg response time is ${Math.round(stats.avgResponseHours)}h. Consider setting up auto-actions for low-priority items.`);
  }

  const mentionCount = stats.byReason['mention'] || stats.byReason['team_mention'] || 0;
  if (mentionCount > stats.total * 0.5) {
    console.log(`  ${chalk.cyan('→')} ${Math.round(mentionCount / stats.total * 100)}% of notifications are mentions. Consider adjusting notification settings on noisy repos.`);
  }

  console.log('');
  console.log(chalk.dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

function parsePeriod(period) {
  const now = new Date();
  const match = period.match(/^(\d+)(d|w|m)$/);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'd') return new Date(now - amount * 24 * 60 * 60 * 1000);
    if (unit === 'w') return new Date(now - amount * 7 * 24 * 60 * 60 * 1000);
    if (unit === 'm') return new Date(now - amount * 30 * 24 * 60 * 60 * 1000);
  }
  return new Date(now - 30 * 24 * 60 * 60 * 1000);
}

function parsePeriodDays(period) {
  const match = period.match(/^(\d+)(d|w|m)$/);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'd') return amount;
    if (unit === 'w') return amount * 7;
    if (unit === 'm') return amount * 30;
  }
  return 30;
}

function padEnd(str, len) {
  return str.length > len ? str.slice(0, len - 3) + '...' : str.padEnd(len);
}
