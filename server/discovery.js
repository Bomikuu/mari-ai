import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { canonicalDirectory, detectProject } from './projects.js';
import { inspectProjectTree } from './project-structure.js';

const SCAN_SETTING = 'project-scans';
const FRESH_SERVICE_MS = 30_000;

const within = (root, directory) => directory === root || directory.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
const fresh = (value, maxAge) => {
  const age = Date.now() - new Date(value || 0).getTime();
  return Number.isFinite(age) && age >= -5_000 && age < maxAge;
};

async function mapLimited(items, operation) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await operation(items[index], index);
    }
  }));
  return result;
}

function serviceSnapshot(service, workers) {
  const workerOnline = workers.some((worker) => worker.status !== 'offline' && fresh(worker.lastHeartbeatAt, 8_000));
  let status = service.status || 'unknown';
  let healthReason = service.healthReason || null;
  if (service.ownership === 'managed' && ['running', 'starting', 'stopping'].includes(status) && !workerOnline) {
    status = 'unknown'; healthReason = 'Worker is disconnected; process health is unconfirmed.';
  } else if (['running', 'stopped', 'failed'].includes(status) && !fresh(service.lastProbeAt, FRESH_SERVICE_MS)) {
    status = 'unknown'; healthReason = 'No recent service observation.';
  } else if (['starting', 'stopping'].includes(status) && !fresh(service.updatedAt, FRESH_SERVICE_MS)) {
    status = 'unknown'; healthReason = 'The last service update is stale.';
  }
  return { id: service.id, name: service.name, status, ownership: service.ownership || 'none', url: service.url || null, port: service.port ?? null, lastProbeAt: service.lastProbeAt || null, healthReason };
}

function candidateStatus(candidate, project, store) {
  const services = project && store ? store.list('services').filter((service) => service.projectId === project.id) : [];
  const workers = store ? store.list('workers') : [];
  const serviceStatuses = services.map((service) => serviceSnapshot(service, workers));
  const required = services.filter((service) => service.required !== false).map((service) => serviceStatuses.find((item) => item.id === service.id));
  const relevant = required.length ? required : serviceStatuses;
  let status = 'unknown';
  if (relevant.length) {
    if (relevant.some((service) => service.status === 'failed')) status = 'failed';
    else if (relevant.some((service) => service.status === 'unknown')) status = 'unknown';
    else if (relevant.some((service) => service.status === 'stopping')) status = 'stopping';
    else if (relevant.some((service) => service.status === 'starting')) status = 'starting';
    else if (relevant.every((service) => service.status === 'running')) status = 'running';
    else if (relevant.every((service) => service.status === 'stopped')) status = 'stopped';
    else status = 'partial';
  }
  return { ...candidate, registeredId: project?.id || null, registrationStatus: project ? 'registered' : 'not_registered', managementStatus: services.some((service) => service.ownership === 'managed') ? 'managed' : 'not_managed', status, health: status, serviceStatuses };
}

function countsFor(candidates, errors, detected = candidates.length) {
  const registered = candidates.filter((candidate) => candidate.registeredId).length;
  return { candidates: candidates.length, detected, registered, unregistered: candidates.length - registered, errors: errors.length };
}

export async function listDirectories(input = os.homedir()) {
  const root = await canonicalDirectory(input || os.homedir());
  const entries = await fs.readdir(root, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')).slice(0, 300).map((entry) => ({ name: entry.name, path: path.join(root, entry.name) })).sort((a, b) => a.name.localeCompare(b.name));
  return { path: root, parent: path.dirname(root), directories, items: directories, entries: directories };
}

// Reading saved scans never revisits the filesystem or starts a discovery job.
export function getProjectScans(store) {
  const saved = store?.get('settings', SCAN_SETTING);
  const projects = store ? store.list('projects') : [];
  const recentScans = (saved?.recentScans || []).slice(0, 5).map((scan) => {
    const candidates = (scan.candidates || []).map((candidate) => candidateStatus(candidate, projects.find((project) => project.path === candidate.path || project.id === candidate.registeredId), store));
    return { ...scan, needsRescan: scan.structureVersion !== 2, candidates, counts: countsFor(candidates, scan.errors || [], scan.counts?.detected) };
  });
  return { roots: (saved?.roots || []).slice(0, 12), recentScans };
}

export async function discoverProjects(input, { store } = {}) {
  // A root is required: there is intentionally no home-directory scan default.
  const root = await canonicalDirectory(input);
  const tree = await inspectProjectTree(root, detectProject);
  const registered = store ? await mapLimited(store.list('projects'), async project => ({ ...project, canonicalPath: await fs.realpath(project.path).catch(() => project.path) })) : [];
  const candidates = tree.candidates.map(candidate => candidateStatus(candidate, registered.find(project => project.canonicalPath === candidate.path), store));
  const {detected,...structure} = tree;
  const result = { ...structure, candidates, counts: countsFor(candidates, tree.errors, detected), scannedAt: new Date().toISOString() };
  if (store) {
    const previous = getProjectScans(store);
    const summary = { path: root, lastScannedAt: result.scannedAt, candidateCount: candidates.length, truncated: result.truncated };
    store.put('settings', { id: SCAN_SETTING, roots: [summary, ...previous.roots.filter((item) => item.path !== root)].slice(0, 12), recentScans: [result, ...previous.recentScans.filter((scan) => scan.root !== root)].slice(0, 5) });
  }
  return result;
}
