import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, FileText, MessageCircle, Plus, RotateCw, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, Status } from './Primitives';
import { AgentPortrait } from './AgentPortrait';
import { ApprovalRequests, EventRows } from './Execution';
import { knowledgeDate } from '@/lib/knowledge-format';
import { request, artifactUrl, elapsed, human, time } from '@/lib/api';
import { AgentTeamPanel } from './AgentTeamPanel';
import './agent-chat.css';

export function AgentChatWorkspace({ profileId, initialChatId, initialProjectId, project, data, mutate, busy, onBack, onWorkflow, onOpenChat }) {
  const [scope, setScope] = useState(initialProjectId === undefined ? project?.id || 'personal' : initialProjectId || 'personal');
  const [chats, setChats] = useState([]);
  const [selected, setSelected] = useState(initialChatId || '');
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('chat');
  const [mode, setMode] = useState('chat');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('all');
  const [contextOpen, setContextOpen] = useState(false);
  const history = useRef(null), stickToLatest = useRef(true);
  const profile = data.agentProfiles.find((item) => item.id === profileId);
  const identity = profile || detail?.chat.profile;
  const teams = detail?.teams || [];
  const teamActive = teams.some(t => ['queued','planning','working','synthesizing','cancelling'].includes(t.status));
  const parentActive = detail?.parentTeam && ['queued','planning','working','synthesizing','cancelling'].includes(detail.parentTeam.status);
  const canDelegate = profile?.canDelegate && !detail?.parentTeam;
  const capacity = data.workers.find(w => w.status === 'online')?.capabilities?.agentConcurrency;
  const workerState = data.workers.some((item) => item.status === 'online') ? 'online' : data.workers.some((item) => item.status === 'reconnecting') ? 'reconnecting' : 'offline';
  const online = workerState === 'online';
  const latest = detail?.jobs.at(-1);
  const executor = data.agents.find((item) => item.id === latest?.agentId);
  const active = ['queued', 'running'].includes(latest?.status);
  const teamJob = latest?.type?.startsWith('agent.team.');
  const status = latest?.status === 'running' ? executor?.live ? executor.status : 'unknown' : latest?.status || 'idle';
  const retryable = ['failed', 'paused', 'cancelled', 'interrupted'].includes(latest?.status);
  const scopedProject = data.projects.find((item) => item.id === (detail?.chat.projectId || scope));
  const loadList = async (currentScope = scope) => {
    const result = await request(`/agent-profiles/${encodeURIComponent(profileId)}/chats${currentScope === 'personal' ? '' : `?projectId=${encodeURIComponent(currentScope)}`}`);
    return result.chats;
  };
  useEffect(() => {
    let current = true; setLoading(true); setDetail(null); setDraft(''); setError('');
    loadList().then((items) => { if (!current) return; setChats(items); setSelected(initialChatId && items.some((item) => item.id === initialChatId) ? initialChatId : items[0]?.id || ''); }).catch((err) => { if (current) setError(err.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [profileId, scope]);
  useEffect(() => {
    let current = true, pending = false; setDetail(null); setDraft(''); setError(''); stickToLatest.current = true;
    if (!selected) return () => { current = false; };
    const load = async () => {
      if (pending) return; pending = true;
      try {
        const next = await request(`/agent-chats/${encodeURIComponent(selected)}`);
        if (current) setDetail((previous) => ({ ...next, messages: [...new Map([...(previous?.chat.id === next.chat.id ? previous.messages : []), ...next.messages].map((message) => [message.id, message])).values()] }));
      } catch (err) { if (current) setError(err.message); } finally { pending = false; }
    };
    load(); const timer = setInterval(load, 1500);
    return () => { current = false; clearInterval(timer); };
  }, [selected, scope, profileId]);
  useEffect(() => { if (stickToLatest.current && history.current) history.current.scrollTop = history.current.scrollHeight; }, [detail?.messages.length, detail?.messages.at(-1)?.status, tab]);
  const create = async () => {
    const result = await mutate(`/agent-profiles/${profileId}/chats`, { projectId: scope === 'personal' ? null : scope });
    setChats((previous) => [result.chat, ...previous]); setSelected(result.chat.id); setTab('chat'); return result.chat.id;
  };
  const send = async (event) => {
    event.preventDefault(); if (!draft.trim()) return; setError('');
    const text = draft.trim();
    try { const chatId = selected || await create(); await mutate(`/agent-chats/${chatId}/messages`, { text, mode }); setDraft(''); stickToLatest.current = true; const next = await request(`/agent-chats/${chatId}`); setDetail(next); setChats(await loadList()); if (mode === 'team') setTab('team'); }
    catch (err) { setDraft(text); setError(err.message); }
  };
  const action = async (value) => { try { setError(''); await mutate(`/agent-chats/${selected}/action`, { action: value, jobId: latest.id }); setDetail(await request(`/agent-chats/${selected}`)); } catch (err) { setError(err.message); } };
  const events = (detail?.events || []).filter((event) => eventFilter === 'all' || eventFilter === 'errors' && event.level === 'error' || eventFilter === 'commands' && (event.data?.command || /commandExecution/.test(event.type)) || eventFilter === 'output' && (/output|agentMessage/.test(event.type) || event.data?.itemType === 'agentMessage'));
  const agentIds = new Set((detail?.jobs || []).map((job) => job.agentId).filter(Boolean));
  return <section className="agent-chat-workspace" aria-label="Agent conversation">
    <Button variant="ghost" size="sm" className="agent-chat-back" onClick={onBack}><ArrowLeft size={14} />Agent roster</Button>
    <header className="agent-chat-heading"><AgentPortrait portraitId={identity?.portraitId} name={identity?.name} size={64} /><div><h1>{identity?.name || 'Agent conversation'}</h1><p>{identity?.role || 'Configured Codex profile'}</p></div><div className="chat-worker"><Status value={workerState} label={`Worker ${workerState}`} compact /><span>{capacity ? `Up to ${capacity} concurrent agent turns` : 'Execution capacity unconfirmed'}</span></div></header>
    <button className="chat-context-summary" aria-label="Change conversation context" aria-expanded={contextOpen} onClick={() => setContextOpen((value) => !value)}><span>{scope === 'personal' ? 'Personal' : scopedProject?.name || 'Project'} · {detail?.chat.title || 'New conversation'}</span><ChevronDown size={15} /></button>
    <div className={`agent-chat-context ${contextOpen ? 'is-open' : ''}`}><label>Context<NativeSelect label="Agent chat context" disabled={!!busy || loading} value={scope} onChange={(event) => { setDetail(null); setChats([]); setDraft(''); setSelected(''); setScope(event.target.value); }}><option value="personal">Personal · no project</option>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label><label>Conversation<NativeSelect label="Agent conversation history" disabled={!!busy || loading} value={selected} onChange={(event) => { setDetail(null); setSelected(event.target.value); }}><option value="">New conversation</option>{chats.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</NativeSelect></label><Button variant="outline" size="sm" disabled={!!busy || loading || !profile?.enabled} onClick={() => create().catch((err) => setError(err.message))}><Plus size={14} />New chat</Button></div>
    <nav className="agent-chat-tabs" aria-label="Agent workspace views">{['chat', ...(canDelegate || teams.length ? ['team'] : []), 'tasks', 'activity'].map((view) => <button key={view} aria-pressed={tab === view} onClick={() => setTab(view)}>{human(view)}{view === 'tasks' && detail?.tasks.length ? ` (${detail.tasks.length})` : ''}</button>)}</nav>
    {error && <p className="resource-error" role="alert">{error}</p>}
    {!profile?.enabled && <p className="chat-context-note">{profile ? 'This profile is disabled. Enable it in the roster to continue.' : 'This profile was removed. Its saved conversations remain readable.'}</p>}
    {!online && (tab !== 'team' || teamActive) && <p className="chat-context-note">{workerState === 'reconnecting' ? 'Reconnecting to the local worker. New work waits until the connection is confirmed.' : 'The local worker is offline. Start Mari’s worker to chat or run tasks; saved history stays available.'}</p>}
    <ApprovalRequests requests={data.requests.filter((item) => agentIds.has(item.agentId))} mutate={mutate} busy={busy} />
    {detail?.parentTeam && <p className="chat-context-note">Assigned by {detail.parentTeam.coordinator.name}. <button className="team-parent-link" onClick={() => onOpenChat(detail.parentTeam.coordinator.id, detail.parentTeam.chatId, detail.parentTeam.projectId)}>View the goal and team</button></p>}
    {latest && tab !== 'team' && <div className="agent-chat-execution" role="status"><Status value={status} label={latest.cancelRequested && active ? 'Cancelling' : human(status)} compact /><div><span>{latest.status === 'running' ? executor?.live ? executor.action : 'Connection has not confirmed current execution. Last reported activity is preserved.' : latest.status === 'queued' ? 'Queued for the local worker.' : latest.error || 'Last execution finished.'}</span>{executor?.live && executor.currentCommand && <code>{typeof executor.currentCommand === 'string' ? executor.currentCommand : executor.currentCommand.command || 'Tool action'}</code>}<small>{elapsed(latest.startedAt || latest.createdAt, latest.finishedAt || Date.now())} elapsed{executor?.lastActivityAt ? ` · Last activity ${time(executor.lastActivityAt)}` : ''}</small></div>{active && !teamJob && <Button variant="outline" size="sm" disabled={!!busy || latest.cancelRequested} onClick={() => action('cancel')}><Square size={13} />Cancel</Button>}{retryable && !teamJob && !latest.payload?.teamId && <Button variant="outline" size="sm" disabled={!!busy || !online || !profile?.enabled} onClick={() => action('retry')}><RotateCw size={13} />Retry</Button>}</div>}
    {tab === 'team' ? <AgentTeamPanel teams={teams} data={data} mutate={mutate} busy={busy} online={online} onRefresh={async () => setDetail(await request(`/agent-chats/${selected}`))} onOpenChat={onOpenChat} /> : tab === 'chat' ? <>
      <div className="agent-chat-history" ref={history} onScroll={(event) => { const el = event.currentTarget; stickToLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {detail?.hasEarlier && <Button variant="ghost" size="sm" onClick={async () => { try { stickToLatest.current = false; const earlier = await request(`/agent-chats/${selected}?before=${detail.messages[0].id}`); setDetail((previous) => previous?.chat.id === earlier.chat.id ? ({ ...previous, hasEarlier: earlier.hasEarlier, messages: [...earlier.messages, ...previous.messages] }) : previous); } catch (err) { setError(err.message); } }}>Load earlier messages</Button>}
        {loading || selected && !detail ? <p className="quiet-note">Loading conversation…</p> : !detail?.messages.length ? <div className="agent-chat-empty"><MessageCircle size={24} /><h2>Talk to {identity?.name || 'your agent'}</h2><p>Ask a question or assign a concrete task. {scope === 'personal' ? 'This conversation has no project context.' : `Work stays scoped to ${scopedProject?.name || 'this project'}.`}</p><p>Responses, research and artifacts happen here. Website changes use the approved-design workflow.</p></div> : detail.messages.map((message) => <article key={message.id} className={`chat-message chat-message-${message.role}`}><div className="chat-message-byline">{message.role === 'assistant' && <AgentPortrait portraitId={identity?.portraitId} name={identity?.name} size={28} />}<strong>{message.role === 'user' ? 'You' : identity?.name}</strong>{message.mode === 'team' ? <span>Delegated goal</span> : message.mode === 'task' && <span>Assigned task</span>}<time dateTime={message.createdAt}>{time(message.createdAt)}</time></div>{message.content ? <div className="chat-message-text">{message.content}</div> : <p className="quiet-note">{message.status === 'queued' ? 'Queued for execution.' : message.status === 'working' ? executor?.live ? executor.action : 'Waiting for current execution activity.' : message.error || human(message.status)}</p>}{message.error && message.content && <p className="field-error">{message.error}</p>}</article>)}
      </div>
      <form className="agent-chat-composer" onSubmit={send}><div className="chat-compose-options"><label>Action<NativeSelect label="Agent message action" value={mode} onChange={(event) => setMode(event.target.value)}><option value="chat">Chat</option><option value="task">Assign task</option>{canDelegate && <option value="team">Delegate goal</option>}</NativeSelect></label><span>{mode === 'team' ? `${identity?.name || 'The coordinator'} delegates within this goal’s permissions.` : mode === 'task' ? 'A tracked task with a saved result.' : 'A message in this conversation.'}</span></div><label className="sr-only" htmlFor="agent-chat-message">Message to agent</label><Textarea id="agent-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={12000} rows={3} placeholder={mode === 'team' ? 'Describe the goal and result you want the team to produce…' : mode === 'task' ? 'Describe the result you want this agent to produce…' : `Message ${identity?.name || 'your agent'}…`} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} /><div className="chat-compose-footer"><span>Ctrl/⌘ + Enter to send · Native Codex subscription</span><Button disabled={!!busy || loading || active || teamActive || parentActive || !online || !profile?.enabled || !draft.trim()}><Send size={14} />{mode === 'team' ? 'Delegate goal' : mode === 'task' ? 'Assign task' : 'Send message'}</Button></div></form>
    </> : tab === 'tasks' ? <div className="agent-assigned-tasks">{!detail?.tasks.length ? <p className="resource-empty">No assigned tasks in this conversation. Choose Assign task in the composer to track a concrete result.</p> : detail.tasks.map((task) => <details key={task.id} className="assigned-task"><summary><FileText size={17} /><span><strong>{task.name}</strong><small>{time(task.lastActivityAt)}</small></span><Status value={task.status} compact /></summary><p>{task.instruction}</p>{task.result && <div className="chat-message-text">{task.result}</div>}{task.error && <p className="field-error">{task.error}</p>}{detail.artifacts.filter((item) => item.taskId === task.id).map((item) => <a className="chat-artifact" key={item.id} href={`${artifactUrl(item)}?download=1`} download><Download size={14} />{item.title}</a>)}</details>)}</div> : <div className="agent-chat-activity"><div className="chat-activity-controls"><NativeSelect label="Filter agent activity" value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="all">All execution events</option><option value="commands">Commands</option><option value="output">Output</option><option value="errors">Errors</option></NativeSelect>{selected && <a href={`/api/logs?chatId=${encodeURIComponent(selected)}&download=1`} download>Download timeline</a>}</div>{events.length ? <EventRows events={events} /> : <p className="resource-empty">No matching execution events. Real commands, tool calls and output appear when work runs.</p>}<details className="chat-assignment-details"><summary>Instructions, scope & files</summary>{detail?.jobs.filter(j => j.payload?.knowledgeContext?.sources?.length).slice(-8).reverse().map(j => <details className="chat-knowledge-context" key={j.id}><summary>Captured knowledge · {knowledgeDate(j.payload.knowledgeContext.capturedAt)} · {j.payload.knowledgeContext.sources.length} sources</summary>{j.payload.knowledgeContext.sources.map(source => <div key={source.id}><strong>{source.title}</strong><p>{source.sourceType} · Scope: {source.scope === 'project' ? data.projects.find(p => p.id === source.projectId)?.name || 'Saved project' : source.scope}{source.stale ? ' · cached after refresh failure' : ''}{source.truncated ? ' · excerpt truncated' : ''}</p><p>Captured {knowledgeDate(j.payload.knowledgeContext.capturedAt)} · Saved {knowledgeDate(source.updatedAt)}</p>{source.sourceType === 'drive' && <p>Fetched {knowledgeDate(source.fetchedAt)} · Source modified {knowledgeDate(source.modifiedAt)}</p>}<p>Revision {source.revision || 'Not recorded'}</p>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source document</a>}<pre>{source.excerpt}</pre></div>)}</details>)}<p>{detail?.chat.profile.instructions || profile?.instructions}</p><p>Context: {detail?.chat.projectId ? scopedProject?.name || 'Saved project' : 'Personal'}. Project source is supplied as a bounded, secret-filtered snapshot. Original source cannot be edited here.</p>{detail?.chat.contextSnapshot && <p>Latest source snapshot: {detail.chat.contextSnapshot.files} files · {time(detail.chat.contextSnapshot.capturedAt)}{detail.chat.contextSnapshot.truncated ? ' · bounded selection' : ''}</p>}<p>Conversation instructions are captured when it is created. Start a new chat after editing a profile to use the new instructions.</p>{detail?.artifacts.map((item) => <a className="chat-artifact" key={item.id} href={`${artifactUrl(item)}?download=1`} download><Download size={14} />{item.title}</a>)}</details></div>}
    <p className="chat-workflow-note">Need to change a website? <button onClick={() => onWorkflow(detail?.chat.projectId || (scope === 'personal' ? null : scope))}>Open the capture and design workflow</button> to review and approve the exact design before implementation.</p>
  </section>;
}
