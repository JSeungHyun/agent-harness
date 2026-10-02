#!/usr/bin/env node
// 설치 — 정책 한 곳(.harness/policy/settings.json)을 대상 .claude/settings.json 에 병합한다. 설계안.
// ⛔ 덮어쓰지 않는다: 권한은 합집합, env·플러그인·마켓은 정책의 키만 정하고 나머지는 보존한다.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/config.mjs';

export const POLICY = fileURLToPath(new URL('../policy/settings.json', import.meta.url));
const MAPS = ['env', 'enabledPlugins', 'extraKnownMarketplaces'];
const PERMS = ['allow', 'deny', 'ask'];

export function mergeSettings(settings, policy) {
  const out = { ...settings };
  if (policy.permissions) {
    out.permissions = { ...settings.permissions };
    for (const k of PERMS) {
      if (policy.permissions[k]) out.permissions[k] = [...new Set([...(settings.permissions?.[k] ?? []), ...policy.permissions[k]])];
    }
  }
  for (const k of MAPS) if (policy[k]) out[k] = { ...settings[k], ...policy[k] };
  return out;
}

export const settingsPath = (root) => join(root, '.claude', 'settings.json');

export function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`JSON 을 읽지 못했다: ${path}\n  ${e.message}`);
  }
}

cli(import.meta.url, () => {
  const path = settingsPath(process.argv[2] ?? process.cwd());
  const merged = mergeSettings(readJson(path), readJson(POLICY));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`반영: ${path}\n⛔ git diff 로 의도한 것만 바뀌었는지 직접 확인한다`);
});
