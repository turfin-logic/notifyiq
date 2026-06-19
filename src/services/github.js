// src/services/github.js — GitHub API integration layer
// Uses `gh api` under the hood for auth, pagination, and caching

import { execSync } from 'child_process';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

/**
 * Execute a `gh api` command and parse JSON output.
 * Automatically handles pagination for list endpoints.
 */
function ghApi(endpoint, options = {}) {
  const {
    method = 'GET',
    paginate = false,
    jq = null,
    raw = false,
    fields = {},
    headers = {},
  } = options;

  let cmd = `gh api "${endpoint}"`;

  if (method !== 'GET') {
    cmd += ` -X ${method}`;
  }

  for (const [key, value] of Object.entries(fields)) {
    cmd += ` -f "${key}=${value}"`;
  }

  for (const [key, value] of Object.entries(headers)) {
    cmd += ` -H "${key}: ${value}"`;
  }

  if (paginate) {
    cmd += ' --paginate';
  }

  if (jq) {
    cmd += ` --jq '${jq}'`;
  }

  if (raw) {
    cmd += ' --input -';
  }

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });
    const result = output.trim();
    if (!result) return null;
    return JSON.parse(result);
  } catch (err) {
    const stderr = err.stderr?.toString().trim();
    if (stderr?.includes('HTTP 404')) return null;
    if (stderr?.includes('No notifications found')) return [];
    throw new Error(`GitHub API error: ${stderr || err.message}`);
  }
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

  let endpoint = 'notifications?per_page=' + perPage;
  if (!all) endpoint += '&unread=true';
  if (participating) endpoint += '&participating=true';
  if (since) endpoint += '&since=' + since;
  if (before) endpoint += '&before=' + before;

  const notifications = ghApi(endpoint, { paginate: true }) || [];
  cache.set(cacheKey, notifications, 45); // cache for 45 seconds
  return notifications;
}

/**
 * Mark a specific notification as read (patch).
 */
export function markNotificationRead(threadId) {
  ghApi(`notifications/threads/${threadId}`, { method: 'PATCH' });
  // Invalidate cache
  cache.flushAll();
}

/**
 * Mark a notification as unread.
 */
export function markNotificationUnread(threadId) {
  ghApi(`notifications/threads/${threadId}`, {
    method: 'PATCH',
    fields: { unread: 'true' },
  });
  cache.flushAll();
}

/**
 * Mark ALL notifications as read.
 * GitHub has no bulk endpoint, so we fetch all and patch each one.
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
  const url = notification.url || notification.subject?.url || '';
  const match = url.match(/\/(\d+)$/);
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
