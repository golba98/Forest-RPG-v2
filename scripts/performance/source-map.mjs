import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function mappings(text) {
  const result = [];
  let source = 0,
    line = 0,
    column = 0,
    name = 0;
  for (const row of text.split(';')) {
    let generated = 0;
    const segments = [];
    for (const segment of row.split(',')) {
      if (!segment) continue;
      const values = [];
      let value = 0,
        shift = 0;
      for (const char of segment) {
        const digit = alphabet.indexOf(char);
        value += (digit & 31) * 2 ** shift;
        if (digit & 32) shift += 5;
        else {
          values.push(value & 1 ? -(value >>> 1) : value >>> 1);
          value = shift = 0;
        }
      }
      generated += values[0];
      if (values.length < 4) continue;
      source += values[1];
      line += values[2];
      column += values[3];
      if (values.length > 4) name += values[4];
      segments.push({ generated, source, line, column, name });
    }
    result.push(segments);
  }
  return result;
}
function functions(text, filename) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true),
    found = [];
  function visit(node, parents = []) {
    let label;
    if (ts.isClassDeclaration(node) && node.name) parents = [...parents, node.name.text];
    if (ts.isConstructorDeclaration(node)) label = [...parents, 'constructor'].join('.');
    else if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node)
    )
      label = [...parents, node.name?.getText(source) ?? '<anonymous>'].join('.');
    else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
      label = [...parents, '<callback>'].join('.');
    if (label) found.push({ start: node.getStart(source), end: node.end, label });
    ts.forEachChild(node, (n) => visit(n, label ? [label] : parents));
  }
  visit(source);
  return { source, found };
}
export class SourceMaps {
  constructor(build = 'artifacts/performance/profile-build') {
    this.build = build;
    this.cache = new Map();
    this.files = new Map();
  }
  async locate(frame) {
    if (!frame.url || frame.lineNumber < 0)
      return { function: frame.functionName || '<native>', url: frame.url };
    let pathname;
    try {
      pathname = new URL(frame.url).pathname;
    } catch {
      return { function: frame.functionName, url: frame.url };
    }
    if (!pathname.endsWith('.js'))
      return { function: frame.functionName, url: frame.url, line: frame.lineNumber + 1 };
    if (!this.cache.has(pathname)) {
      try {
        const map = JSON.parse(await readFile(this.build + pathname + '.map', 'utf8'));
        this.cache.set(pathname, { ...map, decoded: mappings(map.mappings) });
      } catch {
        this.cache.set(pathname, null);
      }
    }
    const map = this.cache.get(pathname);
    if (!map) return { function: frame.functionName, url: frame.url, line: frame.lineNumber + 1 };
    const row = map.decoded[frame.lineNumber] ?? [];
    let lo = 0,
      hi = row.length - 1,
      selected;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (row[mid].generated <= frame.columnNumber) {
        selected = row[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (!selected)
      return { function: frame.functionName, url: frame.url, line: frame.lineNumber + 1 };
    const filename = map.sources[selected.source],
      text = map.sourcesContent?.[selected.source];
    let label = frame.functionName;
    if (text) {
      if (!this.files.has(filename)) this.files.set(filename, functions(text, filename));
      const file = this.files.get(filename),
        position = file.source.getPositionOfLineAndCharacter(selected.line, selected.column);
      const nested = file.found
        .filter((f) => f.start <= position && position <= f.end)
        .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
      if (nested) label = nested.label;
    }
    return {
      function: label,
      source: filename.replace(/^(\.\.\/)+/, ''),
      line: selected.line + 1,
      column: selected.column,
      generated: frame.functionName,
    };
  }
}
export async function summarizeCpu(profile, build) {
  const maps = new SourceMaps(build),
    nodes = new Map(profile.nodes.map((n) => [n.id, n])),
    sums = new Map();
  let total = 0;
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const id = profile.samples[i],
      duration = (profile.timeDeltas?.[i] ?? 1000) / 1000;
    total += duration;
    sums.set(id, (sums.get(id) ?? 0) + duration);
  }
  const rows = [];
  for (const [id, ms] of sums)
    rows.push({
      ...(await maps.locate(nodes.get(id).callFrame)),
      selfMs: ms,
      percent: (ms / total) * 100,
    });
  const grouped = new Map();
  const nonIdleSampledMs = rows
    .filter((r) => r.function !== '(idle)')
    .reduce((n, r) => n + r.selfMs, 0);
  const attributedSampledMs = rows
    .filter((r) => !['(idle)', '(program)'].includes(r.function))
    .reduce((n, r) => n + r.selfMs, 0);
  for (const row of rows) {
    const key = JSON.stringify([row.source ?? row.url, row.function, row.line]);
    const old = grouped.get(key);
    if (old) {
      old.selfMs += row.selfMs;
      old.percent += row.percent;
      old.callPaths++;
    } else grouped.set(key, { ...row, callPaths: 1 });
  }
  return {
    sampledMs: total,
    nonIdleSampledMs,
    attributedSampledMs,
    unresolvedProgramSampledMs: rows
      .filter((r) => r.function === '(program)')
      .reduce((n, r) => n + r.selfMs, 0),
    note: 'Sample timeDeltas are sampled wall intervals, not OS CPU time. (program) is unresolved; excluding (idle) does not establish active CPU consumption. Compare CDP ThreadTime and trace tasks.',
    rows: [...grouped.values()]
      .map((r) => ({
        ...r,
        percentOfNonIdle:
          r.function === '(idle)' ? null : (r.selfMs / Math.max(0.001, nonIdleSampledMs)) * 100,
        percentOfAttributedSamples: ['(idle)', '(program)'].includes(r.function)
          ? null
          : (r.selfMs / Math.max(0.001, attributedSampledMs)) * 100,
      }))
      .sort((a, b) => b.selfMs - a.selfMs),
    callTreeLeaves: rows.sort((a, b) => b.selfMs - a.selfMs),
  };
}
