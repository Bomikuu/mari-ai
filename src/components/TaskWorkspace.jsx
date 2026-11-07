import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Circle, CheckCircle2, CircleX, Download, Expand, FileImage, ImagePlus, LoaderCircle, Play, RefreshCw, Square, Upload, ZoomIn, ZoomOut, ExternalLink, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Panel, Status, Empty, TinyBadge, NativeSelect } from './Primitives';
import { artifactUrl, elapsed, human } from '@/lib/api';
import { DEFAULT_DESIGN_PROMPT as fallbackPrompt } from '../../shared/constants.js';

const stages = ['Capture', 'Design image', 'Your approval', 'Implement', 'Verify'];
const stageKeys = ['capture', 'design', 'approval', 'implement', 'verify'];

export function WorkflowStages({ task, compact = false }) {
  const phase = String(task?.phase || '').toLowerCase();
  const stage = phase.includes('verif') ? 4 : phase.includes('implement') ? 3 : phase.includes('approv') || task?.status === 'awaiting_approval' ? 2 : phase.includes('design') || phase.includes('handoff') || phase.includes('proposal') ? 1 : 0;
  const stepRecords = Array.isArray(task?.steps) ? task.steps : [];
  return <ol className={`workflow-stages ${compact ? 'compact-stages' : ''}`} aria-label="Workflow stages">{stages.map((label, index) => {
    const step = stepRecords.find((item) => `${item.id || item.name || item.phase || ''}`.toLowerCase().includes(stageKeys[index]));
    const complete = !!task && (step ? step.status === 'completed' : index < stage);
    const active = !!task && !['completed', 'failed', 'cancelled'].includes(task.status) && (step?.status === 'running' || index === stage) && !complete;
    return <li key={label} className={`${complete ? 'is-complete' : ''} ${active ? 'is-active' : ''}`} aria-current={active ? 'step' : undefined}><span className="stage-marker">{complete ? <Check size={14} /> : <span />}</span><span>{label}</span></li>;
  })}</ol>;
}

function ArtifactPreview({ artifact, title, onExpand, fullpage }) {
  return <div className="artifact-preview"><div className="artifact-label"><h3>{title}</h3>{artifact && <Button variant="ghost" size="icon" aria-label={`View ${title} full size`} onClick={() => onExpand(artifact)}><Expand size={15} /></Button>}</div>
    {artifact ? <button className="artifact-image-button" onClick={() => onExpand(artifact)} aria-label={`Open ${title} image`}><img src={artifactUrl(artifact)} alt={`${title}: ${artifact.page || '/'} at ${typeof artifact.viewport === 'string' ? artifact.viewport : 'selected viewport'}`} loading="lazy" /></button> : <div className="artifact-placeholder"><FileImage size={29} /><span>{title === 'Original capture' ? 'Capture a page to begin' : 'A real design image will appear here'}</span></div>}
    {artifact && <div className="artifact-meta"><span>{artifact.page || '/'}</span><span>{typeof artifact.viewport === 'string' ? artifact.viewport : artifact.width ? `${artifact.width} × ${artifact.height}` : ''}</span>{artifact.revision && <span>Revision {artifact.revision}</span>}{fullpage && <button className="fullpage-link" onClick={() => onExpand(fullpage)}>View full page</button>}</div>}
  </div>;
}

function ImageViewer({ artifact, onClose }) {
  const [zoom, setZoom] = useState(100);
  useEffect(() => setZoom(100), [artifact?.id]);
  return <Dialog open={!!artifact} onOpenChange={(open) => !open && onClose()}><DialogContent className="image-viewer"><DialogHeader><DialogTitle>{human(artifact?.kind)} · {artifact?.page || '/'} {artifact?.revision ? `· revision ${artifact.revision}` : ''}</DialogTitle><DialogDescription>Full-size artifact. Zoom and scroll to inspect the details.</DialogDescription></DialogHeader><div className="viewer-toolbar"><Button variant="outline" size="icon" aria-label="Zoom out" onClick={() => setZoom(Math.max(25, zoom - 25))}><ZoomOut size={16} /></Button><span>{zoom}%</span><Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => setZoom(Math.min(300, zoom + 25))}><ZoomIn size={16} /></Button><Button variant="ghost" size="sm" onClick={() => setZoom(100)}>Reset</Button>{artifact && <Button variant="outline" size="sm" asChild><a href={artifactUrl(artifact)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open original</a></Button>}</div><div className="viewer-scroll">{artifact && <img src={artifactUrl(artifact)} alt={`${human(artifact.kind)} full-size artifact`} style={{ width: `${zoom}%`, maxWidth: 'none' }} />}</div></DialogContent></Dialog>;
}

export function TaskWorkspace({ task, data, mutate, busy, onBack }) {
  const [feedback, setFeedback] = useState(''); const [mode, setMode] = useState(task.mode || 'handoff'); const [prompt, setPrompt] = useState(task.designPrompt || task.prompt || fallbackPrompt);
  const [agentProfileId, setAgentProfileId] = useState(task.agentProfileId || '');
  const uploadInput = useRef(null);
  const [selectedId, setSelectedId] = useState(task.activeArtifactId || ''); const [viewer, setViewer] = useState(null); const [showPrompt, setShowPrompt] = useState(false); const [uploading, setUploading] = useState(false); const [uploadError, setUploadError] = useState('');
  const artifacts = data.artifacts.filter((item) => item.taskId === task.id && ['original', 'fullpage', 'proposal', 'implemented'].includes(item.kind));
  const originals = artifacts.filter((item) => item.kind === 'original');
  const proposals = artifacts.filter((item) => item.kind === 'proposal');
  const lastProposal = proposals[proposals.length - 1];
  const selected = artifacts.find((item) => item.id === selectedId) || artifacts.find((item) => item.id === task.activeArtifactId) || lastProposal || originals[0];
  const page = selected?.page || originals[0]?.page || '/';
  const viewport = selected?.viewport || originals[0]?.viewport || 'desktop';
  const samePage = (item) => item.page === page && JSON.stringify(item.viewport) === JSON.stringify(viewport);
  const original = originals.find(samePage) || originals[0];
  const fullpage = artifacts.find((item) => item.kind === 'fullpage' && samePage(item));
  const proposal = selected?.kind === 'proposal' ? selected : proposals.filter(samePage).at(-1);
  const implementationMatches = !!task.approvedArtifactId && task.implementationArtifactId === task.approvedArtifactId && !!task.implementationFinishedAt;
  const implemented = implementationMatches ? artifacts.filter((item) => item.kind === 'implemented' && samePage(item) && (!item.metadata?.approvedArtifactId || item.metadata.approvedArtifactId === task.approvedArtifactId)).at(-1) : null;
  const approved = !!proposal && task.approvedArtifactId === proposal.id;
  const latestVerification = Array.isArray(task.verification) ? task.verification.at(-1) : null;
  const canAccept = implementationMatches && latestVerification?.approvedArtifactId === task.approvedArtifactId && new Date(latestVerification.capturedAt).getTime() >= new Date(task.implementationFinishedAt).getTime() && !['capturing', 'capture_failed', 'comparison_failed', 'comparison_pending'].includes(latestVerification.outcome) && !latestVerification.captures?.some((capture) => capture.status === 'failed') && !task.error;
  const pending = ['queued', 'running'].includes(task.status) || data.jobs.some((job) => job.taskId === task.id && ['queued', 'running'].includes(job.status));
  const resumable = data.jobs.some((job) => job.taskId === task.id && ['failed', 'paused', 'cancelled', 'interrupted'].includes(job.status)) || task.captures?.some((capture) => capture.status === 'failed');
  const action = (value, extra = {}) => mutate(`/tasks/${task.id}/action`, { action: value, ...(['generate','revise','implement','verify','retry','resume'].includes(value) ? { agentProfileId: agentProfileId || null } : {}), artifactId: proposal?.id || selected?.id, feedback, mode, prompt, ...extra }).catch(() => {});
  const project = data.projects.find((item) => item.id === task.projectId);
  const taskAgents = data.agents.filter((item) => item.taskId === task.id).sort((a, b) => new Date(b.lastActivityAt || b.finishedAt || b.startedAt || 0).getTime() - new Date(a.lastActivityAt || a.finishedAt || a.startedAt || 0).getTime());
  const activeAgent = taskAgents.find((item) => item.live === true && item.connectivity !== 'offline');
  const lastAgent = activeAgent ? null : taskAgents[0];
  const actionSummary = activeAgent?.action || task.error?.message || (typeof task.error === 'string' && task.error) || `${human(task.phase || 'task')} · ${human(task.status)}`;
  const changed = task.changedFiles || [];
  const upload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    setUploadError('');
    if (file.size > 25 * 1024 * 1024) { setUploadError('Choose an image smaller than 25 MiB.'); return; }
    const form = new FormData(); form.append('image', file); form.append('page', page); form.append('viewport', typeof viewport === 'string' ? viewport : JSON.stringify(viewport)); form.append('notes', feedback);
    setUploading(true);
    try { const result = await mutate(`/tasks/${task.id}/proposals`, form); setSelectedId(result.artifact?.id || ''); }
    catch (err) { setUploadError(err.message); } finally { setUploading(false); event.target.value = ''; }
  };
  useEffect(() => { setMode(task.mode || 'handoff'); setPrompt(task.designPrompt || task.prompt || fallbackPrompt); setSelectedId(task.activeArtifactId || ''); setFeedback(''); }, [task.id]);
  return <section className="task-workspace" aria-label="Selected task workspace">
    <div className="workspace-title"><div><Button variant="ghost" size="sm" className="back-button" onClick={onBack}><ArrowLeft size={14} />Command center</Button><div className="title-line"><h1>{task.name || 'Website workflow'}</h1><Status value={task.status} /></div><p>{project?.name} <span> / </span>{page} <span> / </span>{human(viewport)}</p></div><div className="workspace-task-controls">{pending && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => action('cancel')}><Square size={13} />Cancel task</Button>}{['failed', 'cancelled'].includes(task.status) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => action('retry')}><RefreshCw size={14} />Retry stage</Button>}{(task.status === 'paused' || (task.status === 'awaiting_input' && resumable)) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => action('resume')}><Play size={14} />Resume</Button>}</div></div>
    <div className="task-action-line"><span>{actionSummary}</span><span>{task.startedAt ? `${elapsed(task.startedAt, task.finishedAt || Date.now())} elapsed` : 'Not started'}{activeAgent?.name ? ` · ${activeAgent.name}` : lastAgent?.name ? ` · Last execution: ${lastAgent.name}` : ''}</span></div>
    <WorkflowStages task={task} />
    <div className="task-profile-choice"><span className="quiet-note">Codex agent profile</span><NativeSelect label="Task agent profile" value={agentProfileId} onChange={(event) => setAgentProfileId(event.target.value)}><option value="">Default Codex</option>{agentProfileId && !(data.agentProfiles || []).some((item) => item.id === agentProfileId) && <option value={agentProfileId} disabled>Unavailable profile · choose another</option>}{(data.agentProfiles || []).filter((item) => item.enabled || item.id === agentProfileId).map((item) => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.name} · {item.role}{!item.enabled ? ' (disabled)' : ''}</option>)}</NativeSelect><span className="quiet-note">Applies to the next AI action; running jobs keep their captured profile.</span></div>
    {task.error && <div className="task-error" role="alert"><CircleX size={17} /><span>{typeof task.error === 'string' ? task.error : task.error.message || JSON.stringify(task.error)}</span></div>}
    <div className="review-toolbar"><div className="review-heading"><h2>{implemented ? 'Implementation review' : proposal ? 'Review the proposed image' : 'Capture & design'}</h2><p>{proposal ? approved ? 'This exact image revision is approved. Implementation needs your separate action.' : 'Review the actual image before approving implementation.' : 'Capture the page, then generate a proposal or import one from ChatGPT.'}</p></div><NativeSelect label="Select page and artifact revision" value={selected?.id || ''} onChange={(e) => setSelectedId(e.target.value)}><option value="" disabled>Select artifact</option>{artifacts.filter((item) => item.kind !== 'fullpage').map((item) => <option key={item.id} value={item.id}>{item.page || '/'} · {human(item.viewport)} · {human(item.kind)}{item.revision ? ` ${item.revision}` : ''}</option>)}</NativeSelect></div>
    <div className={`comparison-grid ${implemented ? 'comparison-three' : ''}`}><ArtifactPreview title="Original capture" artifact={original} fullpage={fullpage} onExpand={setViewer} /><ArtifactPreview title={approved ? `Approved design · revision ${proposal?.revision || 1}` : `Proposed design${proposal ? ` · revision ${proposal.revision || 1}` : ''}`} artifact={proposal} onExpand={setViewer} />{implemented && <ArtifactPreview title="Implemented result" artifact={implemented} onExpand={setViewer} />}</div>
    <div className="review-actions"><label className="feedback-field"><span>{proposal ? 'Revision feedback / implementation notes' : 'Design instructions'}</span><Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Describe what should change or what implementation must preserve…" rows={2} /></label><div className="review-buttons">{proposal && !approved && <><Button variant="ghost" disabled={!!busy || pending} onClick={() => action('reject')}><CircleX size={15} />Reject</Button><Button variant="outline" disabled={!!busy || pending || !feedback.trim()} onClick={() => action('revise')}><RefreshCw size={15} />Request revision</Button><Button disabled={!!busy || pending} onClick={() => action('approve')}><Check size={16} />Approve image</Button></>}{approved && !implemented && <Button disabled={!!busy || pending} onClick={() => action('implement')}><Play size={15} />Implement this design</Button>}{implemented && <><Button variant="outline" disabled={!!busy || pending || Number(task.verificationPasses) >= 2 || !feedback.trim()} onClick={() => action('implement')}><RefreshCw size={14} />Apply corrections</Button><Button variant="outline" disabled={!!busy || pending || Number(task.verificationPasses) >= 2} onClick={() => action('verify')}>Verify again{task.verificationPasses ? ` (${task.verificationPasses}/2)` : ''}</Button><Button disabled={!!busy || pending || !canAccept} onClick={() => action('accept')}><Check size={16} />Accept result</Button></>}</div></div>
    {implemented && Number(task.verificationPasses) >= 2 && <p className="approval-note">The two verification passes are complete. Review the recorded differences; further corrections require a new task.</p>}
    {proposal && <p className="approval-note">Approval applies only to {proposal.page || '/'} · {human(proposal.viewport)} · revision {proposal.revision || 1}. A new image requires new approval.</p>}
    <div className="design-tools"><div className="design-tool-header"><div><h3>Design generation</h3><p>Choose a verified worker integration or a clearly manual ChatGPT handoff.</p></div><NativeSelect label="Design generation mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="builtin">Codex built-in · {data.capabilities?.imageGeneration === 'verified' || data.capabilities?.imageGeneration?.status === 'verified' ? 'verified' : 'requires verification'}</option><option value="handoff">ChatGPT handoff · manual import</option></NativeSelect></div>
      <div className="design-tool-actions"><Button variant="outline" size="sm" onClick={() => setShowPrompt(!showPrompt)}><ChevronDown size={14} />{showPrompt ? 'Hide' : 'Edit'} design prompt</Button><Button variant="outline" size="sm" disabled={!original || pending || !!busy} onClick={() => action('generate')}><ImagePlus size={14} />{mode === 'handoff' ? 'Prepare handoff' : 'Generate design image'}</Button>{original && <Button variant="outline" size="sm" asChild><a href={`/api/tasks/${task.id}/handoff?download=1`} download><Download size={14} />Download handoff</a></Button>}<Button variant="outline" size="sm" disabled={pending || uploading || !!busy || !original} onClick={() => uploadInput.current?.click()}><Upload size={14} />{uploading ? 'Importing…' : 'Import design image'}</Button><input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={pending || uploading || !!busy || !original} onChange={upload} className="sr-only" tabIndex={-1} aria-label="Import design image file" /></div>
      {showPrompt && <label className="prompt-editor">Prompt sent with the screenshot<Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={10} /></label>}
      {mode === 'handoff' && <p className="quiet-note">Download the prompt and original capture, attach them in your own ChatGPT conversation, then import the returned image here. Mari does not read your ChatGPT chats.</p>}{uploadError && <p className="field-error" role="alert">{uploadError}</p>}
    </div>
    <Tabs defaultValue="instruction" className="task-details-tabs"><TabsList className="mari-tabs"><TabsTrigger value="instruction">Instruction & scope</TabsTrigger><TabsTrigger value="steps">Completed steps</TabsTrigger><TabsTrigger value="files">Changed files ({changed.length})</TabsTrigger><TabsTrigger value="verification">Verification</TabsTrigger></TabsList><TabsContent value="instruction"><div className="detail-copy"><p>{task.instruction}</p><p className="quiet-note">Project: {project?.path || 'Unavailable'} · Writes require approval of the exact image revision.</p></div></TabsContent><TabsContent value="steps"><ul className="step-list">{(Array.isArray(task.steps) ? task.steps : []).map((step, i) => <li key={step.id || i}>{step.status === 'completed' ? <CheckCircle2 size={15} /> : <Circle size={15} />}<span>{step.name || step.label || step.phase || step.id || `Stage ${i + 1}`}</span><Status value={step.status} />{step.completed != null && step.total != null && <small>{step.completed} / {step.total} items</small>}</li>)}{!task.steps?.length && <li className="quiet-note">Stage events appear as the worker executes this task.</li>}</ul></TabsContent><TabsContent value="files"><ul className="changed-files">{changed.map((file, i) => <li key={typeof file === 'string' ? file : file.path || i}><code>{typeof file === 'string' ? file : file.path || JSON.stringify(file)}</code></li>)}{!changed.length && <li className="quiet-note">No file changes recorded for this task.</li>}</ul></TabsContent><TabsContent value="verification"><div className="detail-copy"><p>{latestVerification?.comparison?.summary || task.implementationReport || 'Browser verification records appear after approved implementation.'}</p><p className="quiet-note">Verification passes: {task.verificationPasses || 0} / 2. {latestVerification ? `Current result: ${human(latestVerification.outcome)}.` : 'No verification has run yet.'}</p>{task.remainingDifferences?.length > 0 && <ul className="verification-differences">{(Array.isArray(task.remainingDifferences) ? task.remainingDifferences : [task.remainingDifferences]).map((item, index) => <li key={index}>{typeof item === 'string' ? item : item.description || item.summary || JSON.stringify(item)}</li>)}</ul>}</div></TabsContent></Tabs>
    <ImageViewer artifact={viewer} onClose={() => setViewer(null)} />
  </section>;
}
