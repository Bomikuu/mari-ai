import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createStore, id, now } from '../server/store.js';
import { newspaperEditions, NEWSPAPER_EDITION_PREFIX } from '../server/newspaper.js';
import { publicArtifact, ownedArtifactPath } from '../server/artifacts.js';
import { collectNewspaperImages } from '../server/newspaper-images.js';
import { renderNewspaperPdf } from '../server/newspaper-pdf.js';

// Layout-only operation. No news rewriting, summarization or model invocation.
export async function reflowNewspaper({ store, dataDir, editionId, withImages = true, fetchImpl = fetch, briefing }) {
  const original = newspaperEditions(store).find((e) => !editionId || e.id === editionId);
  if (!original) throw new Error('No saved edition exists to reformat.');
  const root = await fs.realpath(dataDir), artifactRoot = path.join(root, 'artifacts');
  await fs.mkdir(artifactRoot, { recursive: true, mode: 0o700 });
  if (await fs.realpath(artifactRoot) !== artifactRoot) throw new Error('Newspaper storage must be canonical.');
  const directory = await fs.mkdtemp(path.join(artifactRoot, 'newspaper-reflow-')); await fs.chmod(directory, 0o700);
  let saved = false;
  try {
    const edition = structuredClone(original);
    if (briefing) { if(briefing.date!==edition.date)throw new Error('Personal briefing must match the saved edition date.'); edition.newsStatus=edition.newsStatus||edition.status; edition.personal=briefing; edition.status=edition.newsStatus==='partial'||briefing.status==='partial'?'partial':'ready'; }
    const images = withImages ? await collectNewspaperImages({ edition, directory, fetchImpl }) : { stories: edition.stories.map((s) => ({ ...s, image: undefined })), artifacts: [], imageFiles: {} };
    edition.stories = images.stories;
    const filename = path.join(directory, 'mari-daily.pdf');
    const rendering = await renderNewspaperPdf({ edition, filename, imageFiles: images.imageFiles });
    const file = await ownedArtifactPath(root, { path: filename }), buffer = await fs.readFile(file);
    const artifact = { id: id('artifact'), jobId: edition.jobId || null, kind: 'newspaper_pdf', mime: 'application/pdf', path: file, title: `Mari Daily · ${edition.date}`, createdAt: now(), sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length, metadata: { editionId: edition.id, date: edition.date, pages: rendering.pages, source: 'layout-only-reflow', presentation: rendering.presentation } };
    edition.renderingHistory = [...(edition.renderingHistory || []), { pdfArtifact: original.pdfArtifact, pages: original.pages, printPlan: original.printPlan || null, replacedAt: now() }];
    edition.pdfArtifact = publicArtifact(artifact); edition.pages = rendering.pages; edition.printPlan = rendering.printPlan; edition.reflowedAt = now();
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const current = store.get('settings', NEWSPAPER_EDITION_PREFIX + original.id)?.edition;
      if (current?.pdfArtifact?.id !== original.pdfArtifact?.id) throw new Error('This edition changed during reformatting. Retry explicitly.');
      for (const image of images.artifacts) store.put('artifacts', image);
      store.put('artifacts', artifact); store.put('settings', { id: NEWSPAPER_EDITION_PREFIX + edition.id, edition });
      store.db.exec('COMMIT'); saved = true;
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
    return { date: edition.date, editionId: edition.id, status: edition.status, pages: rendering.pages, images: images.artifacts.length, stories: edition.stories.length, pdfPath: file, previousPdfArtifactId: original.pdfArtifact?.id, modelCalls: 0 };
  } finally { if (!saved) await fs.rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))), dataDir = process.env.MARI_DATA_DIR || path.join(root, '.mari'), store = createStore(dataDir);
  try { console.log(JSON.stringify(await reflowNewspaper({ store, dataDir, editionId: process.argv[2] }), null, 2)); }
  catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
  finally { store.close(); }
}
