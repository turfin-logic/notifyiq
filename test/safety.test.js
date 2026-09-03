import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNotification } from '../src/classifiers/classifier.js';
import { matchesRule } from '../src/commands/auto.js';
import { createGhApi, notificationEndpoint, extractThreadId, markNotificationUnread } from '../src/services/github.js';

test('security in a crypto library is never spam', () => {
  const n = { subject: { title: 'Security vulnerability in crypto library', type: 'Issue' }, updated_at: '2000-01-01' };
  const iq = classifyNotification(n);
  assert.equal(iq.priority, 'critical');
  assert.equal(iq.spam, false);
  assert.equal(matchesRule(n, iq, { filters: {}, action: 'mark-read' }), false);
});
test('old read vulnerability alerts remain critical', () => {
  assert.equal(classifyNotification({ subject: { type: 'VulnerabilityAlert', title: 'crypto patch' }, unread: false, updated_at: '2000-01-01' }).priority, 'critical');
});
test('API arguments cannot become shell commands', () => {
  const malicious = 'repos/a/b; echo unsafe';
  const api = createGhApi((exe, args, options) => {
    assert.equal(exe, 'gh'); assert.equal(args[1], malicious); assert.equal(options.shell, false);
    assert.deepEqual(args.slice(2), ['--method', 'PATCH', '-f', 'body=a"; echo unsafe']);
    return '{}';
  });
  api(malicious, { method: 'PATCH', fields: { body: 'a"; echo unsafe' } });
});
test('list pages are explicitly slurped and flattened', () => {
  const api = createGhApi((_exe, args) => {
    assert.deepEqual(args.slice(-2), ['--paginate', '--slurp']);
    return '[[{"id":1}],[{"id":2}],[]]';
  });
  assert.deepEqual(api('notifications', { paginate: true }), [{ id: 1 }, { id: 2 }]);
});
test('malformed pages and mutation errors are not silently successful', () => {
  assert.throws(() => createGhApi(() => '{}')('notifications', { paginate: true }), /Expected paginated/);
  const failure = Object.assign(new Error('failed'), { stderr: Buffer.from('HTTP 404') });
  assert.throws(() => createGhApi(() => { throw failure; })('notifications/threads/1', { method: 'PATCH' }), /404/);
});
test('all=true is sent and dates cannot inject query fields', () => {
  const url = new URL(notificationEndpoint({ all: true, since: 'x&all=false' }), 'https://api.github.com/');
  assert.equal(url.searchParams.get('all'), 'true'); assert.equal(url.searchParams.get('since'), 'x&all=false');
});
test('issue numbers cannot masquerade as notification thread IDs', () => {
  assert.equal(extractThreadId({ id: '123' }), '123');
  assert.equal(extractThreadId({ subject: { url: 'https://api.github.com/repos/a/b/issues/99' } }), null);
});
test('unsupported unread operation fails before a network request', () => {
  assert.throws(() => markNotificationUnread('123'), /not supported/);
});

test('unimplemented auto actions are not reported as executed', () => {
  assert.equal(matchesRule({ subject: { type: 'Issue' } }, { score: 70 }, { action: 'flag', filters: {} }), false);
});
