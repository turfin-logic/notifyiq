// src/commands/config.js — Manage NotifyIQ configuration

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.notifyiq', 'config.json');

const isCredentialKey = key => /(?:key|token|password|secret)s?$/i.test(key);
const isUnsafeKey = key => isCredentialKey(key) || ['__proto__', 'prototype', 'constructor'].includes(key);
function containsUnsafeKeys(value) {
  return value !== null && typeof value === 'object' && Object.entries(value).some(([key, child]) => isUnsafeKey(key) || containsUnsafeKeys(child));
}
export function redactConfig(value) {
  if (Array.isArray(value)) return value.map(redactConfig);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, isCredentialKey(key) ? '[redacted]' : redactConfig(child)]));
}

const DEFAULTS = {
  ai_provider: 'rule-based', // rule-based | openai | anthropic | ollama
  ai_key: '',
  ollama_url: 'http://localhost:11434',
  ollama_model: 'llama3',
  openai_model: 'gpt-4o-mini',
  anthropic_model: 'claude-3-haiku-20240307',
  digest_default_period: 'daily',
  inbox_default_limit: 30,
  auto_rules: {
    spam: true,
    'ci-green': false,
    mention: false,
    release: false,
  },
  spam_keywords: ['hire me', 'job opportunity', 'free money', 'nft', 'crypto', 'airdrop', 'giveaway'],
  muted_repos: [],
  priority_thresholds: {
    critical: 80,
    high: 65,
    medium: 45,
  },
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export default async function configCommand(options) {
  const {
    set: setOption = null,
    get: getKey = null,
    reset = false,
    show = false,
    aiProvider = null,
    aiKey = null,
  } = options;

  if (reset) {
    saveConfig(DEFAULTS);
    console.log(chalk.green('\n✅ Config reset to defaults.\n'));
    return;
  }

  // Set a single key=value
  if (setOption) {
    const [rawKey, ...valueParts] = setOption.split('=');
    const key = rawKey.trim();
    const value = valueParts.join('=');
    const parsedValue = parseValue(value.trim());
    if (key.split('.').some(isUnsafeKey) || containsUnsafeKeys(parsedValue)) {
      throw new Error('Credential storage and unsafe configuration paths are not supported.');
    }
    if (key.trim() === 'ai_provider' && value.trim() !== 'rule-based') throw new Error('Only rule-based classification is implemented.');
    if (!key || valueParts.length === 0) {
      console.log(chalk.yellow('\n⚠️  Use --set key=value format. Example: notifyiq config --set ai_provider=rule-based\n'));
      return;
    }
    const config = loadConfig();
    setNestedValue(config, key, parsedValue);
    saveConfig(config);
    console.log(chalk.green(`\n✅ Set ${key.trim()} = ${value.trim()}\n`));
    return;
  }

  // Set AI provider
  if (aiProvider) {
    const valid = ['rule-based'];
    if (!valid.includes(aiProvider)) {
      console.log(chalk.yellow(`\n⚠️  Invalid provider. Choose from: ${valid.join(', ')}\n`));
      return;
    }
    const config = loadConfig();
    config.ai_provider = aiProvider;
    saveConfig(config);
    console.log(chalk.green(`\n✅ AI provider set to ${aiProvider}\n`));
    return;
  }

  // Set AI key
  if (aiKey) {
    throw new Error('No LLM integration is implemented; API keys are not accepted.');
  }

  // Get a key
  if (getKey) {
    if (getKey.split('.').some(isCredentialKey)) throw new Error('Credential values are not displayed.');
    const config = loadConfig();
    const value = redactConfig(getNestedValue(config, getKey));
    if (value === undefined) {
      console.log(chalk.yellow(`\n⚠️  Config key "${getKey}" not found.\n`));
      return;
    }
    console.log(chalk.cyan(`${getKey} = ${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}`));
    return;
  }

  // Show all config
  if (show || (!setOption && !getKey && !aiProvider && !aiKey && !reset)) {
    const config = loadConfig();
    console.log('');
    console.log(chalk.bold.cyan('╔══════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║') + chalk.bold.white('  ⚙️  NotifyIQ Configuration') + ' '.repeat(21) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝'));
    console.log('');

    // Mask sensitive values
    const display = redactConfig(config);

    for (const [key, value] of Object.entries(display)) {
      if (value !== null && typeof value === 'object') {
        console.log(chalk.bold(`  ${key}:`));
        for (const [k, v] of Object.entries(value)) {
          const enabled = v ? chalk.green('✓ enabled') : chalk.red('✗ disabled');
          if (typeof v === 'boolean') {
            console.log(chalk.dim(`    ${k}: ${enabled}`));
          } else {
            console.log(chalk.dim(`    ${k}: ${v}`));
          }
        }
      } else {
        console.log(chalk.cyan(`  ${key}: `) + chalk.white(String(value)));
      }
    }

    console.log('');
    console.log(chalk.dim('  Config file: ' + CONFIG_FILE));
    console.log('');
    return;
  }
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function getNestedValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(Number(value)) && value !== '') return Number(value);
  try { return JSON.parse(value); } catch { /* not JSON */ }
  return value;
}
