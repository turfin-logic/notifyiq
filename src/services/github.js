// src/services/github.js — GitHub API integration layer
// Uses `gh api` under the hood for auth, pagination, and caching

import { execFileSync } from 'child_process';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

/**
 * Execute a `gh api` command and parse JSON output.
 * Automatically handles pagination for list endpoints.
 */
export function createGhApi(execute = execFileSync) {
  return function ghApi(endpoint, options = {}) {
    const { method = 'GET', paginate = false, fields = {}, headers = {} } = options;
    if (!/^[a-zA-Z][^\r\n]*$/.test(endpoint) || endpoint.includes('://')) {
      throw new Error('Expected a GitHub API endpoint path');
    }
    const args = ['api', endpoint, '--method', method];
    for (const [key, value] of Object.entries(fields)) args.push('-f', `${key}=${value}`);
    for (const [key, value] of Object.entries(headers)) args.push('-H', `${key}: ${value}`);
    if (paginate) args.push('--paginate', '--slurp');
    try {
      const output = execute('gh', args, {
        encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000, maxBuffer: 50 * 1024 * 1024,
        shell: false,
      }).trim();
      if (!output) return null;
      const parsed = JSON.parse(output);
      if (!paginate) return parsed;
      if (!Array.isArray(parsed) || !parsed.every(Array.isArray)) {
        throw new Error('Expected paginated array response');
      }
      return parsed.flat();
    } catch (err) {
      const stderr = err.stderr?.toString().trim();
      if (method === 'GET' && stderr?.includes('HTTP 404')) return null;
      throw new Error(`GitHub API request failed: ${stderr || err.message}`);
    }
  };
}

const ghApi = createGhApi();

export function notificationEndpoint({ all = false, perPage = 100, participating = false, since = null, before = null } = {}) {
  if (!Number.isInteger(Number(perPage)) || Number(perPage) < 1 || Number(perPage) > 100) {
    throw new Error('perPage must be an integer between 1 and 100');
  }
  const params = new URLSearchParams({ per_page: String(perPage), all: String(all), participating: String(participating) });
  if (since) params.set('since', since);
  if (before) params.set('before', before);
  return `notifications?${params}`;
}

/**
 * Fetch notifications with full pagination and caching.
 */
export function fetchNotifications(options = {}) {
  const {
    all = false,
    perPage = 100,
    participating = false,
    since = null,
    before = null,
  } = options;

  const cacheKey = `notifications:${all}:${perPage}:${participating}:${since}:${before}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const endpoint = notificationEndpoint({ all, perPage, participating, since, before });

  const notifications = ghApi(endpoint, { paginate: true }) || [];
  cache.set(cacheKey, notifications, 45); // cache for 45 seconds
  return notifications;
}

/**
 * Mark a specific notification as read (patch).
 */
export function markNotificationRead(threadId) {
  if (!/^\d+$/.test(String(threadId))) throw new Error('Expected a numeric notification thread ID');
  ghApi(`notifications/threads/${threadId}`, { method: 'PATCH' });
  // Invalidate cache
  cache.flushAll();
}

/**
 * Mark a notification as unread.
 */
export function markNotificationUnread() {
  throw new Error('Marking a thread unread is not supported by the GitHub REST API; use the GitHub inbox.');
}

/**
 * Mark ALL notifications as read.
 * Patch only the supplied threads; do not mark unrelated notifications read.
 */
export function markAllRead(notifications) {
  let count = 0;
  for (const n of notifications) {
    const id = extractThreadId(n);
    if (id) {
      markNotificationRead(id);
      count++;
    }
  }
  return count;
}

/**
 * Extract thread ID from notification object.
 */
export function extractThreadId(notification) {
  // Thread ID is the numeric part of the URL
  if (/^\d+$/.test(String(notification.id || ''))) return String(notification.id);
  const url = notification.url || '';
  const match = url.match(/^https:\/\/api\.github\.com\/notifications\/threads\/(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Get details about a notification's subject (issue/PR/discussion).
 */
export function getSubjectDetails(subjectUrl) {
  if (!subjectUrl) return null;
  // Convert API URL to gh api endpoint
  const match = subjectUrl.match(/api\.github\.com\/repos\/(.+)/);
  if (!match) return null;
  return ghApi(`repos/${match[1]}`);
}

/**
 * Get authenticated user info.
 */
export function getUser() {
  const cached = cache.get('user');
  if (cached) return cached;
  const user = ghApi('user');
  cache.set('user', user, 300); // cache for 5 minutes
  return user;
}

/**
 * List user's repos (with pagination).
 */
export function listRepos(options = {}) {
  const { perPage = 100, affiliation = 'owner,collaborator,organization_member' } = options;
  return ghApi(`user/repos?per_page=${perPage}&affiliation=${affiliation}&sort=updated`, {
    paginate: true,
  }) || [];
}

/**
 * Get notification count by type.
 */
export function getNotificationCounts() {
  const notifications = fetchNotifications({ all: true, perPage: 100 });
  const counts = {
    total: notifications.length,
    unread: notifications.filter(n => n.unread).length,
    byType: {},
    byReason: {},
    byRepo: {},
  };

  for (const n of notifications) {
    const type = n.subject?.type || 'Unknown';
    const reason = n.reason || 'Unknown';
    const repo = n.repository?.full_name || 'Unknown';

    counts.byType[type] = (counts.byType[type] || 0) + 1;
    counts.byReason[reason] = (counts.byReason[reason] || 0) + 1;
    counts.byRepo[repo] = (counts.byRepo[repo] || 0) + 1;
  }

  return counts;
}

export default {
  fetchNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllRead,
  extractThreadId,
  getSubjectDetails,
  getUser,
  listRepos,
  getNotificationCounts,
  ghApi,
};
