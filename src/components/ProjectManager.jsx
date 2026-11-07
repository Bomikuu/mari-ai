import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronRight, Folder, FolderOpen, Plus, RefreshCw, Search, Settings2, Square, Play, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Panel, Status, Empty, TinyBadge } from './Primitives';
import { request, human } from '@/lib/api';
import './project-manager.css';

export function DirectoryPicker({ open, onOpenChange, onSelect, initialPath = '', notice = '' }) {
  const [path, setPath] = useState(''), [listing, setListing] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const browse = async (next = '') => {
    const current = ++sequence.current; setBusy(true); setError('');
    try { const result = await request(next ? `/directories?path=${encodeURIComponent(next)}` : '/directories'); if (current === sequence.current) { setListing(result); setPath(result.path); } }
    catch (err) { if (current === sequence.current) setError(err.message); } finally { if (current === sequence.current) setBusy(false); }
  };
  useEffect(() => { if (open) { setListing(null); browse(initialPath); } return () => { sequence.current++; }; }, [open, initialPath]);
  const entries = listing?.directories || [];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="mari-dialog"><DialogHeader><DialogTitle>Choose a folder</DialogTitle><DialogDescription>{notice || 'Open folders below, then select the folder you want. Scanning starts only when you choose Scan folder.'}</DialogDescription></DialogHeader>
    <div className="folder-browser-toolbar"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => browse('')}><Folder size={14}/>Home</Button><Button type="button" size="sm" variant="ghost" disabled={busy || !listing || listing.parent === listing.path} onClick={() => browse(listing.parent)}><ArrowUp size={14}/>Parent folder</Button></div>
    <code className="folder-browser-path">{listing?.path || 'Opening folder…'}</code>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="directory-list" aria-busy={busy}>{busy ? <p className="quiet-note" role="status">Reading folders…</p> : entries.map(entry => <button type="button" key={entry.path} className="directory-row" onClick={() => browse(entry.path)}><Folder size={16}/><span>{entry.name}</span><ChevronRight size={14}/></button>)}{!busy && listing && !entries.length && <p className="quiet-note">No subfolders here. You can select this folder.</p>}</div>
    <details className="folder-browser-advanced"><summary>Enter a path instead</summary><form className="inline-form" onSubmit={event => { event.preventDefault(); browse(path); }}><Input aria-label="Directory path" value={path} onChange={event => setPath(event.target.value)} placeholder="/home/you/projects"/><Button variant="outline" disabled={busy}>Open</Button></form></details>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={!listing?.path || busy} onClick={() => { onSelect(listing.path); onOpenChange(false); }}><Check size={15}/>Select this folder</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function ServiceControls({ service, mutate, busy, compact = false }) {
  const [review, setReview] = useState(null);
  const start = (action) => {
    if (action === 'stop') { mutate(`/services/${service.id}/stop`, {}).catch(() => {}); return; }
    if (service.confirmedVersion !== service.configVersion || !service.confirmedVersion) setReview(action);
    else mutate(`/services/${service.id}/${action}`, { confirmedVersion: service.configVersion }).catch(() => {});
  };
  const owned = service.ownership === 'managed';
  const live = ['running', 'starting', 'stopping'].includes(service.status) || (owned && !!service.pid);
  return <><div className={`service-controls ${compact ? 'compact-controls' : ''}`}>
    {!live && <Button variant="outline" size="sm" onClick={() => start('start')} disabled={!!busy || service.ownership === 'external'}><Play size={13} />Start</Button>}
    {owned && live && <><Button variant="outline" size="sm" onClick={() => start('stop')} disabled={!!busy || service.status === 'stopping'}><Square size={12} />Stop</Button><Button variant="ghost" size="icon" aria-label={`Restart ${service.name}`} onClick={() => start('restart')} disabled={!!busy}><RotateCw size={14} /></Button></>}
    {service.url && <Button variant="ghost" size="sm" asChild><a href={service.url} target="_blank" rel="noreferrer"><FolderOpen size={13} />Open</a></Button>}
  </div><Dialog open={!!review} onOpenChange={(open) => !open && setReview(null)}><DialogContent className="mari-dialog"><DialogHeader><DialogTitle>Review startup command</DialogTitle><DialogDescription>Confirm the resolved configuration before Mari runs this service.</DialogDescription></DialogHeader>
    <dl className="config-review"><dt>Service</dt><dd>{service.name}</dd><dt>Command</dt><dd><code>{service.command}</code></dd><dt>Working directory</dt><dd><code>{service.cwd}</code></dd><dt>Environment file</dt><dd>{service.envFile || 'None configured'}</dd><dt>Readiness URL</dt><dd>{service.url || 'Not configured — status will remain unknown'}</dd></dl>
    <p className="quiet-note">Mari manages only the process it starts. Environment-file values stay on the worker.</p><DialogFooter><Button variant="outline" onClick={() => setReview(null)}>Cancel</Button><Button disabled={!!busy} onClick={async () => { try { await mutate(`/services/${service.id}/${review}`, { confirmedVersion: service.configVersion }); setReview(null); } catch {} }}><Play size={14} />Confirm & {review}</Button></DialogFooter>
  </DialogContent></Dialog></>;
}

function ServiceEditor({ project, service, suggestion: initialSuggestion, mutate, busy, onDone }) {
  const suggestion = initialSuggestion || project.suggestions?.[0];
  const [form, setForm] = useState(() => ({ name: service?.name || suggestion?.name || 'Development service', command: service?.command || suggestion?.command || '', cwd: service?.cwd || suggestion?.cwd || project.path, envFile: service?.envFile || '', url: service?.url || '', required: service?.required ?? true }));
  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });
  const save = async (e) => { e.preventDefault(); try { await mutate(service ? `/services/${service.id}` : `/projects/${project.id}/services`, form, service ? 'PATCH' : 'POST'); onDone(); } catch {} };
  return <form onSubmit={save} className="service-editor"><div className="form-grid">
    <label>Service name<Input {...field('name')} required /></label><label>Expected URL<Input {...field('url')} placeholder="http://localhost:3000" type="url" /></label>
    <label className="span-two">Startup command<Input {...field('command')} required className="code-input" placeholder="npm run dev" /></label>
    {!!project.suggestions?.length && <div className="suggestions span-two"><span>Detected scripts</span>{project.suggestions.map((item) => <Button key={item.id || `${item.cwd}:${item.command}`} title={item.cwd} type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, command: item.command, name: item.name, cwd: item.cwd || project.path })}>{item.name} · {item.command}</Button>)}</div>}
    <label>Working directory<Input {...field('cwd')} required className="code-input" /></label><label>Environment-file location<Input {...field('envFile')} className="code-input" placeholder="Optional: .env.local" /></label>
  </div><label className="checkbox-label"><input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />Required for project readiness</label>
  <div className="form-actions"><span className="quiet-note">Saving changes requires a new command review before the next start.</span><Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button><Button disabled={!!busy} size="sm">Save service</Button></div></form>;
}

const isFresh = (value, limit) => {
  const age = Date.now() - new Date(value || 0).getTime();
  return Number.isFinite(age) && age >= -5000 && age < limit;
};

function observedService(service, workers) {
  const workerOnline = workers.some((worker) => worker.status === 'online' && isFresh(worker.lastHeartbeatAt, 8000));
  let reason = service.healthReason;
  if (service.ownership === 'managed' && ['running', 'starting', 'stopping'].includes(service.status) && !workerOnline) reason = 'Worker disconnected; health is unconfirmed.';
  else if (['running', 'stopped', 'failed'].includes(service.status) && !isFresh(service.lastProbeAt, 30000)) reason = 'No recent service observation.';
  else if (['starting', 'stopping'].includes(service.status) && !isFresh(service.updatedAt, 30000)) reason = 'The last service update is stale.';
  return reason ? { ...service, status: 'unknown', healthReason: reason } : service;
}

function projectHealth(projectId, data) {
  const services = (data.services || []).filter((service) => service.projectId === projectId).map((service) => observedService(service, data.workers || []));
  const required = services.filter((service) => service.required !== false);
  const relevant = required.length ? required : services;
  let status = 'unknown';
  if (relevant.length) {
    if (relevant.some((service) => service.status === 'failed')) status = 'failed';
    else if (relevant.some((service) => !service.status || service.status === 'unknown')) status = 'unknown';
    else if (relevant.some((service) => service.status === 'stopping')) status = 'stopping';
    else if (relevant.some((service) => service.status === 'starting')) status = 'starting';
    else if (relevant.every((service) => service.status === 'running')) status = 'running';
    else if (relevant.every((service) => service.status === 'stopped')) status = 'stopped';
    else status = 'partial';
  }
  return { status, services };
}

function Detection({ item }) {
  return <div className="manager-detection"><span>{item.framework || 'Unknown framework'}</span><small>{item.packageManager && item.packageManager !== 'Unknown' ? item.packageManager : 'Package manager unknown'}</small></div>;
}

function GitState({ git }) {
  return git?.available ? <div className="manager-git"><code>{git.branch || 'Branch unknown'}</code><small>{git.dirty === true ? 'Uncommitted changes' : git.dirty === false ? 'Clean working tree' : 'Working tree unknown'}</small></div> : <span className="manager-muted">Git unavailable</span>;
}

function ScanLimitNote({ scan }) {
  if (!scan?.truncated) return null;
  const reasons = (scan.truncationReasons || []).map((reason) => ({ depth_limit: '3-level depth', directory_limit: '500-directory limit', candidate_limit: '100-project limit', component_limit: '100-component limit' }[reason] || human(reason)));
  return <p className="scan-limit-note" role="status">Scan limited{reasons.length ? ` by ${reasons.join(', ')}` : ''}. Choose a narrower folder to find more projects.</p>;
}

function DetectedComponents({ item }) {
  const services = item.serviceCandidates || [], packages = item.packages || [];
  if (!services.length && !packages.length) return null;
  return <details className="detected-components"><summary>{services.length} service {services.length === 1 ? 'candidate' : 'candidates'}{packages.length ? ` · ${packages.length} ${packages.length === 1 ? 'package' : 'packages'}` : ''}</summary>
    <p>Register the project, then choose its service commands. Nothing starts during scanning.</p>
    {services.map(component => <div className="detected-component" key={component.path}><strong>{component.relativePath === '.' ? 'Root scripts' : component.relativePath}</strong><small>{component.framework} · {component.packageManager}</small>{component.commands.length ? component.commands.map(command => <code key={command.id}>{command.command}</code>) : <small>Startup command needed</small>}{component.relativePath === '.' && <small>A root script may start multiple services. Review it before adding child commands.</small>}</div>)}
    {packages.map(component => <div className="detected-component" key={component.path}><strong>{component.relativePath}</strong><small>Package · no detected startup command</small></div>)}
  </details>;
}

export function ProjectManager({ data, project, mutate, busy, query = '', setQuery, onSelect, onClose, initialTab = 'saved' }) {
  const [path, setPath] = useState(''); const [name, setName] = useState(''); const [tab, setTab] = useState(initialTab);
  const [picker, setPicker] = useState(null), [nativeTarget, setNativeTarget] = useState(null), [pickerNotice, setPickerNotice] = useState('');
  const nativeRequest = useRef(null);
  useEffect(() => () => nativeRequest.current?.abort(), []); const [scanPath, setScanPath] = useState('');
  const [scanHistory, setScanHistory] = useState(data.projectScans || { roots: [], recentScans: [] });
  const [scan, setScan] = useState(null); const [scanQuery, setScanQuery] = useState(''); const [selectedPaths, setSelectedPaths] = useState([]);
  const [scanning, setScanning] = useState(false); const [registering, setRegistering] = useState(false); const [scanError, setScanError] = useState(''); const [scanNote, setScanNote] = useState('');
  const [editing, setEditing] = useState(null); const [addingService, setAddingService] = useState(false); const [brief, setBrief] = useState(project?.designBrief || '');
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { setBrief(project?.designBrief || ''); setEditing(null); setAddingService(false); }, [project?.id]);
  useEffect(() => { if (data.projectScans) setScanHistory(data.projectScans); }, [data.projectScans]);
  useEffect(() => {
    if (tab !== 'scan') return;
    let active = true;
    request('/projects/scans').then((result) => { if (active) setScanHistory(result); }).catch((error) => { if (active) setScanError(`Saved scans could not be loaded. ${error.message}`); });
    return () => { active = false; };
  }, [tab]);
  const chooseDirectory = async target => {
    if (nativeTarget) return;
    const controller = new AbortController(); nativeRequest.current = controller; setNativeTarget(target); setScanError(''); setPickerNotice('');
    try {
      const result = await request('/directories/pick', { method: 'POST', body: { path: (target === 'scan' ? scanPath : path) || undefined }, headers: { 'x-mari-csrf': data.csrfToken || '' }, signal: controller.signal });
      if (!result.cancelled && result.path) { if (target === 'scan') setScanPath(result.path); else setPath(result.path); }
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (error.code === 'FOLDER_PICKER_UNAVAILABLE') { setPickerNotice('The desktop folder chooser is unavailable. Open folders here and select one.'); setPicker(target); }
      else setScanError(error.message);
    } finally { nativeRequest.current = null; setNativeTarget(null); }
  };
  const add = async (projectPath, projectName) => {
    try { const result = await mutate('/projects', { path: projectPath, name: projectName || undefined }); await onSelect(result.project?.id || result.id, { keepManager: true }); setTab(result.serviceCandidates?.length ? 'services' : 'saved'); setPath(''); setName(''); } catch {}
  };
  const discover = async (root = scanPath) => {
    if (!root.trim()) return;
    setScanning(true); setScanError(''); setScanNote(''); setSelectedPaths([]); setScanQuery('');
    try {
      const result = await mutate('/projects/discover', { path: root });
      setScan(result); setScanPath(result.root || root);
      const summary = { path: result.root || root, lastScannedAt: result.scannedAt, candidateCount: result.candidates?.length || 0, truncated: result.truncated };
      setScanHistory((previous) => ({ roots: [summary, ...(previous.roots || []).filter((item) => item.path !== summary.path)].slice(0, 12), recentScans: [result, ...(previous.recentScans || []).filter((item) => item.root !== result.root)].slice(0, 5) }));
      setScanNote('Scan complete. Choose which projects to register.');
    } catch (error) { setScanError(error.message); } finally { setScanning(false); }
  };
  const registeredProject = (item) => data.projects.find((saved) => saved.path === item.path || saved.id === item.registeredId);
  const registerCandidates = async (items) => {
    setRegistering(true); setScanError(''); setScanNote('');
    let completed = 0;
    try {
      for (const item of items) {
        const result = await mutate('/projects', { path: item.path, name: item.name });
        const id = result.project?.id || result.id;
        if (!id) throw new Error('The project was not returned. Refresh saved projects before trying again.');
        completed++;
        setScan((previous) => ({ ...previous, candidates: previous.candidates.map((candidate) => candidate.path === item.path ? { ...candidate, registeredId: id, registrationStatus: 'registered' } : candidate) }));
        setSelectedPaths((previous) => previous.filter((value) => value !== item.path));
      }
      setScanNote(`${completed} ${completed === 1 ? 'project registered' : 'projects registered'}. Select a project to configure its services.`);
    } catch (error) { setScanError(`${completed ? `${completed} registered. ` : ''}${error.message}`); } finally { setRegistering(false); }
  };
  const filtered = data.projects.filter((item) => `${item.name} ${item.path} ${item.framework || ''} ${item.packageManager || ''}`.toLowerCase().includes(query.toLowerCase()));
  const services = data.services.filter((item) => item.projectId === project?.id);
  const scanCandidates = scan?.candidates || [];
  const scanFiltered = scanCandidates.filter((item) => `${item.name} ${item.path} ${item.framework || ''} ${item.packageManager || ''} ${item.git?.branch || ''}`.toLowerCase().includes(scanQuery.toLowerCase()));
  const eligible = scanFiltered.filter((item) => !registeredProject(item) && !item.registeredId);
  const selected = scanCandidates.filter((item) => selectedPaths.includes(item.path) && !registeredProject(item) && !item.registeredId);
  const scanBusy = scanning || registering || !!busy || !!nativeTarget;
  const outdatedScan = Boolean(scan && scan.structureVersion !== 2);
  return <Panel title="Project manager" className="project-manager" action={<Button variant="ghost" size="icon" onClick={onClose} aria-label="Close project manager"><X size={17} /></Button>}>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="mari-tabs"><TabsTrigger value="saved">Saved projects</TabsTrigger><TabsTrigger value="add">Add project</TabsTrigger><TabsTrigger value="scan">Folder scan</TabsTrigger><TabsTrigger value="services" disabled={!project}>Services</TabsTrigger><TabsTrigger value="brief" disabled={!project}>Design brief</TabsTrigger></TabsList>
      <TabsContent value="saved"><div className="manager-toolbar"><label className="search-field"><Search size={16} /><Input placeholder="Search name, path, or framework" aria-label="Search saved projects" value={query} onChange={(e) => setQuery(e.target.value)} /></label><span className="manager-count">{filtered.length} of {data.projects.length} projects</span><Button variant="outline" size="sm" onClick={() => setTab('add')}><Plus size={14} />Add project</Button><Button variant="outline" size="sm" onClick={() => setTab('scan')}><Search size={14} />Scan a folder</Button></div>
        {!!filtered.length && <div className="manager-table-scroll" tabIndex={0} role="region" aria-label="Saved project details"><table className="manager-table saved-project-table"><caption className="sr-only">All saved projects with detected configuration and observed service status</caption><thead><tr><th scope="col">Project</th><th scope="col">Detection</th><th scope="col">Git</th><th scope="col">Services & status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((item) => {
          const health = projectHealth(item.id, data);
          return <tr key={item.id} className={item.id === project?.id ? 'manager-selected-row' : ''}><td className="manager-project-cell"><strong>{item.name}</strong><code>{item.path}</code>{item.id === project?.id && <span className="manager-selected-label">Selected project</span>}</td><td><Detection item={item} /></td><td><GitState git={item.git} /></td><td><div className="manager-health"><Status value={health.status} />{!health.services.length && <small>No configured services</small>}{health.services.map((service) => <div className="manager-service" key={service.id}><div><strong>{service.name}</strong><Status value={service.status} />{service.ownership === 'external' && <small>External · not managed</small>}{service.healthReason && <small>{service.healthReason}</small>}</div><ServiceControls service={service} mutate={mutate} busy={busy || (data.jobs?.some((job) => job.serviceId === service.id && ['queued', 'running'].includes(job.status)) ? 'service-job' : '')} compact /></div>)}</div></td><td className="manager-row-actions"><Button variant="outline" size="sm" onClick={() => onSelect(item.id)} disabled={!!busy || item.id === project?.id}>{item.id === project?.id ? 'Selected' : 'Select'}</Button><Button variant="ghost" size="sm" onClick={async () => { await onSelect(item.id, { keepManager: true }); setTab('services'); }}>Services<ChevronRight size={13} /></Button></td></tr>;
        })}</tbody></table></div>}{!filtered.length && <Empty icon={Folder} title={query ? 'No matching projects' : 'Your projects belong here'}>Add a local directory or scan a folder to find projects.</Empty>}
      </TabsContent>
      <TabsContent value="add">{scanError && <p className="field-error" role="alert">{scanError}</p>}<form className="add-project-form" onSubmit={(e) => { e.preventDefault(); add(path, name); }}><div className="form-grid"><label className="span-two">Local project directory<div className="inline-form"><Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/home/you/projects/my-app" required /><Button type="button" variant="outline" onClick={() => chooseDirectory('add')} disabled={!!nativeTarget}><FolderOpen size={15} />{nativeTarget ? 'Choosing…' : 'Browse'}</Button></div></label><label>Project name<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional — detected from project" /></label></div>
        <div className="form-actions"><p className="quiet-note">Registration reads project configuration. It runs no commands.</p><Button disabled={!path || !!busy}><Plus size={14} />Register project</Button></div></form>
        <div className="demo-action"><span>Try the workflow with an isolated, clearly labeled demo project.</span><Button variant="outline" size="sm" disabled={!!busy} onClick={async () => { try { const result = await mutate('/demo', {}); await onSelect(result.project?.id || result.id); setTab('services'); } catch {} }}>Use demo project</Button></div>
      </TabsContent>
      <TabsContent value="scan"><form className="folder-scan-form" onSubmit={(event) => { event.preventDefault(); discover(); }}><label className="field-label" htmlFor="project-scan-root">Folder to scan</label><div className="inline-form"><Input id="project-scan-root" value={scanPath} onChange={(event) => setScanPath(event.target.value)} placeholder="/home/you/projects" required disabled={scanBusy} /><Button type="button" variant="outline" onClick={() => chooseDirectory('scan')} disabled={scanBusy}><FolderOpen size={15} />{nativeTarget ? 'Choosing…' : 'Browse'}</Button><Button disabled={!scanPath.trim() || scanBusy}>{scanning ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}{scanning ? 'Scanning…' : 'Scan folder'}</Button></div><p className="quiet-note">Reads only the selected folder, up to 3 levels deep and 500 directories. Shows up to 100 project roots and 100 nested components. Runnable apps are grouped as service candidates; shared packages stay inside their project.</p></form>
        {!!scanHistory.roots?.length && <details className="scan-history"><summary>Previously scanned folders <span>{scanHistory.roots.length}</span></summary><div>{scanHistory.roots.map((root) => <div className="scan-history-row" key={root.path}><span><code>{root.path}</code><small>{root.candidateCount ?? 0} projects · {root.lastScannedAt ? new Date(root.lastScannedAt).toLocaleString() : 'Scan time unknown'}</small></span><Button variant="ghost" size="sm" disabled={scanBusy || !scanHistory.recentScans?.some((item) => item.root === root.path)} onClick={() => { const previous = scanHistory.recentScans.find((item) => item.root === root.path); setScan(previous); setScanPath(root.path); setSelectedPaths([]); setScanQuery(''); setScanNote('Showing saved results. Rescan to refresh project metadata.'); }}>View results</Button><Button variant="outline" size="sm" disabled={scanBusy} onClick={() => { setScanPath(root.path); discover(root.path); }}><RefreshCw size={13} />Rescan</Button></div>)}</div></details>}
        {scanError && <p className="field-error" role="alert">{scanError}</p>}{scanNote && <p className="quiet-note scan-feedback" role="status">{scanNote}</p>}
        {scan && <div className="scan-results" aria-busy={scanning || registering}><div className="scan-summary"><div><strong>{scanCandidates.length} {scanCandidates.length === 1 ? 'project' : 'projects'} found</strong><code>{scan.root}</code></div><span>{scan.scannedDirectories} directories read · {scan.scannedAt ? new Date(scan.scannedAt).toLocaleString() : 'Time unknown'}</span></div><ScanLimitNote scan={scan} />{outdatedScan && <p className="scan-feedback" role="status">This saved scan uses older project grouping. Rescan this folder before registering projects.</p>}{!!scan.errors?.length && <details className="scan-errors"><summary>{scan.errors.length} {scan.errors.length === 1 ? 'directory could' : 'directories could'} not be fully read</summary>{scan.errors.map((error, index) => <p key={`${error.path}-${index}`}><code>{error.path}</code> — {error.message}</p>)}</details>}
          {!!scanCandidates.length && <><div className="manager-toolbar scan-results-toolbar"><label className="search-field"><Search size={15} /><Input value={scanQuery} onChange={(event) => setScanQuery(event.target.value)} placeholder="Search scan results" aria-label="Search scan results" /></label><span className="manager-count">{scanFiltered.length} shown · {selected.length} selected</span><Button variant="outline" size="sm" disabled={!selected.length || scanBusy || outdatedScan} onClick={() => registerCandidates(selected)}><Plus size={14} />{registering ? 'Registering…' : `Register selected${selected.length ? ` (${selected.length})` : ''}`}</Button></div><div className="manager-table-scroll" tabIndex={0} role="region" aria-label="Folder scan results"><table className="manager-table scan-results-table"><caption className="sr-only">Discovered projects are registered only when you choose Register</caption><thead><tr><th scope="col" className="manager-check-cell"><input type="checkbox" aria-label="Select all unregistered projects shown" disabled={!eligible.length || scanBusy || outdatedScan} checked={eligible.length > 0 && eligible.every((item) => selectedPaths.includes(item.path))} onChange={(event) => setSelectedPaths((previous) => event.target.checked ? [...new Set([...previous, ...eligible.map((item) => item.path)])] : previous.filter((value) => !eligible.some((item) => item.path === value)))} /></th><th scope="col">Project</th><th scope="col">Detection</th><th scope="col">Git</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{scanFiltered.map((item) => {
            const saved = registeredProject(item), registeredId = saved?.id || item.registeredId;
            const health = registeredId ? projectHealth(registeredId, data) : { status: 'unknown', services: [] };
            return <tr key={item.path}><td className="manager-check-cell"><input type="checkbox" aria-label={`Select ${item.name} for registration`} checked={selectedPaths.includes(item.path)} disabled={!!registeredId || scanBusy || outdatedScan} onChange={(event) => setSelectedPaths((previous) => event.target.checked ? [...new Set([...previous, item.path])] : previous.filter((value) => value !== item.path))} /></td><td className="manager-project-cell"><strong>{item.name || item.path.split('/').pop()}</strong><code>{item.path}</code><small>{registeredId ? 'Registered' : 'Not registered'}</small><DetectedComponents item={item}/></td><td><Detection item={item} /></td><td><GitState git={item.git} /></td><td><div className="manager-health"><Status value={health.status} /><small>{!registeredId || !health.services.some((service) => service.ownership === 'managed') ? 'Not managed' : `${health.services.length} configured ${health.services.length === 1 ? 'service' : 'services'}`}</small>{health.services.map((service) => <small key={service.id}>{service.name}: {human(service.status)}{service.ownership === 'external' ? ' · external' : ''}</small>)}</div></td><td className="manager-row-actions">{registeredId ? <Button variant="outline" size="sm" disabled={scanBusy} onClick={() => onSelect(registeredId)}>Select<ChevronRight size={13} /></Button> : <Button variant="outline" size="sm" disabled={scanBusy || outdatedScan} onClick={() => registerCandidates([item])}><Plus size={13} />Register</Button>}</td></tr>;
          })}</tbody></table></div>{!scanFiltered.length && <Empty icon={Search} title="No matching scan results">Try a project name, path, or framework.</Empty>}</>}{!scanCandidates.length && <Empty icon={Folder} title="No projects found in this folder">Choose a folder containing project repositories, workspace configuration, or application manifests.</Empty>}
        </div>}{!scan && !scanning && <Empty icon={FolderOpen} title="Choose a folder to find your projects">Choose Browse to open a folder, then choose Scan folder. You can also enter its path. Nothing is registered automatically.</Empty>}
      </TabsContent>
      <TabsContent value="services"><div className="manager-toolbar"><div><strong>{project?.name}</strong><p className="quiet-note">Each service has its own process, readiness check, and logs.</p></div><Button variant="outline" size="sm" disabled={!!busy} onClick={() => mutate(`/projects/${project.id}/refresh`, {}).catch(() => {})}><RefreshCw size={14} />Refresh detection</Button></div>
        {Boolean(project?.serviceCandidates?.length) && <section className="detected-services"><h3>Detected service commands</h3><p className="quiet-note">Choose a command to configure. A root script may already start child services; add only the commands you need. Set the expected URL before checking readiness.</p>{project.serviceCandidates.map(component => <div className="detected-service" key={component.path}><div><strong>{component.relativePath === '.' ? 'Root scripts' : component.relativePath}</strong><code>{component.path}</code><small>{component.framework} · {component.packageManager}</small></div><div className="detected-service-actions">{component.commands.length ? component.commands.map(suggestion => { const saved = services.some(service => service.cwd === suggestion.cwd && service.command === suggestion.command); return <Button type="button" size="sm" variant="outline" key={suggestion.id} disabled={!!busy || saved} onClick={() => setAddingService(suggestion)}>{saved ? 'Added' : 'Configure'} · {suggestion.command}</Button>; }) : <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => setAddingService({name:component.name,cwd:component.path,command:''})}>Set startup command</Button>}</div></div>)}{Boolean(project.packages?.length) && <p className="quiet-note">{project.packages.length} shared {project.packages.length === 1 ? 'package has' : 'packages have'} no detected startup command.</p>}</section>}
        {services.map((service) => <div className="service-config" key={service.id}><div className="service-title"><div><strong>{service.name}</strong><Status value={service.status} />{service.ownership === 'external' && <TinyBadge>External · not managed</TinyBadge>}</div><Button variant="ghost" size="sm" onClick={() => setEditing(editing === service.id ? null : service.id)}><Settings2 size={14} />Configure</Button></div>
          <code className="service-command">{service.command}</code><div className="service-meta"><code>{service.cwd}</code>{service.url && <a href={service.url} target="_blank" rel="noreferrer">{service.url}</a>}</div>
          {service.lastError && <p className="field-error">{typeof service.lastError === 'string' ? service.lastError : service.lastError.message || JSON.stringify(service.lastError)}</p>}
          <ServiceControls service={service} mutate={mutate} busy={busy || (data.jobs.some((job) => job.serviceId === service.id && ['queued', 'running'].includes(job.status)) ? 'service-job' : '')} />{editing === service.id && <ServiceEditor project={project} service={service} mutate={mutate} busy={busy} onDone={() => setEditing(null)} />}</div>)}
        {addingService ? <ServiceEditor key={addingService.id || addingService.cwd || 'manual'} project={project} suggestion={typeof addingService === 'object' ? addingService : undefined} mutate={mutate} busy={busy} onDone={() => setAddingService(false)} /> : <Button variant="outline" size="sm" className="add-service" onClick={() => setAddingService(true)}><Plus size={14} />Add service</Button>}
      </TabsContent>
      <TabsContent value="brief"><form onSubmit={async (e) => { e.preventDefault(); await mutate(`/projects/${project.id}`, { designBrief: brief }, 'PATCH').catch(() => {}); }}><label className="field-label">Shared project design brief<Textarea className="brief-input" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Product identity, content constraints, existing design tokens, and what proposals must preserve." /></label><div className="form-actions"><p className="quiet-note">Included with every design proposal for this project.</p><Button disabled={!!busy}>Save brief</Button></div></form></TabsContent>
    </Tabs><DirectoryPicker initialPath={picker === 'scan' ? scanPath : path} notice={pickerNotice} open={!!picker} onOpenChange={(open) => !open && setPicker(null)} onSelect={(value) => picker === 'scan' ? setScanPath(value) : setPath(value)} />
  </Panel>;
}
