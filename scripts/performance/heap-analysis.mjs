import { readFile, writeFile } from 'node:fs/promises';
export async function heapStats(filename) {
  const heap = JSON.parse(await readFile(filename, 'utf8')),
    meta = heap.snapshot.meta;
  const fields = meta.node_fields,
    edgeFields = meta.edge_fields,
    n = fields.length,
    e = edgeFields.length;
  const ni = Object.fromEntries(fields.map((x, i) => [x, i])),
    ei = Object.fromEntries(edgeFields.map((x, i) => [x, i]));
  const types = meta.node_types[ni.type],
    edgeTypes = meta.edge_types[ei.type],
    counts = new Map();
  let cursor = 0,
    worlds = 0,
    sprites = 0,
    detached = 0;
  for (let offset = 0; offset < heap.nodes.length; offset += n) {
    const type = types[heap.nodes[offset + ni.type]],
      name = heap.strings[heap.nodes[offset + ni.name]],
      bytes = heap.nodes[offset + ni.self_size];
    const key = type + ':' + name,
      previous = counts.get(key) ?? { count: 0, selfBytes: 0 };
    previous.count++;
    previous.selfBytes += bytes;
    counts.set(key, previous);
    const properties = new Set();
    let sprite = false;
    for (let j = 0; j < heap.nodes[offset + ni.edge_count]; j++, cursor += e) {
      if (edgeTypes[heap.edges[cursor + ei.type]] !== 'property') continue;
      const property = heap.strings[heap.edges[cursor + ei.name_or_index]],
        target = heap.edges[cursor + ei.to_node];
      properties.add(property);
      if (property === 'renderPipeId' && heap.strings[heap.nodes[target + ni.name]] === 'sprite')
        sprite = true;
    }
    if (['meta', 'tiles', 'props', 'window'].every((key) => properties.has(key))) worlds++;
    if (sprite) sprites++;
    if (ni.detachedness !== undefined && heap.nodes[offset + ni.detachedness]) detached++;
  }
  const result = {
    nodes: heap.nodes.length / n,
    edges: heap.edges.length / e,
    worlds,
    sprites,
    detachedFlaggedNodes: detached,
    constructors: Object.fromEntries(
      [...counts].sort((a, b) => b[1].selfBytes - a[1].selfBytes).slice(0, 100),
    ),
  };
  await writeFile(filename + '.summary.json', JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1]?.endsWith('/heap-analysis.mjs'))
  for (const file of process.argv.slice(2))
    console.info(JSON.stringify({ file, ...(await heapStats(file)) }));
