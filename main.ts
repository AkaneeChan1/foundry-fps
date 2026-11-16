/**
 * Packaging entry point.
 *
 * Job: take this repository's playable build (game/), its screenshots and a
 * generated dossier, and lay them out in one flat output directory that the
 * submission platform can read. Nothing here mutates the repository itself —
 * every write lands under the destination directory.
 *
 * Run:  MAKEFUN_OUTPUT_DIR=/some/dir node main.ts
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-threejs.ts';

/** Where the platform expects the bundle when no override is given. */
const DEFAULT_OUTPUT_DIR = '/output';

/** Caps handed to the dossier builder; these mirror the bounty's gate.json. */
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
} as const;

/** The directory holding this module — i.e. the repository root. */
function repositoryRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** Destination directory: env override first, then the platform default. */
function destinationDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  return fromEnv && fromEnv.length > 0 ? resolve(fromEnv) : DEFAULT_OUTPUT_DIR;
}

/** mkdir -p, tolerant of the directory already being there. */
function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

/**
 * Recursively mirror `source` into `target`.
 *
 * Directories are created as they are met and regular files are copied byte
 * for byte; anything else (sockets, devices) is skipped because a submission
 * bundle has no use for it.
 */
function copyTree(source: string, target: string): void {
  ensureDir(target);

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);

    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

/** How many regular files live under `dir`, counting nested ones. */
function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;

  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(path);
    } else if (entry.isFile()) {
      total += 1;
    }
  }
  return total;
}

/**
 * Persist the dossier exactly as the builder produced it.
 *
 * The builder hands back raw bytes; a plain string is accepted too so the
 * writer stays honest about whatever the vendor module returns.
 */
function writeDossier(dest: string): void {
  const dossier = buildDossier(dest, DOSSIER_CAPS) as string | Uint8Array;
  const target = join(dest, 'dossier.json');

  if (typeof dossier === 'string') {
    writeFileSync(target, dossier, 'utf8');
  } else {
    writeFileSync(target, dossier);
  }
}

/** Copy game/ into the bundle. A missing game/ is a hard error, not a warning. */
function stageGame(root: string, dest: string): void {
  const source = join(root, 'game');
  if (!statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`no game/ directory at ${source}`);
  }
  copyTree(source, join(dest, 'game'));
}

/** Always create <dest>/screenshots; fill it only when the repo has some. */
function stageScreenshots(root: string, dest: string): void {
  const target = join(dest, 'screenshots');
  ensureDir(target);

  const source = join(root, 'screenshots');
  if (statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    copyTree(source, target);
  }
}

function main(): void {
  const root = repositoryRoot();
  const dest = destinationDir();

  ensureDir(dest);
  stageGame(root, dest);
  stageScreenshots(root, dest);
  writeDossier(dest);

  const shots = countFiles(join(dest, 'screenshots'));
  console.log(`wrote ${dest} (${shots} screenshot${shots === 1 ? '' : 's'})`);
}

main();
