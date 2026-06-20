// test/classifier.test.js — Unit tests for the AI classifier
// Run with: npm test  (uses Node.js built-in test runner)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNotification, classifyAll } from '../src/classifiers/classifier.js';

// Helper to build a fake notification
function makeNotif(overrides = {}) {
  return {
    subject: { title: 'Test notification', type: 'Issue', url: 'https://api.github.com/repos/a/b/issues/1' },
    reason: 'mention',
    unread: true,
    updated_at: new Date().toISOString(),
    repository: { full_name: 'a/b' },
    url: 'https://api.github.com/notifications/threads/123',
    ...overrides,
  };
}

describe('Classifier — basic scoring', () => {
  test('mention should be high priority', () => {
    const r = classifyNotification(makeNotif({ reason: 'mention' }));
    assert.ok(r.score >= 70, `Expected score >= 70, got ${r.score}`);
    assert.ok(['high', 'critical'].includes(r.priority));
    assert.equal(r.actionable, true);
  });

  test('review_requested should be critical', () => {
    const r = classifyNotification(makeNotif({ reason: 'review_requested', subject: { type: 'PullRequest', title: 'Review my PR' } }));
    assert.ok(r.score >= 80, `Expected score >= 80, got ${r.score}`);
    assert.equal(r.priority, 'critical');
  });

  test('assignment should be critical', () => {
    const r = classifyNotification(makeNotif({ reason: 'assign' }));
    assert.ok(r.score >= 85);
  });
});

describe('Classifier — CI noise handling', () => {
  test('CheckSuite (CI failure) should NOT be high priority', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'Workflow run failed for feature branch', type: 'CheckSuite' },
      reason: 'ci_activity',
    }));
    assert.ok(r.score <= 50, `CI noise should score <= 50, got ${r.score}`);
    assert.notEqual(r.priority, 'high');
    assert.notEqual(r.priority, 'critical');
  });

  test('WorkflowRun (CI noise) should be low priority', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'CI build failed', type: 'WorkflowRun' },
      reason: 'ci_activity',
    }));
    assert.ok(r.score <= 50);
  });

  test('ci_activity reason with non-CI type should still be penalized', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'Something happened', type: 'Issue' },
      reason: 'ci_activity',
    }));
    assert.ok(r.score <= 50);
  });
});

describe('Classifier — spam detection', () => {
  test('crypto spam should be flagged', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'Free crypto airdrop giveaway!', type: 'Issue' },
    }));
    assert.equal(r.spam, true);
    assert.equal(r.priority, 'spam');
    assert.equal(r.score, 0);
  });

  test('job solicitation spam should be flagged', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'Hire me for developer work', type: 'Issue' },
    }));
    assert.equal(r.spam, true);
  });

  test('normal title should not be spam', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'Add new feature to login', type: 'Issue' },
    }));
    assert.equal(r.spam, false);
  });
});

describe('Classifier — keyword boosting', () => {
  test('security keyword should boost to critical', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'Security vulnerability in auth module', type: 'Issue' },
      reason: 'mention',
    }));
    assert.equal(r.priority, 'critical');
    assert.ok(r.score >= 90);
  });

  test('CVE should be critical', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'CVE-2024-1234 affects this package', type: 'Issue' },
      reason: 'subscribed',
    }));
    assert.equal(r.priority, 'critical');
  });

  test('VulnerabilityAlert type should be critical', () => {
    const r = classifyNotification(makeNotif({
      subject: { title: 'Dependency vulnerable', type: 'VulnerabilityAlert' },
      reason: 'subscribed',
    }));
    assert.ok(r.score >= 80);
  });
});

describe('Classifier — time decay', () => {
  test('old notification (>1 week) should lose score', () => {
    const old = makeNotif({
      updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      reason: 'subscribed',
      subject: { title: 'Old notification', type: 'Release' },
    });
    const recent = makeNotif({
      updated_at: new Date().toISOString(),
      reason: 'subscribed',
      subject: { title: 'Old notification', type: 'Release' },
    });
    const oldScore = classifyNotification(old).score;
    const recentScore = classifyNotification(recent).score;
    assert.ok(oldScore < recentScore, `Old (${oldScore}) should be < recent (${recentScore})`);
  });
});

describe('Classifier — bulk sorting', () => {
  test('classifyAll should sort by score descending', () => {
    const notifs = [
      makeNotif({ subject: { title: 'Low priority release', type: 'Release' }, reason: 'subscribed' }),
      makeNotif({ subject: { title: 'Security issue', type: 'Issue' }, reason: 'mention' }),
      makeNotif({ subject: { title: 'Normal comment', type: 'Issue' }, reason: 'comment' }),
    ];
    const sorted = classifyAll(notifs);
    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i]._iq.score >= sorted[i + 1]._iq.score, 'Should be sorted desc');
    }
    // Security issue should be first
    assert.ok(sorted[0].subject.title.includes('Security'));
  });
});

describe('Classifier — edge cases', () => {
  test('empty title should not crash', () => {
    const r = classifyNotification(makeNotif({ subject: { title: '', type: 'Issue' } }));
    assert.ok(typeof r.score === 'number');
  });

  test('unknown type should get default score', () => {
    const r = classifyNotification(makeNotif({ subject: { title: 'Unknown', type: 'NewType' } }));
    assert.ok(r.score >= 0 && r.score <= 100);
  });

  test('read notification should score lower than unread', () => {
    const read = classifyNotification(makeNotif({ unread: false }));
    const unread = classifyNotification(makeNotif({ unread: true }));
    assert.ok(read.score <= unread.score);
  });
});
