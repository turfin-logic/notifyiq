// src/commands/search.js — Search across GitHub (issues, PRs, repos, code)

import chalk from 'chalk';
import ora from 'ora';
import github from '../services/github.js';

const { ghApi } = github;

export default async function searchCommand(query, options) {
  const {
    type = 'issues',
    repo = null,
    author = null,
    assignee = null,
    state = 'open',
    limit = '20',
    sort = 'updated',
  } = options;

  if (!query) {
    console.log(chalk.yellow('\n⚠️  Please provide a search query. Example:\n'));
    console.log(chalk.dim('  notifyiq search "memory leak" --type issues'));
    console.log(chalk.dim('  notifyiq search "TODO" --type code --repo owner/repo'));
    console.log(chalk.dim('  notifyiq search "auth" --type prs --author turfin-logic'));
    console.log('');
    return;
  }

  const spinner = ora(chalk.cyan(`Searching GitHub for "${query}"...`)).start();

  try {
    // Build the search query string
    let q = query;
    if (repo) q += ` repo:${repo}`;
    if (author) q += ` author:${author}`;
    if (assignee) q += ` assignee:${assignee}`;
    if (state) q += ` state:${state}`;

    // Map type to search endpoint
    const typeMap = {
      issues: 'issues',
      issue: 'issues',
      prs: 'issues',  // PRs are searched via issues endpoint with is:pr
      pr: 'issues',
      repos: 'repositories',
      repo: 'repositories',
      repositories: 'repositories',
      code: 'code',
      users: 'users',
    };
    const endpoint = typeMap[type.toLowerCase()] || 'issues';

    // For PR search, add is:pr qualifier
    if ((type === 'prs' || type === 'pr') && !q.includes('is:pr')) {
      q += ' is:pr';
    } else if ((type === 'issues' || type === 'issue') && !q.includes('is:issue') && !q.includes('is:pr')) {
      q += ' is:issue';
    }

    const encodedQ = encodeURIComponent(q);
    const data = ghApi(
      `search/${endpoint}?q=${encodedQ}&sort=${sort}&order=desc&per_page=${limit}`
    );

    spinner.stop();

    if (!data || data.total_count === 0) {
      console.log(chalk.yellow(`\n🔍 No results found for "${query}"\n`));
      return;
    }

    const items = data.items || [];
    console.log('');
    console.log(chalk.bold.cyan(`╔══════════════════════════════════════════════════════════╗`));
    console.log(chalk.bold.cyan('║') + chalk.bold.white(`  🔍 Search Results — "${query}"`) + ' '.repeat(Math.max(0, 29 - query.length)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + `  ${chalk.bold(data.total_count)} total matches  |  Showing top ${items.length}` + ' '.repeat(Math.max(0, 20 - String(data.total_count).length - String(items.length).length)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════╝'));
    console.log('');

    // Render based on type
    if (endpoint === 'repositories') {
      renderRepos(items);
    } else if (endpoint === 'code') {
      renderCode(items);
    } else {
      renderIssues(items);
    }

    console.log(chalk.dim('────────────────────────────────────────────────────────'));
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Search failed'));
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

function renderIssues(items) {
  items.forEach((item, idx) => {
    const isPR = !!item.pull_request;
    const icon = isPR ? chalk.blue('🔀') : chalk.yellow('🐛');
    const stateIcon = item.state === 'open' ? chalk.green('○') : chalk.red('●');
    const repo = item.repository_url?.replace('https://api.github.com/repos/', '') || '';

    console.log(`  ${String(idx + 1).padStart(2)}. ${stateIcon} ${icon} ${chalk.bold(truncate(item.title, 55))}`);
    console.log(chalk.dim(`      ${repo} · #${item.number} · ${item.state} · ${item.comments} comments`));
    if (item.html_url) {
      console.log(chalk.dim(`      ${item.html_url}`));
    }
    console.log('');
  });
}

function renderRepos(items) {
  items.forEach((item, idx) => {
    console.log(`  ${String(idx + 1).padStart(2)}. ${chalk.bold(item.full_name)} ${chalk.yellow('⭐ ' + item.stargazers_count)}`);
    if (item.description) {
      console.log(chalk.dim(`      ${truncate(item.description, 70)}`));
    }
    console.log(chalk.dim(`      ${item.language || 'N/A'} · ${item.html_url}`));
    console.log('');
  });
}

function renderCode(items) {
  items.slice(0, 15).forEach((item, idx) => {
    const repo = item.repository?.full_name || '';
    const path = item.path || '';
    console.log(`  ${String(idx + 1).padStart(2)}. ${chalk.bold(path)} ${chalk.dim(`in ${repo}`)}`);
    console.log(chalk.dim(`      ${item.html_url}`));
    console.log('');
  });
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
