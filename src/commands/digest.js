// src/commands/digest.js — Smart digest generation (daily/weekly/monthly)

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';

import { fetchNotifications } from '../services/github.js';
import { classifyAll } from '../classifiers/classifier.js';

const PERIOD_LABELS = {
  daily: '24 hours',
  weekly: '7 days',
  monthly: '30 days',
};

export default async function digestCommand(options) {
  const {
    period = 'daily',
    output = 'terminal',
    save = false,
  } = options;

  const spinner = ora(chalk.cyan(`Generating ${period} digest...`)).start();

  try {
    const since = getPeriodDate(period);
    let notifications = fetchNotifications({ all: true });

    // Filter to period
    notifications = notifications.filter(n => new Date(n.updated_at) > since);
    notifications = classifyAll(notifications);

    // Group notifications
    const groups = {
      critical: notifications.filter(n => n._iq.priority === 'critical'),
      high: notifications.filter(n => n._iq.priority === 'high'),
      medium: notifications.filter(n => n._iq.priority === 'medium'),
      low: notifications.filter(n => n._iq.priority === 'low'),
      spam: notifications.filter(n => n._iq.priority === 'spam'),
    };

    // Stats
    const repoStats = {};
    const typeStats = {};
    for (const n of notifications) {
      const repo = n.repository?.full_name || 'Other';
      const type = n.subject?.type || 'Other';
      repoStats[repo] = (repoStats[repo] || 0) + 1;
      typeStats[type] = (typeStats[type] || 0) + 1;
    }

    spinner.stop();

    const digest = buildDigest(period, groups, repoStats, typeStats, notifications);

    if (output === 'json') {
      console.log(JSON.stringify(digest, null, 2));
      return;
    }

    if (output === 'markdown') {
      const md = renderMarkdown(period, groups, repoStats, typeStats, notifications);
      if (save) {
        const filename = `notifyiq-digest-${period}-${new Date().toISOString().slice(0, 10)}.md`;
        fs.writeFileSync(filename, md);
        console.log(chalk.green(`\n📄 Digest saved to ${filename}\n`));
      } else {
        console.log(md);
      }
      return;
    }

    // Terminal output
    renderTerminal(period, groups, repoStats, typeStats, notifications);

    if (save) {
      const md = renderMarkdown(period, groups, repoStats, typeStats, notifications);
      const filename = `notifyiq-digest-${period}-${new Date().toISOString().slice(0, 10)}.md`;
      fs.writeFileSync(filename, md);
      console.log(chalk.green(`📄 Also saved to ${filename}`));
    }

  } catch (err) {
    spinner.fail(chalk.red('Failed to generate digest'));
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

function buildDigest(period, groups, repoStats, typeStats, notifications) {
  return {
    period,
    generated_at: new Date().toISOString(),
    summary: {
      total: notifications.length,
      unread: notifications.filter(n => n.unread).length,
      critical: groups.critical.length,
      high: groups.high.length,
      medium: groups.medium.length,
      low: groups.low.length,
      spam: groups.spam.length,
    },
    top_repos: Object.entries(repoStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([repo, count]) => ({ repo, count })),
    by_type: typeStats,
    actionable: [
      ...groups.critical.map(n => formatItem(n)),
      ...groups.high.map(n => formatItem(n)),
    ],
  };
}

function formatItem(n) {
  return {
    title: n.subject?.title,
    repo: n.repository?.full_name,
    type: n.subject?.type,
    reason: n.reason,
    score: n._iq.score,
    url: n.subject?.html_url || n.subject?.url,
  };
}

function renderTerminal(period, groups, repoStats, typeStats, notifications) {
  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.cyan('  📬 NotifyIQ Digest') + chalk.white(` — ${PERIOD_LABELS[period]}`));
  console.log(chalk.bold.cyan(`  ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  // Summary box
  console.log('');
  console.log(chalk.bold('  📊 Summary'));
  console.log(chalk.dim('  ──────────────────────────────────'));
  console.log(`  Total:     ${chalk.bold(String(notifications.length).padStart(4))} notifications`);
  console.log(`  Unread:    ${chalk.bold(String(notifications.filter(n => n.unread).length).padStart(4))} unread`);
  console.log(`  Critical:  ${chalk.red.bold(String(groups.critical.length).padStart(4))} need immediate action`);
  console.log(`  High:      ${chalk.yellow.bold(String(groups.high.length).padStart(4))} need attention`);
  console.log(`  Medium:    ${chalk.cyan(String(groups.medium.length).padStart(4))} review when possible`);
  console.log(`  Low/Spam:  ${chalk.dim(String(groups.low.length + groups.spam.length).padStart(4))} can ignore`);
  console.log('');

  // Top noisy repos
  if (Object.keys(repoStats).length > 0) {
    console.log(chalk.bold('  🔊 Noisiest Repos'));
    console.log(chalk.dim('  ──────────────────────────────────'));
    const sorted = Object.entries(repoStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [repo, count] of sorted) {
      const bar = '█'.repeat(Math.min(count * 2, 30));
      console.log(`  ${chalk.cyan(padEnd(repo, 35))} ${chalk.yellow(count.toString().padStart(3))} ${chalk.dim(bar)}`);
    }
    console.log('');
  }

  // Critical items
  if (groups.critical.length > 0) {
    console.log(chalk.red.bold('  🚨 Critical — Immediate Action Required'));
    console.log(chalk.dim('  ──────────────────────────────────'));
    for (const n of groups.critical) {
      console.log(`  ${chalk.red('●')} ${chalk.bold(n.subject?.title)} — ${chalk.dim(n.repository?.full_name)}`);
    }
    console.log('');
  }

  // High priority items
  if (groups.high.length > 0) {
    console.log(chalk.yellow.bold('  ⚡ High Priority — Needs Attention'));
    console.log(chalk.dim('  ──────────────────────────────────'));
    for (const n of groups.high) {
      console.log(`  ${chalk.yellow('●')} ${chalk.bold(n.subject?.title)} — ${chalk.dim(n.repository?.full_name)} [${n.reason}]`);
    }
    console.log('');
  }

  // Medium
  if (groups.medium.length > 0) {
    console.log(chalk.cyan('  📋 Medium — Review When Possible'));
    console.log(chalk.dim('  ──────────────────────────────────'));
    for (const n of groups.medium.slice(0, 10)) {
      console.log(`  ${chalk.cyan('○')} ${n.subject?.title} — ${chalk.dim(n.repository?.full_name)}`);
    }
    console.log('');
  }

  console.log(chalk.dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

function renderMarkdown(period, groups, repoStats, typeStats, notifications) {
  let md = `# 📬 NotifyIQ Digest — ${PERIOD_LABELS[period]}\n\n`;
  md += `> Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;

  md += `## 📊 Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total | ${notifications.length} |\n`;
  md += `| Unread | ${notifications.filter(n => n.unread).length} |\n`;
  md += `| 🔴 Critical | ${groups.critical.length} |\n`;
  md += `| 🟠 High | ${groups.high.length} |\n`;
  md += `| 🟡 Medium | ${groups.medium.length} |\n`;
  md += `| 🟢 Low | ${groups.low.length} |\n`;
  md += `| 🗑️ Spam | ${groups.spam.length} |\n\n`;

  if (groups.critical.length > 0) {
    md += `## 🚨 Critical\n\n`;
    for (const n of groups.critical) {
      md += `- **${n.subject?.title}** — \`${n.repository?.full_name}\` [link](${n.subject?.url})\n`;
    }
    md += '\n';
  }

  if (groups.high.length > 0) {
    md += `## ⚡ High Priority\n\n`;
    for (const n of groups.high) {
      md += `- **${n.subject?.title}** — \`${n.repository?.full_name}\` (${n.reason})\n`;
    }
    md += '\n';
  }

  const sortedRepos = Object.entries(repoStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sortedRepos.length > 0) {
    md += `## 🔊 Noisiest Repos\n\n`;
    for (const [repo, count] of sortedRepos) {
      md += `- \`${repo}\` — ${count} notifications\n`;
    }
    md += '\n';
  }

  md += `---\n*Generated by [NotifyIQ](https://github.com/turfin-logic/notifyiq)*\n`;
  return md;
}

function getPeriodDate(period) {
  const now = new Date();
  const amounts = { daily: 1, weekly: 7, monthly: 30 };
  const days = amounts[period] || 1;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

function padEnd(str, len) {
  return str.length > len ? str.slice(0, len - 3) + '...' : str.padEnd(len);
}
