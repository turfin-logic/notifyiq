// src/commands/watch.js — Manage repo subscriptions (mute noisy repos)

import chalk from 'chalk';
import ora from 'ora';
import github from '../services/github.js';

const { ghApi } = github;

export default async function watchCommand(options) {
  const {
    list = false,
    mute: muteRepo = null,
    unmute: unmuteRepo = null,
    ignore: ignoreRepo = null,
    state: stateRepo = null,
  } = options;

  // List all subscriptions
  if (list) {
    const spinner = ora(chalk.cyan('Fetching your repo subscriptions...')).start();
    try {
      const subs = ghApi('user/subscriptions?per_page=100', { paginate: true }) || [];
      spinner.succeed(chalk.green(`Found ${subs.length} watched repos\n`));

      console.log(chalk.bold.cyan('📺 Your Watched Repositories\n'));
      subs.slice(0, 50).forEach((repo, i) => {
        const name = repo.full_name;
        const desc = repo.description ? truncate(repo.description, 50) : '';
        console.log(`  ${String(i + 1).padStart(2)}. ${chalk.bold(name)}`);
        if (desc) console.log(chalk.dim(`      ${desc}`));
      });

      if (subs.length > 50) {
        console.log(chalk.dim(`\n  ... and ${subs.length - 50} more`));
      }
      console.log('');
      console.log(chalk.dim('  Tip: notifyiq watch --mute <owner/repo> to silence a noisy repo'));
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Failed to fetch subscriptions'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    return;
  }

  // Mute (unsubscribe) a repo
  if (muteRepo) {
    const spinner = ora(chalk.cyan(`Muting ${muteRepo}...`)).start();
    try {
      ghApi(`repos/${muteRepo}/subscription`, {
        method: 'DELETE',
      });
      spinner.succeed(chalk.green(`🔇 Muted ${muteRepo} — you won't get notifications from it anymore`));
      console.log(chalk.dim('  (You can re-watch anytime with: notifyiq watch --unmute ' + muteRepo + ')'));
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Failed to mute repo'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    return;
  }

  // Unmute (re-subscribe) a repo
  if (unmuteRepo) {
    const spinner = ora(chalk.cyan(`Re-watching ${unmuteRepo}...`)).start();
    try {
      ghApi(`repos/${unmuteRepo}/subscription`, {
        method: 'PUT',
        fields: { subscribed: 'true', ignored: 'false' },
      });
      spinner.succeed(chalk.green(`📺 Re-watching ${unmuteRepo}`));
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Failed to re-watch repo'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    return;
  }

  // Ignore (mark as "ignore" — keeps subscription but blocks @mentions)
  if (ignoreRepo) {
    const spinner = ora(chalk.cyan(`Ignoring ${ignoreRepo}...`)).start();
    try {
      ghApi(`repos/${ignoreRepo}/subscription`, {
        method: 'PUT',
        fields: { subscribed: 'false', ignored: 'true' },
      });
      spinner.succeed(chalk.green(`🚫 Ignoring ${ignoreRepo} — even @mentions won't notify you`));
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Failed to ignore repo'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    return;
  }

  // Check subscription state
  if (stateRepo) {
    const spinner = ora(chalk.cyan(`Checking ${stateRepo}...`)).start();
    try {
      const sub = ghApi(`repos/${stateRepo}/subscription`);
      spinner.stop();
      if (sub === null) {
        console.log(chalk.yellow(`\n📋 You are NOT watching ${stateRepo}\n`));
      } else {
        const state = sub.ignored ? chalk.red('IGNORED') : chalk.green('WATCHING');
        console.log(`\n📋 ${chalk.bold(stateRepo)}: ${state}\n`);
        console.log(chalk.dim(`  Reason: ${sub.reason || 'manual'}`));
        console.log(chalk.dim(`  URL: ${sub.url}`));
        console.log('');
      }
    } catch (err) {
      spinner.fail(chalk.red('Failed to check subscription'));
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    return;
  }

  // No options — show help
  console.log(chalk.yellow('\n⚠️  Provide an action. Examples:\n'));
  console.log(chalk.dim('  notifyiq watch --list              List watched repos'));
  console.log(chalk.dim('  notifyiq watch --mute <owner/repo>    Unsubscribe (silence notifications)'));
  console.log(chalk.dim('  notifyiq watch --unmute <owner/repo>  Re-watch a repo'));
  console.log(chalk.dim('  notifyiq watch --ignore <owner/repo>  Ignore (blocks even @mentions)'));
  console.log(chalk.dim('  notifyiq watch --state <owner/repo>   Check subscription state'));
  console.log('');
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
