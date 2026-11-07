import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, AudioLines, Download, Film, Folder, LoaderCircle, Play, RefreshCw, Save, Square, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, Status } from '@/components/Primitives';
import { artifactUrl, elapsed, human, request, time } from '@/lib/api';
import { isFreshServiceObservation } from '../../shared/health.js';
import './media-workspace.css';

const ACTIVE = ['queued', 'running'];
const DEFAULT_VIDEO = { brief: '', duration: 20, format: 'landscape' };
const DEFAULT_VOICE = { voice: 'expr-voice-2-f', speed: 0.95 };
const SAMPLE = 'Hello. I am Mari. I will wait for your instruction.';
const errorText = (error) => typeof error === 'string' ? error : error?.message || 'The request could not be completed.';

function dateLabel(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

// Poll only this workspace's saved state. A project switch immediately hides
// the old response and aborts its request, including pending error responses.
function useMediaState(path) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ path: null, data: null, error: '', loading: true });
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    let disposed = false, timer;
    const controller = new AbortController();
    async function read() {
      try {
        const data = await request(path, { signal: controller.signal });
        if (!disposed) setState({ path, data, loading: false, error: '' });
      } catch (error) {
        if (!disposed && error.name !== 'AbortError') setState((previous) => ({ path, data: previous.path === path ? previous.data : null, loading: false, error: errorText(error) }));
      }
      if (!disposed) timer = window.setTimeout(read, 2000);
    }
    read();
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [path, revision]);
  return { ...(path && state.path === path ? state : { data: null, error: '', loading: !!path }), reload };
}

function MediaError({ error, onRetry }) {
  return error ? <div className="media-error" role="alert"><span>{errorText(error)}</span>{onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry status</Button>}</div> : null;
}

function JobDetails({ job, data, pending, onCancel }) {
  const [clock, setClock] = useState(Date.now());
  const active = ACTIVE.includes(job?.status);
  useEffect(() => {
    if (!active) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, job?.id]);
  if (!job) return null;
  const agent = data.agents.find((item) => item.id === job.agentId);
  const events = data.events.filter((event) => event.data?.jobId === job.id || (job.agentId && event.agentId === job.agentId)).slice(-30);
  return <section className="media-job" aria-label="Media execution">
    <div className="media-job-heading"><div><strong>{job.type === 'voice.start' ? 'VoiceStudio startup' : job.type === 'voice.stop' ? 'VoiceStudio shutdown' : job.type === 'voice.synthesize' ? 'Voice synthesis' : 'Brag video generation'}</strong><Status value={job.status} label={active && job.cancelRequested ? 'Cancellation requested' : human(job.status)} compact /><span className="media-elapsed">{elapsed(job.startedAt || job.createdAt, active ? clock : job.finishedAt || clock)}</span></div>{active && <Button type="button" variant="outline" size="sm" disabled={pending || job.cancelRequested} onClick={() => onCancel(job.id)}><Square size={13} />Cancel job</Button>}</div>
    {agent?.action && <p className="media-current-action">{active ? '' : 'Last action: '}{agent.action}</p>}
    {job.error && <MediaError error={job.error} />}
    <details className="media-execution"><summary><Terminal size={14} />Execution details<span>{events.length} recent event{events.length === 1 ? '' : 's'}</span></summary><dl><div><dt>Job</dt><dd><code>{job.id}</code></dd></div>{agent && <div><dt>Executor</dt><dd>{agent.name} · {human(agent.status)}</dd></div>}{agent?.currentCommand && <div><dt>Current action</dt><dd><code>{typeof agent.currentCommand === 'string' ? agent.currentCommand : agent.currentCommand.command || human(agent.currentCommand.type || 'Tool action')}</code></dd></div>}{job.finishedAt && <div><dt>Finished</dt><dd><time dateTime={job.finishedAt}>{dateLabel(job.finishedAt)}</time></dd></div>}</dl>{events.length ? <ol>{events.map((event) => <li key={event.id}><time dateTime={event.at}>{time(event.at)}</time><span>{event.source || 'system'}</span><p className={event.level === 'error' ? 'error-text' : ''}>{event.message || human(event.type)}</p></li>)}</ol> : <p className="media-note">Execution events will appear when the worker starts this job.</p>}</details>
  </section>;
}

function OutputPlayer({ mode, artifacts }) {
  const [selectedId, setSelectedId] = useState(null);
  const [playbackError, setPlaybackError] = useState('');
  const outputs = [...artifacts].filter((item) => mode === 'video' ? item.kind === 'video' : item.kind === 'audio').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const output = outputs.find((item) => item.id === selectedId) || outputs[0];
  useEffect(() => setPlaybackError(''), [output?.id]);
  const poster = output && artifacts.find((item) => item.kind === 'video_poster' && ((output.metadata?.jobId && item.metadata?.jobId === output.metadata.jobId) || (output.jobId && item.jobId === output.jobId)));
  const copy = output && artifacts.find((item) => item.kind === 'video_copy' && ((output.metadata?.jobId && item.metadata?.jobId === output.metadata.jobId) || (output.jobId && item.jobId === output.jobId)));
  const Icon = mode === 'video' ? Film : AudioLines;
  return <section className="media-output" aria-label={mode === 'video' ? 'Generated videos' : 'Voice samples'}>
    <div className="media-section-heading"><h2>{mode === 'video' ? 'Your project, in motion' : 'Hear Mari'}</h2>{output && <a href={`${artifactUrl(output)}?download=1`} download className="media-download"><Download size={15} />Download {mode === 'video' ? 'MP4' : 'WAV'}</a>}</div>
    {output ? <>
      {mode === 'video' ? <video key={output.id} className="media-video" controls preload="metadata" poster={poster ? artifactUrl(poster) : undefined} onError={() => setPlaybackError('This video could not be played. Download it to inspect the file, or generate another video.')} aria-label={output.title || 'Generated application video'}><source src={artifactUrl(output)} type={output.mime || 'video/mp4'} />Your browser cannot play this video.</video> : <div className="media-audio"><AudioLines size={36} aria-hidden="true" /><strong>{output.title || 'Mari · synthetic voice'}</strong><span>{output.metadata?.voice?.endsWith('-m') ? 'Local synthetic voice' : 'Cold, calm feminine delivery'}</span><audio key={output.id} controls preload="metadata" onError={() => setPlaybackError('This audio could not be played. Download it to inspect the file, or generate another sample.')} aria-label="Mari synthetic voice sample"><source src={artifactUrl(output)} type={output.mime || 'audio/wav'} />Your browser cannot play this audio.</audio></div>}
      <MediaError error={playbackError} />
      <div className="media-output-meta"><time dateTime={output.createdAt}>{dateLabel(output.createdAt)}</time>{output.metadata?.duration != null && <span>{Number(output.metadata.duration).toFixed(1)} seconds</span>}{output.width && output.height && <span>{output.width} × {output.height}</span>}</div>
      {mode === 'voice' && output.metadata?.text && <blockquote className="media-spoken-text">{output.metadata.text}</blockquote>}
      {mode === 'video' && <div className="media-credits">{output.metadata?.attribution && <p>{typeof output.metadata.attribution === 'string' ? output.metadata.attribution : 'Music attribution is included with the video.'}</p>}{copy && <a href={`${artifactUrl(copy)}?download=1`} download>Download copy & credits<Download size={13} /></a>}</div>}
      {outputs.length > 1 && <div className="media-history"><h3>{mode === 'video' ? 'Saved videos' : 'Saved samples'}</h3><ul>{outputs.slice(0, 12).map((item) => <li key={item.id}><button type="button" aria-pressed={output.id === item.id} onClick={() => setSelectedId(item.id)}><Icon size={15} /><span>{item.title || (mode === 'video' ? 'Application video' : 'Voice sample')}<small>{dateLabel(item.createdAt)}</small></span>{output.id === item.id && <span className="media-selected-label">Selected</span>}</button></li>)}</ul></div>}
    </> : <div className={`media-output-empty ${mode === 'voice' ? 'media-output-empty--voice' : ''}`}><Icon size={36} aria-hidden="true" /><strong>{mode === 'video' ? 'Make a short introduction to your app' : 'A voice for your workspace'}</strong><p>{mode === 'video' ? 'Brag turns your running project and a short brief into a locally rendered video. The finished MP4 will appear here.' : 'Generate a sample to hear Mari’s local synthetic voice. Playback begins when you press play.'}</p></div>}
  </section>;
}

export function MediaWorkspace({ mode = 'video', project, data, mutate, busy, onClose, onProjects }) {
  const path = mode === 'voice' ? '/voice' : project ? `/projects/${project.id}/brag` : null;
  const remote = useMediaState(path);
  const content = remote.data;
  const [settings, setSettings] = useState(mode === 'voice' ? DEFAULT_VOICE : DEFAULT_VIDEO);
  const [text, setText] = useState(SAMPLE);
  const [pendingAction, setPendingAction] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const initialized = useRef(false);
  useEffect(() => {
    if (content?.settings && !initialized.current) { setSettings({ ...(mode === 'voice' ? DEFAULT_VOICE : DEFAULT_VIDEO), ...content.settings }); initialized.current = true; }
  }, [content?.settings, mode]);
  const job = content?.job ? data.jobs.find((item) => item.id === content.job.id) || content.job : null;
  const active = ACTIVE.includes(job?.status);
  const pending = !!busy || !!pendingAction;
  const online = data.workers.some((item) => item.status === 'online');
  const connection = content?.connection;
  const services = data.services.filter((item) => item.projectId === project?.id);
  const readyService = content?.service ? services.find((item) => item.id === content.service.id && item.url && item.status === 'running' && isFreshServiceObservation(item)) : null;
  const knownService = readyService || services.find((item) => item.required !== false && item.url) || services.find((item) => item.url);
  const canGenerate = mode === 'voice' ? connection?.status === 'online' && connection.engineAvailable === true : !!readyService && content?.installation?.available === true;
  const apiArtifacts = content?.artifacts || [];
  const artifacts = apiArtifacts.length ? apiArtifacts : data.artifacts.filter((item) => mode === 'voice' ? item.kind === 'audio' && item.metadata?.source === 'voicestudio' : item.projectId === project?.id && ['video', 'video_poster', 'video_copy'].includes(item.kind));
  const voices = content?.voices?.length ? content.voices : [{ id: 'expr-voice-2-f', name: 'Bella · feminine' }];
  const selectedVoiceExists = voices.some((item) => item.id === settings.voice);
  function useWorkspaceStatus() {
    const workers = data.workers.filter((item) => item.status === 'online').length;
    const executions = data.agents.filter((item) => item.live === true && item.status === 'working').length;
    const waiting = data.agents.filter((item) => item.live === true && ['awaiting_approval', 'waiting_for_input'].includes(item.status)).length;
    const context = project ? `Selected project: ${project.name}. ${services.length ? services.slice(0, 4).map((service) => `${service.name}: ${human(service.status || 'unknown')}`).join('. ') + '.' : 'No services are configured.'}` : 'No project is selected.';
    setText(`I am Mari. ${context} ${workers} local worker${workers === 1 ? '' : 's'} online. ${executions} execution${executions === 1 ? '' : 's'} working. ${waiting} live execution${waiting === 1 ? '' : 's'} waiting for your input or approval.`.slice(0, 600));
    setNotice('Workspace status added to the sample text. Generate a sample to hear it.');
  }
  async function action(suffix, body = {}) {
    if (!path) return;
    setPendingAction(suffix); setActionError(''); setNotice('');
    try { await mutate(`${path}${suffix}`, body, suffix === '/settings' ? 'PUT' : 'POST'); if (suffix === '/settings') setNotice('Settings saved.'); remote.reload(); }
    catch (error) { setActionError(errorText(error)); }
    finally { setPendingAction(''); }
  }
  return <section className="media-workspace" aria-label={mode === 'voice' ? 'Mari voice workspace' : 'Project video workspace'}>
    <header className="media-heading"><div><h1>{mode === 'voice' ? 'Mari’s voice' : 'Create a project video'}</h1><p>{mode === 'voice' ? 'A calm, reserved voice. Generated and played locally.' : 'A short application video, made with Brag.'}</p></div><Button size="sm" variant="outline" onClick={onClose}><ArrowLeft size={14} />Workspace</Button></header>
    {!path ? <div className="media-no-project"><Folder size={27} /><h2>Choose a local project</h2><p>Select a saved project to create its video.</p><Button size="sm" onClick={onProjects}>Open projects</Button></div> : <>
      <MediaError error={actionError || remote.error || content?.error} onRetry={remote.error ? remote.reload : undefined} />
      {remote.loading && !content ? <p className="media-loading" role="status"><LoaderCircle size={16} className="busy-spin" />Checking local {mode === 'voice' ? 'voice' : 'video'} tools…</p> : content && <>
        <div className="media-workbench"><div className="media-preparation">
          {mode === 'video' ? <>
            <div className="media-project"><Folder size={18} /><div><h2>{project.name}</h2><code title={project.path}>{project.path}</code></div></div>
            <div className="media-readiness"><Status value={readyService ? 'running' : knownService?.status || 'stopped'} label={readyService ? 'Website ready' : 'Website not ready'} compact />{knownService?.url && <a href={knownService.url} target="_blank" rel="noreferrer">{knownService.url}</a>}<p>{readyService ? `${readyService.ownership === 'external' ? 'External website' : 'Managed service'} · ${readyService.name}` : 'Start your project and confirm readiness before generating.'}</p>{!readyService && <Button size="sm" variant="outline" onClick={onProjects}>Project services</Button>}</div>
            <form className="media-form" onSubmit={(event) => { event.preventDefault(); action('/generate', settings); }}>
              <label htmlFor="video-brief">What should the video show?<Textarea id="video-brief" value={settings.brief} maxLength={1200} rows={5} placeholder="Introduce the app, highlight its main workflow, and show what makes it useful." onChange={(event) => setSettings({ ...settings, brief: event.target.value })} /></label>
              <div className="media-form-pair"><label htmlFor="video-duration">Duration<Input id="video-duration" type="number" min={15} max={25} step={1} value={settings.duration} onChange={(event) => setSettings({ ...settings, duration: event.target.value === '' ? '' : Number(event.target.value) })} required /><small>15–25 seconds</small></label><label>Format<NativeSelect label="Video format" value={settings.format} onChange={(event) => setSettings({ ...settings, format: event.target.value })}><option value="landscape">Landscape · 16:9</option><option value="portrait">Portrait · 9:16</option></NativeSelect></label></div>
              <div className="media-actions"><Button type="submit" disabled={pending || active || !online || !canGenerate || !Number.isInteger(settings.duration) || settings.duration < 15 || settings.duration > 25}>{pendingAction === '/generate' ? <LoaderCircle size={15} className="busy-spin" /> : <Film size={15} />}Generate video</Button><Button type="button" size="sm" variant="outline" disabled={pending || settings.duration === ''} onClick={() => action('/settings', settings)}><Save size={14} />Save settings</Button></div>
            </form>
            {!content.installation?.available && <p className="media-notice">{content.installation?.reason || 'The local Brag renderer is unavailable. Complete its installation before generating.'}</p>}
            <p className="media-note media-scope">Uses the subscribed Codex worker and bundled music. Your project stays unchanged. The finished video stays local until you choose to share it.</p>
          </> : <>
            <div className="media-voice-identity"><AudioLines size={25} /><h2>VoiceStudio</h2></div>
            <div className="media-readiness"><Status value={connection?.status || 'unknown'} compact /><p>{connection?.status === 'online' ? `${connection.engineAvailable ? 'KittenTTS ready' : 'Voice engine not ready'}${connection.ownership === 'external' ? ' · externally started' : connection.ownership === 'managed' ? ' · managed by Mari' : ''}` : connection?.status === 'starting' ? 'Waiting for the local voice API.' : 'Start VoiceStudio to generate a sample.'}</p>{content.installation?.installed && connection?.status === 'offline' && content.installation.launcherAvailable && <Button type="button" size="sm" variant="outline" disabled={pending || active || !online} onClick={() => action('/start')}><Play size={14} />Start VoiceStudio</Button>}{connection?.status === 'online' && connection.ownership === 'managed' && <Button type="button" size="sm" variant="ghost" disabled={pending || active} onClick={() => action('/stop')}><Square size={13} />Stop VoiceStudio</Button>}</div>
            {connection?.error && <p className="media-notice">{errorText(connection.error)}</p>}
            <form className="media-form" onSubmit={(event) => { event.preventDefault(); action('/preview', { ...settings, text: text.trim() }); }}>
              <label htmlFor="voice-text">Sample text<Textarea id="voice-text" rows={5} value={text} maxLength={600} onChange={(event) => setText(event.target.value)} required /><small>{text.length}/600 characters</small></label>
              <div className="media-text-actions"><Button type="button" variant="outline" size="sm" disabled={pending} onClick={useWorkspaceStatus}>Use workspace status</Button></div>
              <label>Voice<NativeSelect label="Mari voice preset" value={settings.voice} onChange={(event) => setSettings({ ...settings, voice: event.target.value })}>{!selectedVoiceExists && <option value={settings.voice}>{settings.voice}</option>}{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name || voice.id}</option>)}</NativeSelect></label>
              <label htmlFor="voice-speed">Speaking speed<Input id="voice-speed" type="number" min={0.75} max={1.25} step={0.05} value={settings.speed} onChange={(event) => setSettings({ ...settings, speed: event.target.value === '' ? '' : Number(event.target.value) })} required /><small>0.95 is a measured, calm pace.</small></label>
              <div className="media-actions"><Button type="submit" disabled={pending || active || !online || !canGenerate || !text.trim() || !Number.isFinite(settings.speed) || settings.speed < 0.75 || settings.speed > 1.25}>{pendingAction === '/preview' ? <LoaderCircle size={15} className="busy-spin" /> : <AudioLines size={15} />}Generate sample</Button><Button type="button" size="sm" variant="outline" disabled={pending || settings.speed === ''} onClick={() => action('/settings', settings)}><Save size={14} />Save voice</Button></div>
            </form>
            {!content.installation?.installed && <p className="media-notice">VoiceStudio is not installed on this computer. Install the local backend before generating.</p>}
            <p className="media-note media-scope">Play or pause a sample with the audio controls. Cancelling discards the result; the local engine may finish its current synthesis. Microphone capture and automatic speech are off.</p>
          </>}
          {!online && <p className="media-notice">The Mari worker is offline. Start Mari’s worker to run media jobs.</p>}
          {notice && <p className="media-saved" role="status">{notice}</p>}
        </div><OutputPlayer mode={mode} artifacts={artifacts} /></div>
        <JobDetails job={job} data={data} pending={pending} onCancel={(jobId) => action('/cancel', { jobId })} />
        <div className="media-bottom-note"><span>{mode === 'voice' ? 'VoiceStudio · local CPU synthesis' : `Brag${content.installation?.version ? ` · Hyperframes ${content.installation.version}` : ''} · local rendering`}</span><Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remote.reload}><RefreshCw size={13} />Refresh status</Button></div>
      </>}
    </>}
  </section>;
}
