import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const protectedPaths = ['src', 'public', 'docs/assets/source', 'tests/fixtures'];

// Resolve existing ancestors so an output symlink cannot redirect into approved art.
function physicalPath(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink())
      return physicalPath(path.resolve(path.dirname(target), fs.readlinkSync(target)));
    return fs.realpathSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const parent = path.dirname(target);
  if (parent === target) return target;
  return path.join(physicalPath(parent), path.basename(target));
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function rejectNestedLinks(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Staging output contains a symlink: ${child}`);
    if (entry.isDirectory()) rejectNestedLinks(child);
  }
}

/** Historical generators stage output; promotion into source/runtime assets is a separate reviewed step. */
export function stagingDirectory(requested, fallback, repoRoot = repository) {
  const output = physicalPath(path.resolve(repoRoot, requested ?? fallback));
  for (const relative of protectedPaths) {
    const protectedPath = physicalPath(path.join(repoRoot, relative));
    if (contains(output, protectedPath) || contains(protectedPath, output)) {
      throw new Error(`Output overlaps protected repository files: ${output}`);
    }
  }
  rejectNestedLinks(output);
  return output;
}
