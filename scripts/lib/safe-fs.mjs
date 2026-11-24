// File writes that cannot be redirected: every write goes to a temp file next to the
// target and is renamed into place; symlinks at the target or on the way to it are refused.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Refuse if `target` or any existing directory between `root` and it is a symlink.
export function assertNoSymlinks(target, root) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(target);
  const rel = path.relative(absRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`refusing to write outside ${absRoot}: ${abs}`);
  const rootStat = lstatOrNull(absRoot);
  if (rootStat?.isSymbolicLink()) throw new Error(`refusing to write: root is a symlink: ${absRoot}`);
  let cur = absRoot;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    cur = path.join(cur, part);
    const st = lstatOrNull(cur);
    if (st?.isSymbolicLink()) throw new Error(`refusing to follow a symlink: ${cur}`);
  }
}

export function ensureDir(dir, root) {
  assertNoSymlinks(dir, root);
  fs.mkdirSync(dir, { recursive: true });
  assertNoSymlinks(dir, root);
}

export function writeFileAtomic(target, data, root) {
  const abs = path.resolve(target);
  ensureDir(path.dirname(abs), root);
  assertNoSymlinks(abs, root);
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd;
  try {
    // 'wx' fails if anything (including a planted symlink) already exists at the temp name.
    fd = fs.openSync(tmp, 'wx', 0o644);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    assertNoSymlinks(abs, root);
    fs.renameSync(tmp, abs);
  } catch (err) {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function writeJsonAtomic(target, value, root) {
  writeFileAtomic(target, `${JSON.stringify(value, null, 2)}\n`, root);
}

export function readJsonIfExists(file) {
  const st = lstatOrNull(file);
  if (!st) return null;
  if (st.isSymbolicLink()) throw new Error(`refusing to read a symlink: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Copy a regular file (never a symlink) into root.
export function copyFileSafe(src, dest, root) {
  const st = fs.lstatSync(src);
  if (!st.isFile()) throw new Error(`not a regular file: ${src}`);
  writeFileAtomic(dest, fs.readFileSync(src), root);
}

// Remove a directory tree that must lie inside root.
export function removeTreeInside(dir, root) {
  const rel = path.relative(path.resolve(root), path.resolve(dir));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`refusing to remove ${dir}: not inside ${root}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
