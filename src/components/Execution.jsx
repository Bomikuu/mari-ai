import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Pause, Play, Search, Terminal, Clock3, FileCode2, Bot, Check, X, Square, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Panel, Status, Empty, NativeSelect, TinyBadge } from './Primitives';
import { request, elapsed, time, human } from '@/lib/api';
import { AgentPortrait } from './AgentPortrait';

const printable = (value) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);

export function EventRows({ events, compact = false }) {
  return <div className={`event-rows ${compact ? 'compact-events' : ''}`}>{events.map((event) => <div key={event.id} className={`event-row event-${event.level || 'info'}`}><span className="event-time">{time(event.at || event.createdAt)}</span><span className={`event-source source-${event.source}`}>{event.source || 'system'}</span><div className="event-message"><span>{event.message || human(event.type)}</span>{!compact && event.data && <pre>{printable(event.data)}</pre>}</div></div>)}</div>;
}

export function ExecutionPanel({ data, project, task, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen); const [source, setSource] = useState('all'); const [query, setQuery] = useState(''); const [paused, setPaused] = useState(false); const [remoteEvents, setRemoteEvents] = useState(null); const [error, setError] = useState('');
  const log = useRef(null); const [scope, setScope] = useState(task ? 'task' : 'project');
  const params = new URLSearchParams(); if (source !== 'all') params.set('source', source); if (query) params.set('query', query); if (scope === 'task' && task) params.set('taskId', task.id); else if (scope === 'project' && project) params.set('projectId', project.id); params.set('limit', '500');
  const filterKey = params.toString();
  useEffect(() => { if (initialOpen) setOpen(true); }, [initialOpen]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const fetchLogs = async () => { try { const result = await request(`/logs?${filterKey}`); if (active) { setRemoteEvents(Array.isArray(result) ? result : result.events || []); setError(''); } } catch (err) { if (active) setError(err.message); } };
    fetchLogs(); const timer = setInterval(fetchLogs, 2000); return () => { active = false; clearInterval(timer); };
  }, [filterKey, open]);
  const entries = remoteEvents || data.events.filter((event) => (source === 'all' || event.source === source) && (!query || `${event.message} ${JSON.stringify(event.data || '')}`.toLowerCase().includes(query.toLowerCase())) && (scope !== 'project' || !project || event.projectId === project.id) && (scope !== 'task' || !task || event.taskId === task.id));
  const visible = [...entries].sort((a, b) => Number(a.id) - Number(b.id));
  useEffect(() => { if (!paused && log.current) log.current.scrollTop = log.current.scrollHeight; }, [visible.at(-1)?.id, paused, open]);
  const latest = data.events.at(-1);
  return <section className={`execution-panel ${open ? 'expanded' : ''}`} aria-label="Execution details"><div className="execution-disclosure"><button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="execution-log-content">{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}<h2>Execution details</h2></button><span className="execution-sources"><span>Project logs</span><span>Agent events</span></span><span className="last-event">{latest?.message || 'Observable events appear here as work runs.'}</span>{open && <span className="live-label">{paused ? 'Scroll paused' : 'Live output'}</span>}</div>
    {open && <div id="execution-log-content" className="execution-content"><div className="log-toolbar"><div className="source-filter" role="group" aria-label="Filter event source">{['all', 'service', 'agent', 'browser', 'system'].map((item) => <button key={item} aria-pressed={source === item} className={source === item ? 'active' : ''} onClick={() => setSource(item)}>{item === 'all' ? 'All events' : human(item)}</button>)}</div><NativeSelect label="Log scope" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">All projects</option><option value="project">Current project</option>{task && <option value="task">Current task</option>}</NativeSelect><label className="log-search"><Search size={14} /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search output" aria-label="Search execution output" /></label><Button variant="ghost" size="sm" onClick={() => setPaused(!paused)}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? 'Follow' : 'Pause scroll'}</Button><Button variant="outline" size="sm" asChild><a href={`/api/logs?${filterKey}&download=1`} download><Download size={13} />Download</a></Button></div>
      {error && <p role="alert" className="field-error">{error}</p>}<div ref={log} className="log-scroll" tabIndex={0} aria-label="Execution event log">{visible.length ? <EventRows events={visible} /> : <Empty icon={Terminal} title="No matching execution events">Adjust the filters, or start a service or task.</Empty>}</div></div>}
  </section>;
}

function InputRequest({ item, respond, busy, cancelTask }) {
  const questions = item.questions || item.params?.questions || [];
  const [answers, setAnswers] = useState({});
  return <form className="input-request" onSubmit={(event) => { event.preventDefault(); const result = {}; questions.forEach((question) => { result[question.id] = { answers: [answers[question.id] || ''] }; }); respond(item, { answers: result }); }}>
    {questions.length ? questions.map((question) => <label key={question.id}>{question.question || question.header || 'Agent input'}{question.options?.length ? <NativeSelect label={question.question || 'Select answer'} value={answers[question.id] || ''} onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}><option value="">Select an answer</option>{question.options.map((option) => <option key={option.label || option} value={option.label || option}>{option.label || option}</option>)}</NativeSelect> : <Textarea value={answers[question.id] || ''} onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })} rows={2} required />}</label>) : <p className="quiet-note">This worker input cannot be represented yet. Cancel the request and retry with a clearer instruction.</p>}
    <div className="request-actions"><Button type="button" variant="outline" size="sm" onClick={() => cancelTask(item)} disabled={!!busy}>Cancel task</Button>{questions.length > 0 && <Button disabled={!!busy} size="sm">Send answers</Button>}</div>
  </form>;
}

export function ApprovalRequests({ requests, mutate, busy }) {
  const pending = requests.filter((item) => ['pending', 'awaiting_input', 'awaiting_approval'].includes(item.status) || (!item.status && !item.response));
  const respond = (item, response) => mutate(`/requests/${item.id}/respond`, { response }).catch(() => {});
  if (!pending.length) return null;
  return <Panel title="Your input is needed" className="approval-requests">{pending.map((item) => <div className="approval-request" key={item.id}><div><TinyBadge>{item.kind || item.type || 'Approval'}</TinyBadge><strong>{item.reason || item.message || 'Codex is waiting for your response'}</strong></div>{(item.command || item.params?.command) && <pre>{printable(item.command || item.params?.command)}</pre>}{(item.cwd || item.params?.cwd) && <code className="quiet-note">{item.cwd || item.params?.cwd}</code>}<details className="request-payload"><summary>Inspect tool request</summary><pre>{printable(item.params || { kind: item.kind, command: item.command, reason: item.reason, itemId: item.itemId })}</pre></details>{item.kind === 'input' || item.questions || item.params?.questions ? <InputRequest item={item} respond={respond} busy={busy} cancelTask={(pending) => mutate(`/tasks/${pending.taskId}/action`, { action: 'cancel' }).catch(() => {})} /> : <div className="request-actions"><p className="quiet-note">This is permission for the displayed tool action. Design-image approval is separate.</p><Button variant="ghost" size="sm" disabled={!!busy} onClick={() => respond(item, { decision: 'cancel' })}>Cancel task</Button><Button variant="outline" size="sm" disabled={!!busy} onClick={() => respond(item, { decision: 'decline' })}><X size={14} />Decline</Button><Button size="sm" disabled={!!busy} onClick={() => respond(item, { decision: 'accept' })}><Check size={14} />Allow this action</Button></div>}</div>)}</Panel>;
}

export function AgentInspector({ agent, data, onClose, onTask, onChat, mutate, busy }) {
  const task = data.tasks.find((item) => item.id === agent?.taskId); const project = data.projects.find((item) => item.id === agent?.projectId); const worker = data.workers.find((item) => item.id === agent?.workerId);
  const [timeline, setTimeline] = useState(null);
  useEffect(() => {
    setTimeline(null); if (!agent) return; let active = true;
    const load = () => request(`/logs?limit=500${agent.taskId ? `&taskId=${encodeURIComponent(agent.taskId)}` : agent.chatId ? `&chatId=${encodeURIComponent(agent.chatId)}` : ''}`).then((result) => { if (active) setTimeline((result.events || result).filter((event) => event.agentId === agent.id || (agent.taskId && event.taskId === agent.taskId))); }).catch(() => {});
    load(); const timer = agent.live ? setInterval(load, 2000) : null; return () => { active = false; if (timer) clearInterval(timer); };
  }, [agent?.id, agent?.live]);
  const events = timeline || data.events.filter((event) => event.agentId === agent?.id || (task && event.taskId === task.id));
  const command = printable(agent?.currentCommand);
  return <Dialog open={!!agent} onOpenChange={(open) => !open && onClose()}><DialogContent className="mari-dialog agent-dialog"><div className="agent-inspector-identity"><AgentPortrait portraitId={agent?.portraitId} name={agent?.agentProfileName || agent?.name} size={64} /><DialogHeader><DialogTitle>{agent?.name || 'Agent execution'}</DialogTitle><DialogDescription>{agent?.role || 'Connected executor'}{worker ? ` · ${worker.name}` : ''}</DialogDescription></DialogHeader></div>
    <div className="agent-inspector-summary"><Status value={agent?.connectivity || (agent?.finishedAt ? 'offline' : 'unknown')} label={`Connection: ${agent?.connectivity || (agent?.finishedAt ? 'offline' : 'unknown')}`} /><Status value={agent?.status} /><span>{elapsed(agent?.startedAt, agent?.finishedAt || Date.now())} elapsed</span><span>Last activity {agent?.lastActivityAt ? time(agent.lastActivityAt) : 'unknown'}</span></div><dl className="inspector-details"><dt>Project</dt><dd>{project?.name || 'No project assigned'}</dd><dt>Phase</dt><dd>{human(agent?.phase || 'idle')}</dd><dt>Current action</dt><dd>{agent?.action || 'No action reported'}</dd><dt>Task</dt><dd>{task?.name || 'No task assigned'}</dd></dl>
    {(task?.instruction || agent?.instruction) && <div className="agent-scope"><h3>Instruction & assigned scope</h3><p>{task?.instruction || agent?.instruction}</p><code>{project?.path || 'Personal conversation'}</code></div>}{command && <div className="agent-current-command"><h3>Current command / tool action</h3><pre>{command}</pre></div>}{agent?.error && <p role="alert" className="field-error">{printable(agent.error)}</p>}
    <div className="agent-timeline"><h3>Execution timeline</h3>{events.length ? <EventRows events={events.slice(-100)} /> : <p className="quiet-note">No execution events recorded for this agent.</p>}</div>
    {task?.changedFiles?.length > 0 && <div><h3>Changed files</h3><ul className="changed-files">{task.changedFiles.map((file, i) => <li key={i}><code>{typeof file === 'string' ? file : file.path}</code></li>)}</ul></div>}
    <div className="inspector-actions">{agent?.chatId && onChat && <Button variant="outline" size="sm" onClick={() => { onChat(agent.agentProfileId, agent.chatId, agent.projectId); onClose(); }}>Open conversation</Button>}{task && <Button variant="outline" size="sm" onClick={() => { onTask(task.id); onClose(); }}>Inspect task & artifacts</Button>}{task && ['running', 'queued'].includes(task.status) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => mutate(`/tasks/${task.id}/action`, { action: 'cancel' }).catch(() => {})}><Square size={13} />Cancel agent task</Button>}{task && task.kind !== 'agent_task' && ['failed', 'cancelled'].includes(task.status) && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => mutate(`/tasks/${task.id}/action`, { action: 'retry' }).catch(() => {})}><RotateCw size={13} />Retry</Button>}{task && task.kind !== 'agent_task' && (task.status === 'paused' || (task.status === 'awaiting_input' && data.jobs.some((job) => job.taskId === task.id && ['failed', 'paused', 'cancelled', 'interrupted'].includes(job.status)))) && <Button size="sm" disabled={!!busy} onClick={() => mutate(`/tasks/${task.id}/action`, { action: 'resume' }).catch(() => {})}><Play size={13} />Resume</Button>}</div><p className="quiet-note">Cancelling this task leaves unrelated project services running.</p>
  </DialogContent></Dialog>;
}
