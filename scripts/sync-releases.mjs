#!/usr/bin/env node
/**
 * Syncs root `releases.json` (single source of truth) into:
 *   1. Root `CHANGELOG.md` (human-readable GitHub changelog)
 *   2. `apps/web/src/app/core/config/release-notes.generated.ts` (typed Angular bundle)
 *
 * Run with `--check` in CI to verify generated files and monorepo versions are in sync.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASES_PATH = path.join(ROOT, 'releases.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const WEB_GENERATED_PATH = path.join(
  ROOT,
  'apps/web/src/app/core/config/release-notes.generated.ts',
);

const checkMode = process.argv.includes('--check');

function loadReleases() {
  const raw = fs.readFileSync(RELEASES_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('releases.json must be a non-empty array.');
  }
  for (const entry of parsed) {
    if (!entry.version || !entry.date || !entry.title?.['zh-TW'] || !entry.title?.en) {
      throw new Error(`Invalid release entry: ${JSON.stringify(entry)}`);
    }
    if (!Array.isArray(entry.changes?.['zh-TW']) || !Array.isArray(entry.changes?.en)) {
      throw new Error(`Missing bilingual changes for version ${entry.version}`);
    }
  }
  return parsed;
}

function renderChangelog(releases) {
  const lines = [
    '# Changelog',
    '',
    '<!-- Auto-generated from releases.json. Run `node scripts/sync-releases.mjs` after editing releases.json. -->',
    '',
  ];

  for (const r of releases) {
    lines.push(`## v${r.version} (${r.date}) — ${r.title['zh-TW']}`);
    lines.push(`*${r.title.en}*`);
    lines.push('');
    for (const item of r.changes['zh-TW']) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderWebTs(releases) {
  const jsonPayload = JSON.stringify(releases, null, 2);
  return [
    '// Auto-generated from root releases.json via `node scripts/sync-releases.mjs`.',
    '// Do not edit manually.',
    '',
    'export interface LocalizedText {',
    "  readonly 'zh-TW': string;",
    '  readonly en: string;',
    '}',
    '',
    'export interface LocalizedChanges {',
    "  readonly 'zh-TW': readonly string[];",
    '  readonly en: readonly string[];',
    '}',
    '',
    'export interface ReleaseNoteEntry {',
    '  readonly version: string;',
    '  readonly date: string;',
    '  readonly title: LocalizedText;',
    '  readonly changes: LocalizedChanges;',
    '}',
    '',
    `export const RELEASE_NOTES: readonly ReleaseNoteEntry[] = ${jsonPayload};`,
    '',
  ].join('\n');
}

function readNormalized(filePath) {
  return fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
    : null;
}

function writeOrCheck(filePath, expected) {
  const actual = readNormalized(filePath);
  if (checkMode) {
    if (actual !== expected) {
      console.error(`Out of sync: ${path.relative(ROOT, filePath)}`);
      return false;
    }
    return true;
  }
  if (actual !== expected) {
    fs.writeFileSync(filePath, expected, 'utf8');
    console.log(`Updated ${path.relative(ROOT, filePath)}`);
  }
  return true;
}

function checkVersionConsistency(latestVersion) {
  const baseSemver = latestVersion.split('-')[0];
  const checks = [
    {
      file: 'apps/web/src/app/core/config/app-version.ts',
      pattern: new RegExp(`APP_VERSION\\s*=\\s*'${latestVersion.replace(/\./g, '\\.')}'`),
      expected: latestVersion,
    },
    {
      file: 'apps/web/package.json',
      pattern: new RegExp(`"version":\\s*"${latestVersion.replace(/\./g, '\\.')}"`),
      expected: latestVersion,
    },
    {
      file: 'apps/api/app/core/config.py',
      pattern: new RegExp(`app_version:\\s*str\\s*=\\s*"${latestVersion.replace(/\./g, '\\.')}"`),
      expected: latestVersion,
    },
    {
      file: 'apps/api/pyproject.toml',
      pattern: new RegExp(`^version\\s*=\\s*"${baseSemver.replace(/\./g, '\\.')}"`, 'm'),
      expected: baseSemver,
    },
  ];

  let ok = true;
  for (const check of checks) {
    const content = readNormalized(path.join(ROOT, check.file));
    if (!content || !check.pattern.test(content)) {
      console.error(`Version mismatch in ${check.file}: expected ${check.expected}`);
      ok = false;
    }
  }
  return ok;
}

const releases = loadReleases();
const changelogOk = writeOrCheck(CHANGELOG_PATH, renderChangelog(releases));
const webTsOk = writeOrCheck(WEB_GENERATED_PATH, renderWebTs(releases));

if (checkMode) {
  const versionsOk = checkVersionConsistency(releases[0].version);
  if (!changelogOk || !webTsOk || !versionsOk) {
    console.error('Release notes or version strings are out of sync. Run: node scripts/sync-releases.mjs');
    process.exit(1);
  }
  console.log(`Release notes & versions verified (${releases[0].version}).`);
}
