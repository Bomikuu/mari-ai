import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Circle, CircleAlert, CircleDot, ExternalLink, Folder, GitBranch, GitCommitHorizontal, Github, GitPullRequest, Link2, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { elapsed, human, request } from '@/lib/api';
import './github-workspace.css';

const ACTIVE = ['queued', 'running'];
const ATTENTION = ['failure', 'failed', 'error', 'timed_out', 'action_required', 'cancelled', 'startup_failure'];
const LIMITS = { prs: 20, reviewRequests: 10, issues: 20, checks: 80 };

function errorText(value) { return typeof value === 'string' ? value : value?.message || 'The GitHub request could not be completed.'; }
function timestamp(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
}
function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.port ? `${url.origin}${url.pathname}` : null;
  } catch { return null; }
}
function SourceLink({ href, children, className }) {
  const url = safeLink(href);
  return url ? <a className={className} href={url} target="_blank" rel="noreferrer">{children}<ExternalLink size={13} aria-hidden="true" /></a> : <span className={className}>{children}</span>;
}

// GET only reads Mari's saved state. Repository content is read by an explicit
// refresh job. A new path immediately hides the previous project's response.
function useGithubState(path) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ path: null, data: null, loading: false, error: '' });
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const accept = useCallback((update) => setState((previous) => ({ path, loading: false, error: '', data: typeof update === 'function' ? update(previous.path === path ? previous.data : null) : update })), [path]);
  useEffect(() => {
    if (!path) return;
    let disposed = false;
    let timer;
    const controller = new AbortController();
    async function read() {
      setState((previous) => ({ path, data: previous.path === path ? previous.data : null, loading: true, error: '' }));
      let delay = 20000;
      try {
        const result = await request(path, { signal: controller.signal });
        if (disposed) return;
        delay = ACTIVE.includes(result.job?.status) ? 3000 : 20000;
        setState({ path, data: result, loading: false, error: '' });
      } catch (error) {
        if (disposed || error.name === 'AbortError') return;
        setState((previous) => ({ ...previous, loading: false, error: errorText(error) }));
      }
      if (!disposed) timer = window.setTimeout(read, delay);
    }
    read();
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [path, revision]);
  return { ...(path && state.path === path ? state : { data: null, loading: !!path, error: '' }), reload, accept };
}

function InlineError({ error, action, label = 'Try again', disabled }) {
  return error ? <div className="github-error" role="alert"><span>{errorText(error)}</span>{action && <Button size="sm" variant="outline" disabled={disabled} onClick={action}>{label}</Button>}</div> : null;
}
function EmptyState({ title, children, action }) {
  return <div className="github-empty"><strong>{title}</strong><p>{children}</p>{action}</div>;
}
function Loading() {
  return <div className="github-loading" role="status"><span /><span /><p>Loading this project’s saved GitHub state…</p></div>;
}
function LoadedCount({ source }) {
  return source && (source.status === 'ready' || source.items?.length > 0) ? <span className="github-tab-count" aria-label={`${source.items?.length || 0} loaded${source.truncated ? ', bounded result set' : ''}`}>{source.items?.length || 0}</span> : null;
}
function SourceFreshness({ source, snapshot }) {
  const at = source?.cachedAt || snapshot?.generatedAt;
  return at && <p className="github-freshness">{source?.stale || source?.status !== 'ready' ? 'Last available data' : 'Loaded'} <time dateTime={at}>{timestamp(at)}</time>{source?.truncated ? ' · Open GitHub for the full result set.' : ''}</p>;
}
function SourceStatus({ source, snapshot, children, emptyTitle, emptyText, onRefresh, pending, sourceKey }) {
  if (!source) return <EmptyState title="Load this repository’s activity">Refresh GitHub to read open pull requests, your review requests, issues, and checks for the local commit.</EmptyState>;
  const items = source.items || [];
  return <>
    {source.error && <InlineError error={source.error} action={onRefresh} label="Retry refresh" disabled={pending} />}
    {source.status !== 'ready' && !source.error && <p className="github-note">This source is {human(source.status || 'unavailable')}. Check the GitHub connection and repository access, then refresh.</p>}
    {source.stale && items.length > 0 && <p className="github-note">The latest read did not replace these previously loaded results.</p>}
    {items.length ? children : source.status === 'ready' ? <EmptyState title={emptyTitle}>{emptyText}</EmptyState> : null}
    <div className="github-source-footer"><p className="github-note">{source.status === 'ready' || items.length || source.cachedAt ? `${items.length} loaded` : 'No saved results'}{sourceKey !== 'checks' ? ` · Up to ${LIMITS[sourceKey]} per refresh` : ' · Up to 80 returned statuses and workflow runs'}{source.truncated ? ' · Results limited' : ''}</p><SourceFreshness source={source} snapshot={snapshot} /></div>
  </>;
}

function RepositoryEditor({ repository, detected, pending, value, setValue, onSave, onClear, onClose }) {
  return <form className="github-repository-editor" onSubmit={(event) => { event.preventDefault(); onSave(value.trim()); }}>
    <div className="github-section-heading"><h3>{repository ? 'Change repository' : 'Link a GitHub repository'}</h3>{repository && <Button type="button" variant="ghost" size="icon-sm" aria-label="Close repository settings" disabled={pending} onClick={onClose}><X size={15} /></Button>}</div>
    {detected.length > 0 && <div className="github-detected"><span>Detected Git remotes</span><div>{detected.map((item) => <Button key={`${item.remoteName || ''}:${item.fullName}`} type="button" variant="outline" size="sm" aria-pressed={value.toLowerCase() === item.fullName.toLowerCase()} disabled={pending} onClick={() => setValue(item.fullName)}>{item.remoteName && <span>{item.remoteName} · </span>}{item.fullName}</Button>)}</div></div>}
    <label htmlFor="github-repository">Repository name or GitHub URL<Input id="github-repository" value={value} onChange={(event) => setValue(event.target.value)} placeholder="owner/repository" required maxLength={260} autoComplete="off" disabled={pending} /></label>
    <p className="github-note">This link is saved for this local project. Refresh reads GitHub through the connected Codex plugin.</p>
    <div className="github-actions"><Button size="sm" type="submit" disabled={pending || !value.trim()}><Link2 size={14} />{pending ? 'Saving…' : 'Save repository link'}</Button>{repository?.source === 'manual' && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onClear}>Clear manual link</Button>}</div>
  </form>;
}

function PullRequestRows({ items }) {
  return <ul className="github-source-list">{items.map((item) => <li key={item.number}>
    <GitPullRequest size={18} className={`github-row-icon ${item.draft ? '' : 'is-open'}`} aria-hidden="true" />
    <div className="github-row-main"><SourceLink href={item.url} className="github-item-title">{item.title || `Pull request #${item.number}`}</SourceLink><div className="github-item-meta"><span>#{item.number}</span><Badge variant="outline">{item.draft ? 'Draft' : human(item.state || 'State unavailable')}</Badge><span>{item.author ? `by ${typeof item.author === 'string' ? item.author : item.author.login || 'Unknown author'}` : 'Author unavailable'}</span>{item.updatedAt && <span>Updated <time dateTime={item.updatedAt}>{timestamp(item.updatedAt)}</time></span>}</div></div>
  </li>)}</ul>;
}
function IssueRows({ items }) {
  return <ul className="github-source-list">{items.map((item) => <li key={item.number}>
    <CircleDot size={18} className="github-row-icon is-open" aria-hidden="true" />
    <div className="github-row-main"><SourceLink href={item.url} className="github-item-title">{item.title || `Issue #${item.number}`}</SourceLink><div className="github-item-meta"><span>#{item.number}</span><Badge variant="outline">{human(item.state || 'State unavailable')}</Badge><span>{item.author ? `by ${typeof item.author === 'string' ? item.author : item.author.login || 'Unknown author'}` : 'Author unavailable'}</span>{item.updatedAt && <span>Updated <time dateTime={item.updatedAt}>{timestamp(item.updatedAt)}</time></span>}</div></div>
  </li>)}</ul>;
}
function CheckRows({ items }) {
  return <ul className="github-source-list">{items.map((item, index) => {
    const result = String(item.conclusion || item.status || 'unknown').toLowerCase();
    const needsAttention = ATTENTION.includes(result);
    const succeeded = ['success', 'successful', 'passed'].includes(result);
    const Icon = needsAttention ? CircleAlert : succeeded ? Check : Circle;
    return <li key={`${item.name}:${item.url}:${index}`}><Icon size={18} className={`github-row-icon ${needsAttention ? 'is-failed' : succeeded ? 'is-open' : ''}`} aria-hidden="true" /><div className="github-row-main"><SourceLink href={item.url} className="github-item-title">{item.name || 'Unnamed check'}</SourceLink><div className="github-item-meta"><Badge variant="outline" className={needsAttention ? 'is-failed' : ''}>{human(item.status || 'Status unavailable')}</Badge>{item.conclusion && <span>{human(item.conclusion)}</span>}</div></div></li>;
  })}</ul>;
}
function JobStatus({ job, agent, worker, pending, onCancel }) {
  const [now, setNow] = useState(Date.now());
  const active = ACTIVE.includes(job?.status);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, job?.id]);
  if (!job) return null;
  const inspecting = job.type?.endsWith('.inspect');
  return <div className={`github-job ${active ? 'is-active' : ''}`}>
    <div role="status"><span className="github-job-title">{active && <RefreshCw size={14} className={job.status === 'running' ? 'busy-spin' : ''} />}<strong>{inspecting ? 'Connection check' : 'GitHub refresh'}</strong><Badge variant="outline">{active && job.cancelRequested ? 'Cancellation requested' : human(job.status)}</Badge><span>{elapsed(job.startedAt || job.createdAt, active ? now : job.finishedAt || now)}</span></span>{agent && <p>{agent.name}{agent.action ? ` · ${agent.action}` : ''}{worker?.name ? ` · ${worker.name}` : ''}</p>}{!active && job.finishedAt && <p>Finished <time dateTime={job.finishedAt}>{timestamp(job.finishedAt)}</time></p>}</div>
    {active && <Button size="sm" variant="outline" disabled={pending || job.cancelRequested} onClick={onCancel}>Cancel {inspecting ? 'check' : 'refresh'}</Button>}
  </div>;
}

export function GithubWorkspace({ project, data, mutate, busy, onClose, onAddProject }) {
  const path = project ? `/projects/${project.id}/github` : null;
  const remote = useGithubState(path);
  const content = remote.data;
  const repository = content?.repository;
  const snapshot = repository && content?.snapshot?.repository?.fullName?.toLowerCase() === repository.fullName.toLowerCase() ? content.snapshot : null;
  const [tab, setTab] = useState('prs');
  const [prScope, setPrScope] = useState('prs');
  const [checkScope, setCheckScope] = useState('attention');
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [repositoryInput, setRepositoryInput] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const endpointJob = content?.job;
  const job = data.jobs.find((item) => item.id === endpointJob?.id && item.projectId === project?.id) || endpointJob;
  const active = ACTIVE.includes(job?.status);
  const pending = !!pendingAction || !!busy;
  const agent = data.agents.find((item) => item.id === job?.agentId && item.projectId === project?.id);
  const worker = data.workers.find((item) => item.id === (agent?.workerId || job?.workerId));
  const connection = content?.connection;
  const connectionLabel = connection?.status === 'unknown' || !connection?.status ? 'Not checked' : human(connection.status);

  async function transact(suffix, payload = {}, method = 'POST') {
    if (!path || pending) return false;
    setPendingAction(suffix); setActionError(''); setNotice('');
    try {
      const result = await mutate(`${path}/${suffix}`, payload, method);
      if (!mounted.current) return false;
      if (Object.hasOwn(result, 'repository')) remote.accept(result);
      else if (result.job) remote.accept((previous) => ({ ...previous, job: result.job }));
      remote.reload();
      return true;
    } catch (error) {
      if (mounted.current) setActionError(errorText(error));
      return false;
    } finally { if (mounted.current) setPendingAction(''); }
  }
  const refreshGithub = () => transact('refresh');
  const changeTab = (value) => { setTab(value); setQuery(''); };
  const currentKey = tab === 'prs' ? prScope : tab;
  const source = snapshot?.[currentKey];
  const loaded = source?.items || [];
  const matches = loaded.filter((item) => `${item.title || item.name || ''} ${item.number || ''} ${typeof item.author === 'string' ? item.author : item.author?.login || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const visible = tab === 'checks' && checkScope === 'attention' ? matches.filter((item) => ATTENTION.includes(String(item.conclusion || item.status || '').toLowerCase())) : matches;

  return <section className="github-workspace" aria-labelledby="github-workspace-title">
    <div className="github-heading"><div><h1 id="github-workspace-title">GitHub</h1><p>{project ? <>Repository activity for <strong>{project.name}</strong></> : 'Connect repository activity to a local project.'}</p></div><Button size="sm" variant="ghost" onClick={onClose}><ArrowLeft size={15} />Command center</Button></div>
    {!project ? <div className="github-panel"><EmptyState title="Choose a local project" action={<Button size="sm" onClick={onAddProject}><Folder size={15} />Add or select project</Button>}>Use the project selector above, or add a local project. Mari detects its GitHub remote and keeps its activity in this workspace.</EmptyState></div> : <div className="github-panel">
      <InlineError error={remote.error} action={remote.reload} label="Reload saved state" />
      {remote.loading && !content ? <Loading /> : <>
        <div className="github-repository-heading"><div className="github-repository-identity"><Github size={23} aria-hidden="true" /><div><h2>{repository ? <SourceLink href={repository.url}>{repository.fullName}</SourceLink> : 'Link this project to GitHub'}</h2>{repository && <p>{repository.source === 'manual' ? 'Manual repository link' : `Detected from ${repository.remoteName || 'Git remote'}`}</p>}</div></div><div className="github-actions"><Button size="sm" variant="outline" disabled={pending || active} onClick={() => transact('inspect')}>Check connection</Button>{repository && <Button size="sm" disabled={pending || active} onClick={refreshGithub}><RefreshCw size={14} />Refresh GitHub</Button>}</div></div>
        <div className="github-context"><span><Badge variant="outline" className={connection?.callable ? 'is-connected' : ''}>{connectionLabel}</Badge>{connection?.lastCheckedAt && <span>Checked {timestamp(connection.lastCheckedAt)}</span>}</span>{content?.local?.branch && <span><GitBranch size={13} />{content.local.branch}</span>}{content?.local?.commit && <span title={content.local.commit}><GitCommitHorizontal size={14} /><code>{content.local.commit.slice(0, 8)}</code></span>}{snapshot?.generatedAt && <span>{snapshot.stale ? 'Partial snapshot' : 'Snapshot'} <time dateTime={snapshot.generatedAt}>{timestamp(snapshot.generatedAt)}</time></span>}{repository && <Button type="button" size="sm" variant="ghost" aria-expanded={editorOpen} onClick={() => { setEditorOpen(!editorOpen); if (!editorOpen) setRepositoryInput(repository.fullName); }}><Settings2 size={13} />Repository settings</Button>}</div>
        <p className="github-note github-read-scope">Read-only GitHub activity. Check connection verifies plugin availability; Refresh reads repository data.</p>
        <InlineError error={actionError} />
        <InlineError error={content?.error || connection?.error} />
        {notice && <p className="github-notice" role="status">{notice}</p>}
        <JobStatus job={job} agent={agent} worker={worker} pending={pending} onCancel={() => transact('cancel')} />
        {job?.error && <InlineError error={job.error} />}
        {(!repository || editorOpen) && <RepositoryEditor repository={repository} detected={content?.detectedRepositories || []} value={repositoryInput} setValue={setRepositoryInput} pending={pending || active} onClose={() => setEditorOpen(false)} onSave={async (value) => { if (await transact('repository', { repository: value }, 'PUT')) { setEditorOpen(false); setNotice('Repository link saved. Refresh GitHub to load its activity.'); } }} onClear={async () => { if (await transact('repository', {}, 'DELETE')) { setEditorOpen(false); setRepositoryInput(''); setNotice('Manual repository link cleared.'); } }} />}
        {repository && <Tabs className="github-tabs" value={tab} onValueChange={changeTab}>
          <TabsList variant="line" aria-label="Repository activity"><TabsTrigger value="prs"><GitPullRequest size={15} />Pull requests<LoadedCount source={snapshot?.prs} /></TabsTrigger><TabsTrigger value="issues"><CircleDot size={15} />Issues<LoadedCount source={snapshot?.issues} /></TabsTrigger><TabsTrigger value="checks"><CircleAlert size={15} />Checks<LoadedCount source={snapshot?.checks} /></TabsTrigger></TabsList>
          <div className="github-list-toolbar"><div className="github-filters" role="group" aria-label={tab === 'prs' ? 'Pull request view' : tab === 'checks' ? 'Check filter' : 'Issue view'}>{tab === 'prs' ? <>{[['prs', 'All open'], ['reviewRequests', 'Your review requests']].map(([value, label]) => <Button key={value} size="sm" variant={prScope === value ? 'secondary' : 'ghost'} aria-pressed={prScope === value} onClick={() => { setPrScope(value); setQuery(''); }}>{label}{value === 'reviewRequests' && <LoadedCount source={snapshot?.reviewRequests} />}</Button>)}</> : tab === 'checks' ? <>{[['attention', 'Needs attention'], ['all', 'All loaded checks']].map(([value, label]) => <Button key={value} size="sm" variant={checkScope === value ? 'secondary' : 'ghost'} aria-pressed={checkScope === value} onClick={() => setCheckScope(value)}>{label}</Button>)}</> : <h3>Open issues</h3>}</div><label className="github-search"><Search size={15} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter loaded results…" aria-label={`Filter loaded ${tab === 'prs' ? 'pull requests' : tab}`} disabled={!loaded.length && !query} /></label></div>
          {tab === 'checks' && <div className="github-coverage"><p>{source?.coverage || 'Checks are scoped to the local commit. Coverage has not been read yet.'}</p>{source?.commit && <span>Read for <code title={source.commit}>{source.commit.slice(0, 8)}</code>{source.branch ? ` on ${source.branch}` : ''}</span>}{source?.commit && content?.local?.commit && source.commit !== content.local.commit && <p className="github-previous-commit">These checks belong to an earlier local commit. Refresh GitHub to read the current commit.</p>}</div>}
          {tab === 'prs' && prScope === 'reviewRequests' && <p className="github-note github-review-note">Open pull requests requesting review from your connected GitHub account, scoped to this repository.</p>}
          {query && loaded.length > 0 && <p className="github-filter-summary">{visible.length} matching of {loaded.length} loaded</p>}
          {['prs', 'issues', 'checks'].map((value) => <TabsContent key={value} value={value}>
            <SourceStatus source={source} snapshot={snapshot} sourceKey={currentKey} pending={pending || active} onRefresh={refreshGithub} emptyTitle={tab === 'prs' ? prScope === 'reviewRequests' ? 'No review requests returned' : 'No open pull requests returned' : tab === 'issues' ? 'No open issues returned' : 'No checks returned'} emptyText={tab === 'checks' ? 'No statuses or workflow runs were returned within the coverage above.' : 'GitHub returned no results within this bounded read.'}>
              {visible.length ? tab === 'checks' ? <CheckRows items={visible} /> : tab === 'issues' ? <IssueRows items={visible} /> : <PullRequestRows items={visible} /> : <EmptyState title={query ? 'No matching loaded results' : 'No loaded checks need attention'}>{query ? 'Try another filter or clear the search field.' : 'This applies to the loaded results and coverage above. It does not establish that every GitHub check passed.'}</EmptyState>}
            </SourceStatus>
          </TabsContent>)}
        </Tabs>}
      </>}
    </div>}
  </section>;
}
