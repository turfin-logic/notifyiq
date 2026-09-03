import { test } from 'node:test';
import assert from 'node:assert/strict';
import configCommand, { redactConfig } from '../src/commands/config.js';
test('legacy API key input is rejected without storing it', async () => {
  await assert.rejects(configCommand({ aiKey: 'test-placeholder' }), /not accepted/);
});
test('unsafe nested paths cannot mutate prototypes', async () => {
  await assert.rejects(configCommand({ set: '__proto__.polluted=true' }), /unsafe configuration/);
  assert.equal({}.polluted, undefined);
});
test('generic config setter cannot store credentials', async () => {
  await assert.rejects(configCommand({ set: 'ai_key=test-placeholder' }), /Credential storage/);
});
test('generic config getter cannot print legacy credentials', async () => {
  await assert.rejects(configCommand({ get: 'ai_key' }), /not displayed/);
});

test('whitespace cannot bypass unsafe path validation', async () => {
  await assert.rejects(configCommand({ set: ' __proto__.polluted=true' }), /unsafe configuration/);
  assert.equal({}.polluted, undefined);
});

test('nested JSON cannot bypass credential storage restrictions', async () => {
  await assert.rejects(configCommand({ set: 'providers={"items":[{"api_key":"test-placeholder"}]}' }), /Credential storage/);
});

test('nested and array credentials are redacted without changing ordinary settings', () => {
  const input = { ai_key: 'test-placeholder', providers: [{ access_token: 'test-placeholder', enabled: true }], spam_keywords: ['crypto'], nullable: null };
  assert.deepEqual(redactConfig(input), { ai_key: '[redacted]', providers: [{ access_token: '[redacted]', enabled: true }], spam_keywords: ['crypto'], nullable: null });
  assert.equal(input.ai_key, 'test-placeholder');
});
