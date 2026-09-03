// Deterministic heuristic classifier. No LLM or external inference is used.

const PRIORITY_SCORES = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  spam: 0,
};

const REASON_WEIGHTS = {
  mention: 80,
  review_requested: 95,
  assign: 90,
  author: 60,
  comment: 55,
  team_mention: 70,
  subscribed: 20,
  manual: 40,
};

const TYPE_WEIGHTS = {
  Issue: 60,
  PullRequest: 80,
  Release: 30,
  Discussion: 40,
  Commit: 20,
  VulnerabilityAlert: 95,
  // CI noise — these flood inboxes and should score LOW by default
  CheckSuite: 15,
  CheckRun: 15,
  WorkflowRun: 15,
  StateChange: 25,
};

// Reasons that represent pure CI/automation noise
const NOISE_REASONS = new Set(['ci_activity', 'state_change']);

const SPAM_PATTERNS = [
  /\b(free\s*money|crypto|nft|airdrop|giveaway)\b/i,
  /\b(hire\s*me|job\s*opportunity|looking\s*for\s*developer)\b/i,
  /\b(subscribe|follow\s*back|click\s*here)\b/i,
  /\[bot\].*fix.*typo/i,
  /dependabot.*patch/i,
  /^.+(\s\1)+$/,  // repeated words
];

const ACTIONABLE_KEYWORDS = {
  critical: ['security', 'vulnerability', 'cve-', 'critical', 'urgent', 'breaking', 'outage', 'data leak', 'sentry'],
  high: ['blocker', 'regression', 'fail', 'broken', 'error', 'crash', 'urgent', 'asap', 'priority', 'p0', 'p1'],
  medium: ['feature', 'request', 'enhancement', 'improvement', 'question', 'help', 'how to', 'feedback'],
  low: ['docs', 'readme', 'typo', 'spelling', 'formatting', 'style', 'lint', 'cosmetic', 'minor'],
};

/**
 * Classify a single notification.
 * Returns: { priority, score, category, reason, actionable, spam, label }
 */
export function classifyNotification(notification) {
  const title = notification.subject?.title || '';
  const type = notification.subject?.type || 'Unknown';
  const reason = notification.reason || 'Unknown';
  const repo = notification.repository?.full_name || '';
  const unread = notification.unread;
  const updatedAt = notification.updated_at || '';

  // Calculate base score from reason and type
  const reasonScore = REASON_WEIGHTS[reason] || 40;
  const typeScore = TYPE_WEIGHTS[type] || 50;
  let score = (reasonScore * 0.6) + (typeScore * 0.4);

  // Security alerts are always critical regardless of reason
  if (type === 'VulnerabilityAlert') {
    score = Math.max(score, 85);
  }

  // CI/automation noise penalty — these flood inboxes with low-value alerts
  const isNoise = NOISE_REASONS.has(reason) || ['CheckSuite', 'CheckRun', 'WorkflowRun'].includes(type);
  if (isNoise) {
    // Only escalate if the CI actually FAILED (keyword boost still applies below)
    score = Math.min(score, 40);
  }

  // Boost for unread
  if (unread) score += 10;

  // Time decay — older notifications lose score
  const ageHours = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);
  if (ageHours > 168) score -= 15;      // > 1 week
  else if (ageHours > 72) score -= 8;   // > 3 days
  else if (ageHours > 24) score -= 3;   // > 1 day

  // Keyword analysis on title
  // Keyword analysis on title — SKIP for CI noise (e.g. "workflow run failed" matches "fail")
  // so CI notifications don't get artificially boosted to high priority.
  let category = 'neutral';
  if (!isNoise) {
    for (const [cat, keywords] of Object.entries(ACTIONABLE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (title.toLowerCase().includes(keyword)) {
          category = cat;
          if (cat === 'critical') score = Math.max(score, 90);
          else if (cat === 'high') score = Math.max(score, 70);
          else if (cat === 'medium') score = Math.max(score, 50);
          else score = Math.max(score, 30);
          break;
        }
      }
      if (category !== 'neutral') break;
    }
  }

  // Spam detection
  let spam = false;
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(title)) {
      spam = true;
      score = 0;
      category = 'spam';
      break;
    }
  }

  // Security evidence wins over spam keywords, age and CI penalties.
  if (type === 'VulnerabilityAlert' || /security|vulnerabilit|cve-\d|data leak/i.test(title)) {
    spam = false;
    score = Math.max(score, 90);
    category = 'security';
  }

  // Determine priority label
  let priority = 'low';
  if (spam) priority = 'spam';
  else if (score >= 80) priority = 'critical';
  else if (score >= 65) priority = 'high';
  else if (score >= 45) priority = 'medium';

  const actionable = !spam && ['critical', 'high', 'medium'].includes(priority);

  return {
    priority,
    score: Math.round(Math.min(100, Math.max(0, score))),
    category,
    reason: reasonScore > 50 ? 'Needs your attention' :
            reasonScore > 30 ? 'May need review' : 'Low priority',
    actionable,
    spam,
    label: formatLabel(priority, type, title),
  };
}

/**
 * Bulk classify notifications and sort by priority.
 */
export function classifyAll(notifications) {
  const classified = notifications.map(n => ({
    ...n,
    _iq: classifyNotification(n),
  }));

  return classified.sort((a, b) => b._iq.score - a._iq.score);
}

/**
 * Format a compact label for display.
 */
function formatLabel(priority, type, title) {
  const icons = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
    spam: '🗑️',
  };
  const typeIcons = {
    Issue: '🐛',
    PullRequest: '🔀',
    Release: '📦',
    Discussion: '💬',
    Commit: '📝',
    VulnerabilityAlert: '🚨',
  };
  const icon = icons[priority] || '⚪';
  const typeIcon = typeIcons[type] || '📌';
  const maxLen = 50;
  const truncated = title.length > maxLen ? title.slice(0, maxLen) + '...' : title;
  return `${icon} ${typeIcon} ${truncated}`;
}

/**
 * Generate a summary line for a notification.
 */
export function summarizeNotification(notification) {
  const iq = classifyNotification(notification);
  const repo = notification.repository?.full_name || '?';
  const title = notification.subject?.title || '?';
  const type = notification.subject?.type || '?';
  const age = getTimeAgo(notification.updated_at);

  return {
    repo,
    title,
    type,
    reason: notification.reason,
    priority: iq.priority,
    score: iq.score,
    actionable: iq.actionable,
    age,
    threadId: extractId(notification),
  };
}

function extractId(notification) {
  const url = notification.url || '';
  const match = url.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

function getTimeAgo(dateStr) {
  if (!dateStr) return 'unknown';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default {
  classifyNotification,
  classifyAll,
  summarizeNotification,
};
