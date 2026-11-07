import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Bot, Check, FileJson, LoaderCircle, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Panel, Status, TinyBadge, NativeSelect } from './Primitives';
import { AgentRoster, PortraitPicker } from './AgentRoster';
import { AgentPortrait } from './AgentPortrait';
import { AGENT_CATEGORIES, agentCategoryLabel } from '../../shared/agent-catalog.js';
import { request, human, time } from '@/lib/api';
import { validateProfilePreview } from '@/lib/agent-profile-import';
import './resources-manager.css';

const blankProfile = () => ({ name: '', role: '', description: '', instructions: '', skillIds: [], enabled: true, category: 'general', portraitId: null, canDelegate: false, archived: false });

export function ResourcesManager({ view, onView, onClose, onChat, project, data, mutate, busy }) {
  const [inventory, setInventory] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [catalogScope, setCatalogScope] = useState('global');
  const [skill, setSkill] = useState(null);
  const [skillLoading, setSkillLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [form, setForm] = useState(blankProfile);
  const [notice, setNotice] = useState('');
  const [imported, setImported] = useState(null);
  const [remove, setRemove] = useState(null);
  const fileInput = useRef(null);
  const editor = useRef(null);
  const globalInventory = view === 'skills' && catalogScope === 'global';
  const contextQuery = globalInventory ? 'scope=global' : project?.id ? `projectId=${encodeURIComponent(project.id)}` : '';

  const load = useCallback(async (force = false) => {
    setLoading(true); setError('');
    const results = await Promise.allSettled([
      request(`/skills?${view === 'skills' && catalogScope === 'global' ? 'scope=global&' : project?.id ? `projectId=${encodeURIComponent(project.id)}&` : ''}${force ? 'refresh=1' : ''}`),
      request('/agent-profiles'),
    ]);
    if (results[0].status === 'fulfilled') setInventory(results[0].value);
    else { setInventory(null); setError(results[0].reason.message); }
    if (results[1].status === 'fulfilled') { setProfiles(results[1].value.profiles || []); setTemplates(results[1].value.templates || []); }
    else setError(results[1].reason.message);
    setLoading(false);
  }, [project?.id, view, catalogScope]);
  useEffect(() => { setSkill(null); load(); }, [load]);
  useEffect(() => {
    if (!editing || !editor.current) return;
    editor.current.scrollIntoView({ block: 'start', behavior: 'instant' });
    editor.current.querySelector('input')?.focus({ preventScroll: true });
  }, [editing, editorFocusRequest]);

  const skills = inventory?.skills || [];
  const filtered = skills.filter((item) => (scope === 'all' || item.scope === scope) && `${item.name} ${item.description} ${item.path}`.toLowerCase().includes(query.toLowerCase()));
  const edit = (profile) => {
    setEditing(profile?.id || 'new'); setImported(null); setNotice('');
    setEditorFocusRequest((value) => value + 1);
    setForm(profile ? Object.fromEntries(Object.keys(blankProfile()).map((key) => [key, profile[key] ?? blankProfile()[key]])) : blankProfile());
  };
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const save = async (event) => {
    event.preventDefault(); setNotice('');
    try {
      const result = await mutate(editing === 'new' ? '/agent-profiles' : `/agent-profiles/${editing}`, { ...form, projectId: project?.id }, editing === 'new' ? 'POST' : 'PATCH');
      setEditing(null); await load(); setNotice(`${result.profile?.name || form.name} is configured. Select it in task settings to use it.`);
    } catch {}
  };
  const install = async (template) => {
    try { await mutate('/agent-profiles/install', { templateId: template.id, projectId: project?.id }); await load(); setNotice(`${template.name} profile installed in Mari.`); } catch {}
  };
  const selectImport = async (event) => {
    setError(''); const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 64 * 1024) { setError('Agent profile files are limited to 64 KiB.'); return; }
    try { const value = validateProfilePreview(JSON.parse(await file.text())); setImported(value); setEditing(null); }
    catch (err) { setImported(null); setError(err instanceof SyntaxError ? 'Choose a valid JSON agent profile exported from Mari.' : err.message); }
  };
  const confirmImport = async () => {
    try { await mutate('/agent-profiles/import', { ...(imported.profile ? imported : { schemaVersion: 1, profile: imported }), projectId: project?.id }); setImported(null); await load(); setNotice('Agent profile imported and configured.'); } catch {}
  };
  const openSkill = async (item) => {
    setSkillLoading(true); setError('');
    try { setSkill(await request(`/skills/${item.id}?${contextQuery}`)); } catch (err) { setError(err.message); }
    finally { setSkillLoading(false); }
  };

  return <section className="resources-workspace" aria-label={view === 'skills' ? 'Installed Codex skills' : 'Codex agent profiles'}>
    <div className="resource-heading"><div><Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft size={14} />Command center</Button><h1>{view === 'skills' ? 'Installed Codex skills' : 'Agent roster'}</h1><p>{view === 'skills' ? `The native Codex inventory ${globalInventory ? 'in Mari’s installed context' : project ? `available to ${project.name}` : 'in the current context'}. Profiles bind skills from their selected project context.` : 'Reusable Codex roles, with portraits and specialized instructions.'}</p></div><div className="resource-heading-actions"><Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}><RefreshCw size={14} className={loading ? 'busy-spin' : ''} />Refresh</Button><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close resources"><X size={17} /></Button></div></div>
    <nav className="resource-tabs" aria-label="Codex resources"><button aria-pressed={view === 'skills'} onClick={() => onView('skills')}><BookOpen size={15} />Installed skills</button><button aria-pressed={view === 'profiles'} onClick={() => onView('profiles')}><Bot size={15} />Agent profiles</button></nav>
    {error && <p className="resource-error" role="alert">{error}</p>}
    {notice && <p className="resource-notice" role="status"><Check size={15} />{notice}</p>}
    {inventory?.errors?.length > 0 && <div className="resource-errors" role="status">{inventory.errors.map((item, i) => <p key={i}>{typeof item === 'string' ? item : item.message || item.error || 'Codex reported an inventory error.'}</p>)}</div>}
    {view === 'skills' ? <div className={`skills-layout ${skill ? 'has-detail' : ''}`}>
      <Panel title="Skill inventory" action={<span className="panel-meta">{loading ? 'Reading Codex…' : inventory ? `${skills.length} installed` : 'Unavailable'}</span>}>
        <div className="resource-filter"><label className="search-field"><Search size={15} /><Input aria-label="Search installed skills" placeholder="Search names, descriptions, paths…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select aria-label="Skill inventory context" value={catalogScope} onChange={(event) => { setCatalogScope(event.target.value); setScope('all'); }}><option value="global">Mari · installed</option><option value="project">Selected project</option></select><select aria-label="Skill scope" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">All scopes</option>{[...new Set(skills.map((item) => item.scope))].map((value) => <option key={value} value={value}>{human(value)}</option>)}</select></div>
        <div className="skill-list">{loading && !inventory ? <p className="resource-empty"><LoaderCircle className="busy-spin" size={17} />Reading the native Codex inventory…</p> : !inventory ? <p className="resource-empty">The installed skill inventory is unavailable. Refresh after checking the local Codex connection.</p> : !filtered.length ? <p className="resource-empty">No installed skills match this filter.</p> : filtered.map((item) => <button key={item.id} className={`skill-row ${(skill?.id || skill?.skill?.id) === item.id ? 'selected' : ''}`} onClick={() => openSkill(item)}><span><strong>{item.name}</strong><small>{item.description || 'No description provided.'}</small><code>{item.path}</code></span><span className="skill-row-meta"><TinyBadge>{item.scope}</TinyBadge><TinyBadge>{item.source?.startsWith('plugin:') ? 'Plugin' : 'Local'}</TinyBadge><Status value={item.enabled ? 'online' : 'stopped'} label={item.enabled ? 'Enabled' : 'Disabled'} compact /></span></button>)}</div>
        {inventory && <p className="resource-footnote">Native Codex inventory · {inventory.scannedAt ? `Read at ${time(inventory.scannedAt)}` : 'Current context'} · Project, user, system and plugin paths are preserved.</p>}
      </Panel>
      {(skill || skillLoading) && <Panel title={skillLoading ? 'Reading skill' : skill?.name || skill?.skill?.name || 'Skill instructions'} action={<Button variant="ghost" size="icon" aria-label="Close skill details" onClick={() => setSkill(null)}><X size={15} /></Button>}><p className="quiet-note">Installed instructions are displayed as text. Viewing them does not run the skill.</p><p className="resource-footnote">{skill?.skill?.scope} · {skill?.skill?.source}</p><pre className="skill-content">{skillLoading ? 'Reading…' : skill?.content || skill?.markdown || 'No instructions returned.'}</pre></Panel>}
    </div> : <>
      <div className="profile-toolbar"><p>{profiles.filter(p => !p.archived).length} configured profile{profiles.filter(p => !p.archived).length === 1 ? '' : 's'} · Uses your existing Codex subscription</p><div><input ref={fileInput} className="sr-only" type="file" accept=".json,application/json" onChange={selectImport} /><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><Upload size={14} />Import profile</Button><Button size="sm" onClick={() => edit(null)}><Plus size={14} />Create profile</Button></div></div>
      {imported && <Panel title="Review profile import"><div className="profile-import-preview"><AgentPortrait portraitId={(imported.profile || imported)?.portraitId} name={(imported.profile || imported)?.name} size={64} /><p>{agentCategoryLabel((imported.profile || imported)?.category)}</p><strong>{(imported.profile || imported)?.name || 'Unnamed profile'}</strong><p>{(imported.profile || imported)?.role}</p><pre>{(imported.profile || imported)?.instructions || 'No instructions provided.'}</pre></div><div className="form-actions"><Button variant="outline" size="sm" onClick={() => setImported(null)}>Cancel</Button><Button size="sm" disabled={!!busy} onClick={confirmImport}><FileJson size={14} />Import this profile</Button></div></Panel>}
      <div className={`profiles-layout ${editing ? 'has-editor' : ''}`}><div>
        <AgentRoster profiles={profiles} templates={templates} agents={data.agents} jobs={data.jobs} editing={editing} onEdit={edit} onChat={onChat} onRemove={setRemove} onInstall={install} busy={busy} loading={loading} />
      </div>{editing && <Panel title={editing === 'new' ? 'Create agent profile' : 'Edit agent profile'} action={<Button variant="ghost" size="icon" aria-label="Close profile editor" onClick={() => setEditing(null)}><X size={15} /></Button>}><form ref={editor} className="profile-form" onSubmit={save}>
        <div className="profile-name-row"><label>Name<Input value={form.name} maxLength={80} onChange={(e) => update('name', e.target.value)} required placeholder="e.g. Frontend builder" /></label><label>Role<Input value={form.role} maxLength={120} onChange={(e) => update('role', e.target.value)} placeholder="Implementation engineer" /></label></div>
        <label>Category<NativeSelect label="Agent category" value={form.category} onChange={(event) => update('category', event.target.value)}>{AGENT_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</NativeSelect></label>
        <PortraitPicker value={form.portraitId} name={form.name} onChange={(value) => update('portraitId', value)} />
        <label>Description<Input value={form.description} maxLength={1000} onChange={(e) => update('description', e.target.value)} placeholder="What this profile is useful for" /></label>
        <label>Instructions<Textarea value={form.instructions} maxLength={16000} onChange={(e) => update('instructions', e.target.value)} required rows={9} placeholder="Describe the role, approach, and reporting you want from Codex." /></label>
        <fieldset className="profile-skills"><legend>Installed skills</legend><p className="quiet-note">Selected skills are explicitly attached to Codex turns. Missing or changed files stop execution rather than silently changing scope.</p><div>{skills.filter((item) => item.enabled || form.skillIds.includes(item.id)).map((item) => <label key={item.id}><input type="checkbox" checked={form.skillIds.includes(item.id)} disabled={!item.enabled && !form.skillIds.includes(item.id)} onChange={(e) => update('skillIds', e.target.checked ? [...form.skillIds, item.id] : form.skillIds.filter((id) => id !== item.id))} /><span>{item.name}<small>{item.scope}{!item.enabled ? ' · disabled' : ''}</small></span></label>)}</div>{!skills.length && <p className="quiet-note">No skill inventory is available. Profiles without skill bindings can still be configured.</p>}{form.skillIds.filter((id) => !skills.some((item) => item.id === id)).length > 0 && <p className="field-error">This profile has skill bindings not available in the current project. Refresh the inventory, choose a different project, or remove them before saving.<Button type="button" variant="ghost" size="sm" onClick={() => update('skillIds', form.skillIds.filter((id) => skills.some((item) => item.id === id)))}>Remove unavailable bindings</Button></p>}</fieldset>
        <label className="profile-enabled"><input type="checkbox" checked={form.canDelegate} onChange={(e) => update('canDelegate', e.target.checked)} />Allow goal delegation to specialists</label><p className="quiet-note">Adds Delegate goal in this agent’s chat. Specialists retain the goal’s project and existing permissions.</p><label className="profile-enabled"><input type="checkbox" checked={form.archived} onChange={(e) => update('archived', e.target.checked)} />Archive this profile</label><label className="profile-enabled"><input type="checkbox" checked={form.enabled} onChange={(e) => update('enabled', e.target.checked)} />Enable this profile</label><p className="resource-footnote">Role instructions cannot grant project write access, approve images, change billing, or bypass Mari’s workflow rules.</p><div className="form-actions"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!!busy || !form.name.trim() || !form.instructions.trim()}><Check size={14} />Save profile</Button></div>
      </form></Panel>}</div>
    </>}
    <Dialog open={!!remove} onOpenChange={(open) => !open && setRemove(null)}><DialogContent className="mari-dialog"><DialogHeader><DialogTitle>Remove {remove?.name}?</DialogTitle><DialogDescription>This removes the configured profile. Existing task history and captured job instructions remain.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRemove(null)}>Cancel</Button><Button variant="destructive" disabled={!!busy} onClick={async () => { try { await mutate(`/agent-profiles/${remove.id}`, {}, 'DELETE'); setRemove(null); await load(); } catch {} }}>Remove profile</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
