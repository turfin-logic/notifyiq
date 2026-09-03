// src/commands/mark.js — Mark notifications read/unread/spam

import chalk from 'chalk';
import ora from 'ora';

import { fetchNotifications, markNotificationRead, markNotificationUnread, markAllRead } from '../services/github.js';
import { classifyNotification } from '../classifiers/classifier.js';

export default async function markCommand(options) {
  const {
    read: readId = null,
    unread: unreadId = null,
    allRead = false,
    spam: spamId = null,
    done: doneId = null,
  } = options;

  // Mark the fetched unread threads as read.
  if (allRead) {
    const spinner = ora(chalk.cyan('Marking all notifications as read...')).start();
    try {
      const notifications = fetchNotifications({ all: false });
      const count = markAllRead(notifications);
      spinner.succeed(chalk.green(`✅ Marked ${count} notifications as read!`));
      console.log('');
      return;
    } catch (err) {
      spinner.fail(chalk.red('Failed to mark all as read'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  // Mark specific notification as read
  if (readId) {
    const spinner = ora(chalk.cyan(`Marking notification ${readId} as read...`)).start();
    try {
      markNotificationRead(readId);
      spinner.succeed(chalk.green(`✅ Notification ${readId} marked as read`));
      console.log('');
      return;
    } catch (err) {
      spinner.fail(chalk.red('Failed to mark as read'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  // Mark specific notification as unread
  if (unreadId) {
    const spinner = ora(chalk.cyan(`Marking notification ${unreadId} as unread...`)).start();
    try {
      markNotificationUnread(unreadId);
      spinner.succeed(chalk.green(`✅ Notification ${unreadId} marked as unread`));
      console.log('');
      return;
    } catch (err) {
      spinner.fail(chalk.red('Failed to mark as unread'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  // Mark as spam and read
  if (spamId) {
    const spinner = ora(chalk.cyan(`Marking notification ${spamId} as spam...`)).start();
    try {
      markNotificationRead(spamId);
      spinner.succeed(chalk.green(`🗑️ Notification ${spamId} marked as spam & read`));
      console.log('');
      return;
    } catch (err) {
      spinner.fail(chalk.red('Failed to mark as spam'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  // Mark as done and read
  if (doneId) {
    const spinner = ora(chalk.cyan(`Marking notification ${doneId} as done...`)).start();
    try {
      markNotificationRead(doneId);
      spinner.succeed(chalk.green(`✅ Notification ${doneId} marked as done & read`));
      console.log('');
      return;
    } catch (err) {
      spinner.fail(chalk.red('Failed to mark as done'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  // No options — show help
  console.log(chalk.yellow('\n⚠️  Provide an action. Examples:\n'));
  console.log(chalk.dim('  notifyiq mark --all-read       Mark all as read'));
  console.log(chalk.dim('  notifyiq mark --read <id>       Mark specific as read'));
  console.log(chalk.dim('  notifyiq mark --spam <id>       Mark as spam + read'));
  console.log(chalk.dim('  notifyiq mark --done <id>        Mark as done + read'));
  console.log('');
}
