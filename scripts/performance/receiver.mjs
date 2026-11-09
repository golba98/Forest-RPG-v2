import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { finished } from 'node:stream/promises';
function decodeBatch(buffer) {
  const headerLength = buffer.readUInt32LE(0),
    header = JSON.parse(buffer.toString('utf8', 4, 4 + headerLength));
  if (header.version !== 1) throw new Error('Unsupported telemetry packet');
  let offset = Math.ceil((4 + headerLength) / 8) * 8;
  const read = () => {
    const value = header.littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
    offset += 8;
    return value;
  };
  const frames = [];
  for (let n = 0; n < header.frameCount; n++) {
    const t = read(),
      dt = read(),
      cpu = read(),
      s = read(),
      c = read(),
      stages = [],
      counts = [];
    for (let i = 0; i < s; i++) stages.push(read());
    for (let i = 0; i < c; i++) counts.push(read());
    frames.push({ t, dt, cpu, stages, counts });
  }
  const rafs = [];
  for (let n = 0; n < header.rafCount; n++) rafs.push([read(), read()]);
  if (offset !== buffer.length) throw new Error('Telemetry packet size mismatch');
  const metadata = { ...header };
  for (const key of ['version', 'frameCount', 'rafCount', 'littleEndian']) delete metadata[key];
  return { ...metadata, frames, rafs };
}
export async function receiver(directory) {
  await mkdir(directory, { recursive: true });
  const gzip = createGzip(),
    file = createWriteStream(directory + '/telemetry.jsonl.gz');
  gzip.pipe(file);
  const token = '/' + randomBytes(16).toString('hex');
  let packets = 0,
    bytes = 0,
    failure = null;
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (request.url !== token) {
      response.writeHead(404).end();
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }
    const chunks = [];
    let length = 0;
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > 32 * 1024 * 1024) {
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const body = Buffer.concat(chunks),
          batch = decodeBatch(body);
        packets++;
        bytes += body.length;
        const ready = gzip.write(JSON.stringify(batch) + '\n');
        if (ready) response.writeHead(204).end();
        else gzip.once('drain', () => response.writeHead(204).end());
      } catch (error) {
        failure = error.message;
        response.writeHead(400).end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: 'http://127.0.0.1:' + address.port + token,
    stats: () => ({ packets, bytes, failure }),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      gzip.end();
      await finished(file);
    },
  };
}
