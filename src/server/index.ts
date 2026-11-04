import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createApp} from './app';
import {createDatabase} from './database';
import {JobQueue} from './job-queue';
try {
  process.loadEnvFile?.();
} catch {}

const dataRoot = join(process.cwd(), 'data');
const assetRoot = join(process.cwd(), 'projects');
mkdirSync(dataRoot, {recursive: true});
mkdirSync(assetRoot, {recursive: true});

const database = createDatabase(join(dataRoot, 'yadam.sqlite'));
new JobQueue(database).recoverInterrupted();

const port = Number(process.env.PORT ?? 4317);
const server = createApp({database, assetRoot}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`야담 제작실 API: http://127.0.0.1:${port}\n`);
});
server.requestTimeout = 600000;
server.headersTimeout = 610000;
server.keepAliveTimeout = 600000;
