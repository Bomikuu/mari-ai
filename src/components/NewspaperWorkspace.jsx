import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock3, Download, LoaderCircle, Newspaper, Printer, RefreshCw, Square, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, Status } from '@/components/Primitives';
import { artifactUrl, human, request, time } from '@/lib/api';
import { newspaperPages, newspaperDate, newspaperSourceHost, newspaperAvailability, safeNewspaperUrl, marketPrice, marketChange } from '../../shared/newspaper-layout.js';
import './newspaper-workspace.css';
import { BroadsheetPaper } from './BroadsheetPaper';
import {NewspaperBriefing,NewspaperPersonalPreferences} from './NewspaperBriefing';

const ACTIVE = ['queued', 'running'];
function manilaToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

function useEdition(editionId) {
  const [revision, setRevision] = useState(0), [state, setState] = useState({ key: null, content: null, loading: true, error: '' });
  const path = `/personal/newspaper${editionId ? `?editionId=${encodeURIComponent(editionId)}` : ''}`;
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let disposed = false, timer; const controller = new AbortController();
    async function read() {
      let delay = 20000;
      try {
        const content = await request(path, { signal: controller.signal });
        if (!disposed) setState({ key: path, content, loading: false, error: '' });
        delay = ACTIVE.includes(content.job?.status) ? 2000 : 20000;
      } catch (error) {
        if (!disposed && error.name !== 'AbortError') setState((previous) => ({ key: path, content: previous.key === path ? previous.content : null, loading: false, error: error.message }));
      }
      if (!disposed) timer = window.setTimeout(read, delay);
    }
    read(); return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [path, revision]);
  return { ...(state.key === path ? state : { content: null, loading: true, error: '' }), reload };
}

function Story({ story, lead = false }) {
  const url = safeNewspaperUrl(story.url);
  return <article className={`newspaper-story ${lead ? 'newspaper-story--lead' : ''}`}>
    <h4>{url ? <a href={url} target="_blank" rel="noreferrer">{story.title}</a> : story.title}</h4>
    <p className="newspaper-byline">{story.sourceName} <span>·</span> {story.latestKnown ? 'Latest known update · ' : ''}<time dateTime={story.publishedAt}>{newspaperDate(story.publishedAt)}</time></p>
    <p className="newspaper-story-copy">{story.summary}</p>
    {story.image?.artifactId && <figure className="newspaper-reading-image"><img src={`/api/artifacts/${encodeURIComponent(story.image.artifactId)}/content`} alt={`Publisher image for: ${story.title}`} /><figcaption>{story.image.credit}</figcaption></figure>}
    {url && <a className="newspaper-story-source" href={url} target="_blank" rel="noreferrer">{newspaperSourceHost(url)}</a>}
  </article>;
}

function MarketWatch({ market }) {
  const items = market?.status === 'ready' ? market.items || [] : [];
  const oldest = items.map((item) => item.updatedAt).filter((value) => value && !Number.isNaN(Date.parse(value))).sort()[0];
  return <section className="newspaper-market" aria-label="Market watch"><h3>Market watch</h3>
    {items.length ? <><table><thead><tr><th scope="col">Asset</th><th scope="col">USD</th><th scope="col">PHP</th><th scope="col">24h change</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><th scope="row">{item.symbol.toUpperCase()}</th><td>{marketPrice(item.usd)}</td><td>{marketPrice(item.php, 'PHP')}</td><td>{marketChange(item.change24h)}</td></tr>)}</tbody></table><p className="newspaper-market-time">CoinGecko · {newspaperDate(oldest || market.fetchedAt, { time: true })} Manila · saved snapshot</p></> : <p className="newspaper-section-empty">Market prices are unavailable for this edition. No replacement values have been estimated.</p>}
    <p className="newspaper-market-note">24h change is measured in USD. Quotes are frozen for this edition.</p>
  </section>;
}

function NewspaperSpread({ edition }) {
  if (edition.printPlan?.version === 'compact-broadsheet-v2') return <BroadsheetPaper edition={edition}><header><h2>Mari Daily</h2><p>{newspaperDate(edition.date, { weekday: true })} · {newspaperAvailability(edition)}</p></header><NewspaperBriefing personal={edition.personal}/>{edition.stories.map((story) => <Story key={story.id} story={story} />)}<MarketWatch market={edition.market} /></BroadsheetPaper>;
  return <div className="newspaper-spread" aria-label={`Mari Daily, ${newspaperDate(edition.date)}, two pages`}>
    {newspaperPages(edition).map((page) => <section key={page.number} className={`newspaper-page newspaper-page--${page.number} ${page.compact ? 'newspaper-page--compact' : ''}`} aria-label={`Newspaper page ${page.number} of 2`}>
      <header className="newspaper-masthead"><h2>MARI DAILY</h2><div><time dateTime={edition.date}>{newspaperDate(edition.date, { weekday: true })}</time><span>MANILA · {page.number} / 2</span></div></header>
      {page.lead && <div className="newspaper-lead"><Story story={page.lead} lead /></div>}
      <div className="newspaper-columns">{page.columns.map((column, index) => <div className="newspaper-column" key={index}>{column.map((section) => <section className={`newspaper-section newspaper-section--${section.id}`} key={section.id} aria-label={section.title}><h3>{section.title}</h3>{section.stories.length ? section.stories.map((story) => <Story key={story.id} story={story} />) : <p className="newspaper-section-empty">No current items were returned for this section. Check the source details for coverage.</p>}</section>)}</div>)}</div>
      {page.number === 2 ? <MarketWatch market={edition.market} /> : <p className="newspaper-edition-note">{newspaperAvailability(edition)}</p>}
      <footer className="newspaper-page-footer"><span>Prepared {newspaperDate(edition.generatedAt, { time: true })} Manila</span><strong>MARI DAILY · {page.number}</strong></footer>
    </section>)}
  </div>;
}

function ErrorMessage({ error }) { return error ? <p className="newspaper-error" role="alert">{error}</p> : null; }

export function NewspaperWorkspace({ data, mutate, busy, onClose }) {
  const [editionId, setEditionId] = useState(''), [action, setAction] = useState(''), [error, setError] = useState('');
  const remote = useEdition(editionId), content = remote.content, edition = content?.edition, job = content?.job;
  const active = ACTIVE.includes(job?.status), pending = !!busy || !!action;
  const online = data.workers.some((worker) => worker.status === 'online');
  const agent = data.agents.find((item) => item.id === job?.agentId);
  const events = data.events.filter((event) => event.data?.jobId === job?.id || job?.agentId && event.agentId === job.agentId).slice(-30);
  const schedule = content?.schedule;
  const pdf = edition?.pdfArtifact;
  useEffect(() => {
    const before = () => { if (edition) document.body.classList.add('print-newspaper'); };
    const after = () => document.body.classList.remove('print-newspaper');
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); after(); };
  }, [edition]);
  const transact = async (kind, body = {}) => {
    if (pending) return; setAction(kind); setError('');
    try { await mutate(`/personal/newspaper/${kind}`, body); if (kind === 'generate') setEditionId(''); remote.reload(); }
    catch (failure) { setError(failure.message); }
    finally { setAction(''); }
  };
  const savePreferences = async body => {setAction('preferences');setError('');try{await mutate('/personal/newspaper/preferences',body,'PUT');remote.reload();}catch(failure){setError(failure.message);throw failure;}finally{setAction('');}};
  const print = () => { document.body.classList.add('print-newspaper'); window.print(); };
  return <section className="newspaper-workspace" aria-labelledby="newspaper-title">
    <header className="newspaper-heading"><div><h1 id="newspaper-title">Daily newspaper</h1><p>News, games, markets and your day.</p></div><Button variant="outline" size="sm" onClick={onClose}><ArrowLeft size={14} />Workspace</Button></header>
    <div className="newspaper-controls"><div className="newspaper-edition-picker"><label><span>Saved edition</span><NativeSelect label="Saved newspaper edition" value={editionId} onChange={(event) => setEditionId(event.target.value)}><option value="">Latest edition</option>{(content?.editions || []).map((item) => <option key={item.id} value={item.id}>{newspaperDate(item.date)} · {newspaperDate(item.generatedAt, { time: true })}{item.status === 'partial' ? ' · partial coverage' : ''}</option>)}</NativeSelect></label></div><div className="newspaper-control-actions">
      {active ? <Button size="sm" variant="outline" disabled={pending || job.cancelRequested} onClick={() => transact('cancel', { jobId: job.id })}><Square size={14} />{job.cancelRequested ? 'Cancellation requested' : 'Cancel edition'}</Button> : <Button size="sm" disabled={pending || !online} onClick={() => transact('generate', { force: !!edition && edition.date === manilaToday() })}>{action === 'generate' ? <LoaderCircle size={14} className="busy-spin" /> : <RefreshCw size={14} />}{edition?.date === manilaToday() ? 'Regenerate today' : 'Generate today’s edition'}</Button>}
      <Button variant="outline" size="sm" disabled={!edition || pending} onClick={print}><Printer size={14} />Print</Button>
      {pdf ? <Button variant="outline" size="sm" asChild><a href={`${artifactUrl(pdf)}?download=1`} download><Download size={14} />Download PDF</a></Button> : <Button variant="outline" size="sm" disabled><Download size={14} />Download PDF</Button>}
    </div></div>
    <div className="newspaper-schedule"><Clock3 size={15} /><span>{schedule?.status === 'active' ? 'Scheduled daily · 7:00 AM Manila' : 'Daily schedule is not active'}</span>{schedule?.note && <p>{schedule.note}</p>}</div>
    <ErrorMessage error={error || remote.error} />
    {content&&<NewspaperPersonalPreferences preferences={content.preferences} accounts={content.xAccounts} onSave={savePreferences} pending={pending||active}/>}
    {!online && <p className="newspaper-notice">The local worker is offline. Start Mari’s worker to prepare a new edition; saved editions remain readable.</p>}
    {job && <section className="newspaper-job" aria-label="Newspaper execution"><div><strong>Daily edition</strong><Status value={job.status} label={active && job.cancelRequested ? 'Cancellation requested' : human(job.status)} compact />{job.finishedAt && <time dateTime={job.finishedAt}>{newspaperDate(job.finishedAt, { time: true })} Manila</time>}</div>{agent?.action && <p>{active ? '' : 'Last action: '}{agent.action}</p>}<ErrorMessage error={job.error} /><details><summary><Terminal size={14} />Execution details</summary><dl><div><dt>Job</dt><dd>{job.id}</dd></div>{agent && <div><dt>Executor</dt><dd>{agent.name} · {human(agent.status)}</dd></div>}</dl>{events.length ? <ol>{events.map((event) => <li key={event.id}><time dateTime={event.at}>{time(event.at)}</time><span>{event.message || human(event.type)}</span></li>)}</ol> : <p>Events appear when execution begins.</p>}</details></section>}
    {remote.loading && !content ? <p className="newspaper-loading" role="status"><LoaderCircle size={16} className="busy-spin" />Opening saved editions…</p> : edition ? <><div className="newspaper-view-note"><span>{newspaperDate(edition.date, { weekday: true })} · {edition.status === 'partial' ? 'Partial coverage' : 'Saved edition'}</span><span>{edition.pages || 2} A4 {(edition.pages || 2) === 1 ? 'page' : 'pages'} · {edition.personal?'Private edition · ':''}English · prices are saved snapshots</span></div><NewspaperSpread edition={edition} /></> : <div className="newspaper-empty"><Newspaper size={40} aria-hidden="true" /><h2>Your morning, on one front page</h2><p>Prepare today’s edition to read the latest available reporting, official game updates and a timestamped crypto watch. Each story keeps its source and publication date.</p><p>{schedule?.status === 'active' ? 'The next scheduled run prepares an edition when Codex and this computer are available.' : 'You can generate an edition now while the daily schedule is being set up.'}</p></div>}
    {edition && <details className="newspaper-source-details"><summary>Source details and coverage</summary><p>News covers the preceding 36 hours. Game and protocol sections can show an older latest known update, with its actual date. Unavailable sources leave partial coverage.</p><ul>{(edition.sources || []).map((source) => <li key={source.id}><div><strong>{source.name}</strong><Status value={source.status === 'ready' ? 'online' : source.status === 'empty' ? 'idle' : 'failed'} label={source.status === 'empty' ? 'No current items' : source.status === 'ready' ? 'Available' : 'Unavailable'} compact /></div><small>Checked {newspaperDate(source.fetchedAt, { time: true })} Manila{Number.isInteger(source.count) ? ` · ${source.count} items returned` : ''}</small>{source.error && <p>{source.error}</p>}</li>)}</ul></details>}
  </section>;
}
