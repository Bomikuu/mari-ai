import path from 'node:path';
import { mkdir, readFile, stat, realpath, copyFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { id, now } from '../server/store.js';
import { createRedactor, validateHttpUrl } from '../server/security.js';
import { VIEWPORTS } from '../shared/constants.js';

export function normalizeRoutes(baseUrl, routes = ['/']) {
  const base = new URL(validateHttpUrl(baseUrl));
  const result = [];
  for (const value of routes) {
    const url = new URL(value, base);
    if (url.origin !== base.origin || url.username || url.password) throw new Error('Capture routes must remain on the configured origin and cannot contain credentials.');
    const route = url.pathname || '/';
    if (!result.includes(route)) result.push(route);
  }
  if (!result.length) result.push('/');
  if (result.length > 20) throw new Error('Select at most 20 unique routes per capture.');
  return result;
}

export async function saveImageArtifact({ store, dataDir, projectId, taskId, sourcePath, kind, page = '/', viewport = 'desktop', revision = 1, title = '', metadata = {} }) {
  const { default: sharp } = await import('sharp');
  const canonical = await realpath(sourcePath);
  const info = await stat(canonical);
  if (!info.isFile() || info.size > 25 * 1024 * 1024 || info.size === 0) throw new Error('An image artifact must be a regular file between 1 byte and 25 MiB.');
  const meta = await sharp(canonical, { limitInputPixels: 60_000_000 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(meta.format) || !meta.width || !meta.height) throw new Error('Expected a decodable PNG, JPEG, or WebP image.');
  const artifactId = id('artifact');
  const directory = path.join(dataDir, 'artifacts', taskId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const extension = meta.format === 'jpeg' ? 'jpg' : meta.format;
  const target = path.join(directory, `${artifactId}.${extension}`);
  await copyFile(canonical, target);
  await chmod(target, 0o600);
  // Decode the entire file before accepting a generation artifact, not just its header.
  await sharp(target, { limitInputPixels: 60_000_000 }).stats();
  const sha256 = createHash('sha256').update(await readFile(target)).digest('hex');
  const artifact = store.put('artifacts', { id: artifactId, projectId, taskId, kind, revision, page, viewport, path: target, mime: `image/${meta.format === 'jpeg' ? 'jpeg' : meta.format}`, width: meta.width, height: meta.height, sha256, title, capturedAt: now(), createdAt: now(), metadata });
  store.event({ source: 'browser', projectId, taskId, type: 'artifact.created', level: 'info', message: `Saved ${kind} image for ${page} at the ${viewport} viewport.`, data: { artifactId, kind, page, viewport, width: meta.width, height: meta.height } });
  return artifact;
}

async function launchFirefoxContext(profile, options, launchContext) {
  try {
    if (launchContext) return await launchContext(profile, options);
    const { firefox } = await import('playwright');
    return await firefox.launchPersistentContext(profile, options);
  } catch (error) {
    if (/Executable doesn't exist|Firefox executable.*(?:missing|not found)/i.test(error.message || '')) {
      throw new Error('The Playwright Firefox runtime is missing. Run "pnpm exec playwright install firefox" in the Mari project, then retry.', { cause: error });
    }
    throw error;
  }
}

export async function capturePages({ store, dataDir, project, task, baseUrl, routes = task.routes || ['/'], viewports = task.viewports || ['desktop'], kind = 'original', captureMetadata = {}, signal, onActivity = () => {}, launchContext }) {
  if (signal?.aborted) throw new Error('Capture cancelled.');
  const safeBase = validateHttpUrl(baseUrl);
  const inventory = normalizeRoutes(safeBase, routes);
  const viewportNames = [...new Set(viewports)].filter((name) => VIEWPORTS[name]);
  if (!viewportNames.length || viewportNames.length > 2) throw new Error('Choose desktop, mobile, or both supported viewports.');
  const profile = path.join(dataDir, 'browser', 'firefox', project.id);
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const context = await launchFirefoxContext(profile, { headless: true, viewport: VIEWPORTS.desktop, acceptDownloads: false }, launchContext);
  const abort = () => context.close().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  const artifacts = [];
  const captures = [];
  const redactor = createRedactor();
  const total = inventory.length * viewportNames.length;
  let completed = 0;
  try {
    for (const route of inventory) for (const viewport of viewportNames) {
      if (signal?.aborted) throw new Error('Capture cancelled.');
      const target = new URL(route, safeBase).href;
      const description = `Capturing ${route} at the ${viewport} viewport.`;
      onActivity(description, `browser.goto ${target}`);
      store.event({ source: 'browser', projectId: project.id, taskId: task.id, type: 'browser.navigation.started', level: 'info', message: description, data: { url: target, page: route, viewport, completed, total, startedAt: now() } });
      const page = await context.newPage();
      try {
        await page.setViewportSize(VIEWPORTS[viewport]);
        const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (new URL(page.url()).origin !== new URL(safeBase).origin) throw new Error('Navigation left the configured origin; sign in through the dedicated browser login flow.');
        if (response?.status() >= 400) throw new Error(`The page responded with HTTP ${response.status()}.`);
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2000))]));
        await page.waitForTimeout(350);
        if (signal?.aborted) throw new Error('Capture cancelled.');
        const title = redactor.redact(await page.title());
        const directory = path.join(dataDir, 'artifacts', task.id);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = path.join(directory, `${id('capture')}.png`);
        await page.screenshot({ path: temporary, fullPage: false, timeout: 10000, animations: 'disabled' });
        const image = await saveImageArtifact({ store, dataDir, projectId: project.id, taskId: task.id, sourcePath: temporary, kind, page: route, viewport, title, metadata: { url: target, status: 'completed', httpStatus: response?.status() ?? null, viewport: VIEWPORTS[viewport], ...captureMetadata } });
        artifacts.push(image);
        if (kind === 'original') {
          const full = path.join(directory, `${id('fullpage')}.png`);
          try {
            await page.screenshot({ path: full, fullPage: true, timeout: 10000, animations: 'disabled' });
            artifacts.push(await saveImageArtifact({ store, dataDir, projectId: project.id, taskId: task.id, sourcePath: full, kind: 'fullpage', page: route, viewport, title, metadata: { url: target, status: 'completed', fullPage: true } }));
          } catch (error) { store.event(redactor.redact({ source: 'browser', projectId: project.id, taskId: task.id, type: 'browser.fullpage.failed', level: 'warning', message: 'Viewport capture succeeded; full-page capture failed.', data: { page: route, viewport, error: error.message } })); }
        }
        captures.push({ page: route, viewport, status: 'completed', artifactId: image.id, title, capturedAt: now() });
        completed++;
        store.event({ source: 'browser', projectId: project.id, taskId: task.id, type: 'browser.capture.completed', level: 'info', message: `Captured ${completed} of ${total} selected page and viewport combinations.`, data: { page: route, viewport, completed, total, artifactId: image.id } });
      } catch (error) {
        if (signal?.aborted) throw new Error('Capture cancelled.');
        const message = redactor.redact(error.message);
        captures.push({ page: route, viewport, status: 'failed', error: message, capturedAt: now() });
        store.event({ source: 'browser', projectId: project.id, taskId: task.id, type: 'browser.capture.failed', level: 'error', message, data: { page: route, viewport, completed, total } });
      } finally { await page.close().catch(() => {}); }
    }
  } finally { signal?.removeEventListener('abort', abort); await context.close(); }
  return { artifacts, captures, completed, total, failed: captures.filter((capture) => capture.status === 'failed').length };
}

export async function openBrowserLogin({ store, dataDir, project, url, signal, onActivity = () => {}, launchContext }) {
  if (signal?.aborted) throw new Error('Browser login cancelled.');
  const target = validateHttpUrl(url);
  const profile = path.join(dataDir, 'browser', 'firefox', project.id);
  await mkdir(profile, { recursive: true, mode: 0o700 });
  onActivity('Waiting for you to sign in in the dedicated browser. Close its window when finished.', `browser.login ${target}`);
  const context = await launchFirefoxContext(profile, { headless: false, viewport: VIEWPORTS.desktop, acceptDownloads: false }, launchContext);
  const abort = () => context.close().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new Error('Browser login cancelled.');
    const page = context.pages()[0] || await context.newPage();
    await page.goto(target, { timeout: 30000, waitUntil: 'domcontentloaded' });
    if (signal?.aborted) throw new Error('Browser login cancelled.');
    store.event({ source: 'browser', projectId: project.id, type: 'browser.login.waiting', level: 'info', message: 'Dedicated login browser opened. Sign in locally and close the window to continue.', data: { origin: new URL(target).origin } });
    await new Promise((resolve) => context.once('close', resolve));
  } finally { signal?.removeEventListener('abort', abort); await context.close().catch(() => {}); }
}
