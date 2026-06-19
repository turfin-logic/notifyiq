// src/commands/inbox.js — Main inbox view with AI-powered triage

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import terminalLink from 'terminal-link';

import { fetchNotifications, extractThreadId } from '../services/github.js';
import { classifyAll } from '../classifiers/classifier.js';

const TYPE_ICONS = {
  Issue: chalk.yellow('🐛'),
  PullRequest: chalk.blue('🔀'),
  Release: chalk.green('📦'),
  Discussion: chalk.magenta('💬'),
  Commit: chalk.gray('📝'),
  VulnerabilityAlert: chalk.red('🚨'),
};

const PRIORITY_COLORS = {
  critical: chalk.red.bold,
  high: chalk.yellow,
  medium: chalk.cyan,
  low: chalk.gray,
  spam: chalk.dim,
};

const REASON_LABELS = {
  author: 'You authored',
  comment: 'New comment',
  mention: 'You were mentioned',
  review_requested: 'Review requested',
  assign: 'Assigned to you',
  subscribed: 'Subscribed',
  team_mention: 'Team mentioned',
  manual: 'Manual',
};

export default async function inboxCommand(options) {
  const {
    all = false,
    filter = null,
    repo = null,
    limit = '30',
    reason: reasonFilter = null,
    priority: sortByPriority = false,
    since = null,
  } = options;

  const spinner = ora(chalk.cyan('Fetching notifications from GitHub...')).start();

  try {
    let notifications = fetchNotifications({ all, participating: false });

    // Apply filters
    if (repo) {
      notifications = notifications.filter(n =>
        n.repository?.full_name.toLowerCase().includes(repo.toLowerCase())
      );
    }

    if (filter) {
      const filterMap = {
        issue: 'Issue',
        pr: 'PullRequest',
        pull: 'PullRequest',
        release: 'Release',
        discussion: 'Discussion',
        mention: null, // special filter by reason
        review: null,
      };
      const typeFilter = filterMap[filter.toLowerCase()];
      if (typeFilter) {
        notifications = notifications.filter(n => n.subject?.type === typeFilter);
      } else if (filter === 'mention') {
        notifications = notifications.filter(n => n.reason === 'mention' || n.reason === 'team_mention');
      } else if (filter === 'review') {
        notifications = notifications.filter(n => n.reason === 'review_requested');
      }
    }

    if (reasonFilter) {
      notifications = notifications.filter(n => n.reason === reasonFilter);
    }

    if (since) {
      const sinceDate = parseSince(since);
      notifications = notifications.filter(n => new Date(n.updated_at) > sinceDate);
    }

    // Classify all notifications
    notifications = classifyAll(notifications);

    // Apply limit
    notifications = notifications.slice(0, parseInt(limit, 10));

    spinner.stop();

    if (notifications.length === 0) {
      console.log(chalk.green('\n✅ Inbox is clean! No notifications to show.\n'));
      return;
    }

    // Print summary header
    const unread = notifications.filter(n => n.unread).length;
    const critical = notifications.filter(n => n._iq.priority === 'critical').length;
    const high = notifications.filter(n => n._iq.priority === 'high').length;

    console.log('');
    console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║') + chalk.bold.white('  🧠 NotifyIQ — Smart Inbox') + ' '.repeat(33) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╠══════════════════════════════════════════════════════════╣'));
    console.log(chalk.bold.cyan('║') + `  ${notifications.length} notifications` +
      `  |  ${chalk.bold(unread + ' unread')}` +
      (critical ? `  |  ${chalk.red.bold(critical + ' critical')}` : '') +
      (high ? `  |  ${chalk.yellow.bold(high + ' high')}` : '') +
      ' '.repeat(Math.max(0, 25 - String(notifications.length).length - String(unread).length)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════╝'));
    console.log('');

    // Print each notification
    notifications.forEach((n, idx) => {
      const iq = n._iq;
      const repo = n.repository?.full_name || '?';
      const title = n.subject?.title || '?';
      const type = n.subject?.type || '?';
      const reason = REASON_LABELS[n.reason] || n.reason;
      const age = getTimeAgo(n.updated_at);
      const threadId = extractThreadId(n);
      const url = n.subject?.url?.replace('api.github.com/repos', 'github.com').replace('/pulls/', '/pull/').replace('/issues/', '/issues/') || '';

      const priorityColor = PRIORITY_COLORS[iq.priority] || chalk.white;
      const typeIcon = TYPE_ICONS[type] || chalk.white('📌');
      const unreadDot = n.unread ? chalk.white.bold('●') : chalk.dim('○');

      console.log(chalk.dim(`  ${String(idx + 1).padStart(2, ' ')}.`) +
        ` ${unreadDot} ` +
        `${typeIcon} ` +
        chalk.bold.white(truncate(title, 55)) +
        chalk.dim(`  [${chalk.dim(age)}]`));

      console.log(chalk.dim('      ') +
        `${chalk.cyan(repo)}` +
        chalk.dim(' · ') +
        `${chalk.dim(reason)}` +
        chalk.dim(' · ') +
        `Score: ${priorityColor(String(iq.score).padStart(3))}` +
        chalk.dim(' · ') +
        `${priorityColor(iq.priority.toUpperCase())}`);

      if (url && terminalLink.isSupported) {
        console.log(chalk.dim('      ') + terminalLink(chalk.blue.underline(url), url));
      }

      if (iq.actionable) {
        console.log(chalk.dim('      ') + chalk.green('→ Action needed'));
      }

      console.log('');
    });

    // Footer with tips
    console.log(chalk.dim('────────────────────────────────────────────────────────'));
    console.log(chalk.dim('  Tips:'));
    console.log(chalk.dim('    notifyiq mark --all-read     ') + chalk.white('Clear all notifications'));
    console.log(chalk.dim('    notifyiq mark --spam <id>    ') + chalk.white('Mark spam + read'));
    console.log(chalk.dim('    notifyiq digest              ') + chalk.white('Generate smart digest'));
    console.log(chalk.dim('    notifyiq stats               ') + chalk.white('View analytics'));
    console.log(chalk.dim('────────────────────────────────────────────────────────'));
    console.log('');

  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch notifications'));
    console.error(chalk.red(err.message));

    if (err.message.includes('not authenticated') || err.message.includes('401')) {
      console.log(chalk.yellow('\n💡 Run "gh auth login" first to authenticate.'));
    }
    process.exit(1);
  }
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

function getTimeAgo(dateStr) {
  if (!dateStr) return 'unknown';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function parseSince(since) {
  const now = new Date();
  const match = since.match(/^(\d+)(h|d|w)$/);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'h') return new Date(now - amount * 60 * 60 * 1000);
    if (unit === 'd') return new Date(now - amount * 24 * 60 * 60 * 1000);
    if (unit === 'w') return new Date(now - amount * 7 * 24 * 60 * 60 * 1000);
  }
  // Try parsing as date string
  const parsed = new Date(since);
  return isNaN(parsed) ? now : parsed;
}
