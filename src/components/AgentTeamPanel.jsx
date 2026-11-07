import { useState } from 'react';
import { ArrowUpRight, Download, RotateCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, Status } from './Primitives';
import { AgentPortrait } from './AgentPortrait';
import { artifactUrl, elapsed, human, time } from '@/lib/api';

export function AgentTeamPanel({ teams, data, mutate, busy, online, onRefresh, onOpenChat }) {
  const [selected, setSelected] = useState(''), [error, setError] = useState('');
  const team = teams.find(t => t.id === selected) || teams[0];
  if (!team) return <div className="team-empty"><h2>Give Elesis a goal</h2><p>Choose Delegate goal in Chat. She will select specialists, assign independent work, and bring their results together here.</p><p>Every assignment uses its own conversation and the goal’s existing permissions.</p></div>;
  const shortGoal = team.goal.length > 120 ? `${team.goal.slice(0, 117).replace(/\s+\S*$/, '')}…` : team.goal;
  const active = ['queued','planning','working','synthesizing','cancelling'].includes(team.status);
  const action = async value => { try { setError(''); await mutate(`/agent-teams/${team.id}/action`, { action: value }); await onRefresh(); } catch (err) { setError(err.message); } };
  const project = data.projects.find(p => p.id === team.projectId);
  const phaseDescription = { queued: 'Waiting for the worker to plan this goal.', planning: `${team.coordinator.name} is preparing the assignment breakdown.`, working: 'Specialists have independent assignments. Inspect their actual work below.', synthesizing: `${team.coordinator.name} is bringing the saved specialist responses together.`, completed: 'Specialist work and the final CEO response are saved. Open Chat for the synthesis.', failed: 'Work stopped before the whole goal completed. Completed results are preserved.', cancelled: 'This goal was cancelled. Saved results are preserved.', cancelling: 'Waiting for this team’s running turns to stop.' }[team.status];
  return <div className="agent-team-panel">
    {teams.length > 1 && <label className="team-history-select">Goal history<NativeSelect label="Delegated goal history" value={team.id} onChange={event => setSelected(event.target.value)}>{teams.map(t => <option key={t.id} value={t.id}>{t.goal.slice(0, 90)}</option>)}</NativeSelect></label>}
    <header className="team-goal"><div><h2>{shortGoal}</h2><p>{project?.name || (team.projectId ? 'Saved project' : 'Personal · no project')} · Coordinated by {team.coordinator.name}</p></div><Status value={team.status} compact /></header>
    {team.goal.length > 120 && <details className="team-full-goal"><summary>Full goal instruction</summary><p>{team.goal}</p></details>}
    <div className="team-phase"><p role="status">{phaseDescription}</p><div>{active && <Button size="sm" variant="outline" disabled={!!busy || team.cancelRequested} onClick={() => action('cancel')}><Square size={13} />Cancel team</Button>}{['failed','cancelled'].includes(team.status) && <Button size="sm" variant="outline" disabled={!!busy || !online} onClick={() => action('retry')}><RotateCw size={13} />Retry stopped work</Button>}</div></div>
    {team.error && <p className="field-error">{team.error}</p>}{error && <p className="field-error" role="alert">{error}</p>}
    {team.members.length > 0 && <div className="team-members-heading"><h3>Specialist assignments</h3><span>{team.members.filter(m => m.job?.status === 'completed').length} of {team.members.length} completed</span></div>}
    <div className="team-members">{team.members.map(member => {
      const agent = data.agents.find(a => a.id === member.job?.agentId), live = agent?.live;
      const status = member.job?.status === 'running' ? live ? agent.status : 'unknown' : member.job?.status || 'unknown';
      const identity = data.agentProfiles.find(p => p.id === member.profile.id) || member.profile;
      return <article className="team-member" key={member.taskId}>
        <div className="team-member-identity"><AgentPortrait portraitId={identity.portraitId} name={identity.name} size={48} /><div><h4>{identity.name}</h4><p>{identity.role}</p></div><Status value={status} label={member.job?.cancelRequested && ['running','queued'].includes(member.job.status) ? 'Cancelling' : human(status)} compact /></div>
        <p className="team-member-instruction">{member.instruction.length > 220 ? `${member.instruction.slice(0, 217)}…` : member.instruction}</p>{member.instruction.length > 220 && <details className="team-full-goal"><summary>Full assignment</summary><p>{member.instruction}</p></details>}
        <div className="team-member-activity"><span>{member.job?.status === 'running' ? live ? agent.action : 'Worker has not confirmed current execution. Last reported activity is preserved.' : member.job?.status === 'queued' ? 'Queued for an available execution slot.' : member.job?.error || (member.job?.status === 'completed' ? 'Completed response saved.' : 'Execution stopped.')}</span>{live && agent.currentCommand && <code>{typeof agent.currentCommand === 'string' ? agent.currentCommand : agent.currentCommand.command || 'Tool action'}</code>}<small>{elapsed(member.job?.startedAt || member.job?.createdAt, member.job?.finishedAt || Date.now())} elapsed{agent?.lastActivityAt ? ` · Last activity ${time(agent.lastActivityAt)}` : ''}</small></div>
        <div className="team-member-controls"><Button size="sm" variant="ghost" onClick={() => onOpenChat(member.profile.id, member.chatId, team.projectId)}>Inspect {identity.name}<ArrowUpRight size={14} /></Button>{member.task?.result && <details><summary>Saved result</summary><div className="chat-message-text">{member.task.result}</div>{member.artifacts.map(a => <a key={a.id} className="chat-artifact" href={`${artifactUrl(a)}?download=1`} download><Download size={14} />{a.title}</a>)}</details>}</div>
      </article>;
    })}</div>
    <p className="team-scope-note">Specialists can research, inspect the bounded project snapshot and create artifacts in separate workspaces. Website edits still require the capture, design approval and implementation workflow.</p>
  </div>;
}
