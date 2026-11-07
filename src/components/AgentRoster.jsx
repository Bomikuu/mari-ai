import { useState } from 'react';
import { Download, Plus, Search, X, ChevronDown, Pencil } from 'lucide-react';
import { AGENT_CATEGORIES, AGENT_PORTRAITS, agentCategoryLabel } from '../../shared/agent-catalog.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel, Status } from './Primitives';
import { AgentPortrait } from './AgentPortrait';

export function PortraitPicker({ value, onChange, name }) {
  return <fieldset className="portrait-picker"><legend>Portrait</legend><p className="quiet-note">Choose a Grand Chase character, or keep your initials.</p><div className="portrait-options">
    {[{ id: null, label: 'Use initials' }, ...AGENT_PORTRAITS].map((portrait) => <button type="button" key={portrait.id || 'initials'} aria-label={portrait.label} aria-pressed={value === portrait.id} title={portrait.label} onClick={() => onChange(portrait.id)}><AgentPortrait portraitId={portrait.id} name={name || 'Agent'} size={48} /><span>{portrait.id ? portrait.label : 'Initials'}</span></button>)}
  </div><p className="portrait-credit">Grand Chase characters · Chibi fan art generated for Mari</p></fieldset>;
}

function CurrentRoleActivity({ profileId, agents, jobs }) {
  const agent = agents.find((item) => item.agentProfileId === profileId && item.live);
  const queued = jobs.filter((item) => item.status === 'queued' && item.payload?.agentProfile?.id === profileId);
  if (!agent && !queued.length) return null;
  return <div className="roster-role-activity"><Status value={agent?.status || 'queued'} label={agent ? undefined : `${queued.length} queued`} compact /><span>{agent?.action || 'Waiting in the local task queue.'}</span></div>;
}

export function AgentRoster({ profiles, templates, agents = [], jobs = [], editing, onEdit, onChat, onRemove, onInstall, busy, loading }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const matches = (item) => (category === 'all' || (item.category || 'general') === category) && `${item.name} ${item.role} ${item.description} ${agentCategoryLabel(item.category)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visible = profiles.filter(p => (showArchived || !p.archived) && matches(p)).sort((a, b) => { const rank = (p) => { const i = AGENT_PORTRAITS.findIndex(item => item.id === p.portraitId); return i < 0 ? 99 : i; }; return rank(a) - rank(b); });
  const available = templates.filter(item => matches(item) && !profiles.some(p => p.name.toLocaleLowerCase() === item.name.toLocaleLowerCase()));
  return <>
    <div className="roster-filters"><label className="search-field"><Search size={15} /><Input aria-label="Search agents" placeholder="Search agents, roles, specialties…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="agent-categories" role="group" aria-label="Agent categories"><button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All roles</button>{AGENT_CATEGORIES.filter((item) => item.id !== 'general' || profiles.some((profile) => !profile.category || profile.category === 'general')).map((item) => <button key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
    </div>
    <label className="roster-archive-filter"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Include archived profiles</label>
    <section className="agent-roster-section" aria-labelledby="configured-agents-title"><div className="roster-section-heading"><h2 id="configured-agents-title">Your agents</h2><span className="panel-meta" role="status">{loading ? 'Loading profiles…' : `${visible.length} ${showArchived ? 'including archived' : 'configured'}`}</span></div>
      <div className="agent-roster">{loading && !profiles.length ? <p className="resource-empty">Loading your saved profiles…</p> : !visible.length ? <p className="resource-empty">{profiles.length ? 'No configured agents match. Try another category or search.' : 'Install a starter role below, or create your own profile.'}</p> : visible.map((item) => <article key={item.id} className={`roster-agent ${editing === item.id ? 'is-selected' : ''} ${item.enabled ? '' : 'is-disabled'}`}>
        <button className="roster-agent-main" aria-label={`Open ${item.name} chat`} onClick={() => onChat ? onChat(item.id) : onEdit(item)}><AgentPortrait portraitId={item.portraitId} name={item.name} size={64} /><span className="roster-agent-copy"><strong>{item.name}</strong><span>{item.role}</span><span className="roster-agent-category">{agentCategoryLabel(item.category)}</span></span><span className="roster-agent-description">{item.description || 'Custom role instructions.'}</span></button>
        <CurrentRoleActivity profileId={item.id} agents={agents} jobs={jobs} />
        <div className="roster-agent-footer"><span>{item.skillIds?.length || 0} skill{item.skillIds?.length === 1 ? '' : 's'} · {item.enabled ? 'Enabled' : 'Disabled'}</span><div><Button variant="ghost" size="icon" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Pencil size={14} /></Button><a className="resource-export" href={`/api/agent-profiles/${encodeURIComponent(item.id)}/export`} download aria-label={`Export ${item.name}`}><Download size={14} /></a><Button variant="ghost" size="icon" aria-label={`Remove ${item.name} profile`} onClick={() => onRemove(item)}><X size={14} /></Button></div></div>
      </article>)}</div><p className="resource-footnote">Select an agent to chat or assign a task. Use the pencil to edit its profile. Live executions appear in Connected agents.</p>
    </section>
    <Panel title="Add a specialist" className="agent-starters"><p className="quiet-note">Review a starter’s instructions before installing. Installation saves a profile and starts no work. Business and leadership roles provide advice within the task you assign.</p>
      <div className="agent-template-list">{available.length ? available.map((item) => <details key={item.id} className="template-row"><summary><AgentPortrait portraitId={item.portraitId} name={item.name} size={40} /><span><strong>{item.name}</strong><small>{item.description}</small></span><span className="template-disclosure"><span>{agentCategoryLabel(item.category)}</span><span>Review & install<ChevronDown size={14} aria-hidden="true" /></span></span></summary><pre>{item.instructions}</pre><Button variant="outline" size="sm" disabled={!!busy} onClick={() => onInstall(item)}><Plus size={14} />Install {item.name}</Button></details>) : <p className="resource-empty">No starter roles match this search.</p>}</div>
    </Panel>
  </>;
}
