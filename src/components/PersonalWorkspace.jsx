import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, ExternalLink, ListTodo, Mail, Newspaper, Pencil, Plus, RefreshCw, Search, Trash2, Unplug, Utensils, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { request, human } from '@/lib/api';
import './personal-workspace.css';

const PIXELPOP = '/personal/pixelpop';
const TIME_ZONE = 'Asia/Manila';
const ACTIVE_JOBS = ['queued', 'running'];
const GOALS = [
  ['daily_target_kcal', 'Calories', 'kcal'],
  ['daily_target_protein_g', 'Protein', 'g'],
  ['daily_target_carbs_g', 'Carbohydrates', 'g'],
  ['daily_target_fat_g', 'Fat', 'g'],
];
const emptyTask = () => ({ title: '', priority: 'medium', important: false, due_date: '', due_time: '', notes: '' });
const emptyFood = () => ({ name: '', amount: '1', unit: 'serving', calories: '', protein: '', carbs: '', fat: '' });

function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function dateLabel(value, options = {}) {
  if (!value) return 'Not available';
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00+08:00` : value);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', ...options }).format(parsed);
}
function timestamp(value) { return dateLabel(value, { hour: 'numeric', minute: '2-digit' }); }
function number(value, suffix = '') {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Not logged';
  return `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(Number(value))}${suffix}`;
}
function errorText(error) { return typeof error === 'string' ? error : error?.message || 'The request could not be completed. Try again.'; }
function safeLink(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function SourceLink({ href, children }) { const url = safeLink(href); return url ? <a href={url} target="_blank" rel="noreferrer">{children}<ExternalLink size={12} /></a> : <span>{children}</span>; }

// Each source has one request at a time. A changed query/date or unmount aborts it,
// and a previous response can never overwrite the new source's state.
function useRemote(path, enabled = true, polling = false) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ path: null, data: null, loading: false, error: '', updatedAt: null });
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer;
    const controller = new AbortController();
    async function read() {
      setState((previous) => ({ path, data: previous.path === path ? previous.data : null, updatedAt: previous.path === path ? previous.updatedAt : null, loading: true, error: '' }));
      let delay = 20000;
      try {
        const result = await request(path, { signal: controller.signal });
        if (disposed) return;
        delay = ACTIVE_JOBS.includes(result.job?.status) ? 3000 : 20000;
        setState({ path, data: result, loading: false, error: '', updatedAt: new Date().toISOString() });
      } catch (error) {
        if (disposed || error.name === 'AbortError') return;
        setState((previous) => ({ ...previous, path, loading: false, error: errorText(error) }));
      }
      if (!disposed && polling) timer = window.setTimeout(read, delay);
    }
    read();
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [path, enabled, polling, revision]);
  return { ...(state.path === path && enabled ? state : { data: null, loading: enabled, error: '', updatedAt: null }), reload };
}

function InlineError({ error, onRetry }) {
  if (!error) return null;
  return <div className="personal-error" role="alert"><span>{errorText(error)}</span>{onRetry && <Button type="button" size="sm" variant="outline" onClick={onRetry}>Try again</Button>}</div>;
}
function EmptyState({ title, children, action }) {
  return <div className="personal-empty"><strong>{title}</strong><p>{children}</p>{action}</div>;
}
function Loading({ label }) { return <div className="personal-loading" role="status"><span /> <span /> <p>{label}</p></div>; }
function Freshness({ resource, prefix = 'Loaded' }) {
  return resource.updatedAt && <p className="personal-freshness">{resource.error ? 'Showing the last loaded data · ' : ''}{prefix} {timestamp(resource.updatedAt)} · Manila time</p>;
}
function ConnectionBadge({ source }) {
  return <Badge variant="outline" className={`personal-state ${source?.callable || source?.connected ? 'is-connected' : ''}`}>{source?.status ? human(source.status) : 'Not checked'}</Badge>;
}
function SectionTitle({ icon: Icon, title, children, action }) {
  return <div className="personal-section-title"><div>{Icon && <Icon size={18} />}<h2>{title}</h2>{children}</div>{action}</div>;
}

function GoogleBrief({ source, pending, onAction, onConnections, workerOnline, agent }) {
  const content = source.data;
  const brief = content?.brief;
  const job = content?.job;
  const active = ACTIVE_JOBS.includes(job?.status);
  const inspecting = job?.type === 'personal.google.inspect';
  const mail = brief?.mail;
  const calendar = brief?.calendar;
  const stale = !!brief && (brief.stale || brief.date !== manilaToday() || !!source.error || ['failed', 'interrupted'].includes(job?.status));
  const mailItems = Array.isArray(mail?.items) ? mail.items : [];
  const events = Array.isArray(calendar?.events) ? calendar.events : [];
  return <section className="personal-panel personal-brief" aria-labelledby="personal-brief-title">
    <div className="personal-brief-heading"><div><h2 id="personal-brief-title">Email & calendar</h2><p>Your latest Google brief, available here when you ask for it.</p></div><div className="personal-actions">{active ? <Button size="sm" variant="outline" disabled={pending} onClick={() => onAction('cancel')}>Cancel refresh</Button> : <Button size="sm" disabled={pending || source.loading && !content} onClick={() => onAction('refresh')}><RefreshCw size={14} />{brief ? 'Refresh brief' : 'Create brief'}</Button>}</div></div>
    <InlineError error={source.error} onRetry={source.reload} />
    <InlineError error={content?.error} />
    {source.loading && !content ? <Loading label="Loading your saved Google brief…" /> : <>
      {active && <div className="personal-job" role="status"><RefreshCw size={15} /><span>{job.cancelRequested ? 'Cancellation requested' : job.status === 'queued' ? `${inspecting ? 'Connection check' : 'Brief'} queued` : inspecting ? 'Checking Google connections' : 'Reading your Google accounts'}{agent?.action ? ` · ${agent.action}` : ' · updates appear when the job finishes.'}</span></div>}
      {job && !active && <p className="personal-source-note">Latest {inspecting ? 'connection check' : 'brief'}: {human(job.status)}{job.finishedAt && <> · {timestamp(job.finishedAt)}</>}</p>}
      {job?.error && <InlineError error={job.error} />}
      {job && ['cancelled', 'interrupted', 'paused'].includes(job.status) && <p className="personal-source-note">The latest refresh is {human(job.status)}. {brief ? 'Your previous brief remains below.' : 'Refresh when you are ready to try again.'}</p>}
      {!brief ? <EmptyState title="Your day starts with the facts" action={<Button size="sm" variant="ghost" onClick={onConnections}>Review connections<ArrowRight size={14} /></Button>}>Create a brief to read recent email and today’s calendar using your connected Google accounts. {!workerOnline && 'A connected Mari worker is needed to run the brief.'} Nothing is fetched from your accounts automatically.</EmptyState> : <>
        <div className="personal-brief-meta"><span>{brief.generatedAt ? `Generated ${timestamp(brief.generatedAt)}` : 'Generation time unavailable'} · {brief.timeZone || TIME_ZONE}</span>{stale && <Badge variant="outline">Saved brief · may be out of date</Badge>}</div>
        {brief.summary && <p className="personal-brief-summary">{brief.summary}</p>}
        <div className="personal-google-columns"><section aria-labelledby="personal-mail-title"><div className="personal-source-heading"><h3 id="personal-mail-title"><Mail size={16} />Email</h3><span>{mail?.unreadCount != null ? `${mail.unreadCount} unread` : human(mail?.status || 'Not available')}</span></div>
          <InlineError error={mail?.error} />{mail?.stale && <p className="personal-source-note">Saved email{mail.cachedAt ? ` from ${timestamp(mail.cachedAt)}` : ''}. This source could not be refreshed.</p>}
          {mailItems.length ? <ul className="personal-mail-list">{mailItems.map((item, index) => <li key={item.id || index}><SourceLink href={item.url}><strong>{item.subject || '(No subject)'}</strong></SourceLink><span className="personal-item-meta">{item.from || 'Sender unavailable'}{item.receivedAt && <> · {timestamp(item.receivedAt)}</>}</span>{item.snippet && <p>{item.snippet}</p>}</li>)}</ul> : <p className="personal-source-empty">{['ready', 'ok', 'success'].includes(mail?.status) ? 'No email returned for this brief.' : 'Email content is unavailable in this brief.'}</p>}
          {mail?.truncated && <p className="personal-source-note">This brief includes a limited selection of email.</p>}
        </section><section aria-labelledby="personal-calendar-title"><div className="personal-source-heading"><h3 id="personal-calendar-title"><CalendarDays size={16} />Calendar</h3><span>{human(calendar?.status || 'Not available')}</span></div>
          <InlineError error={calendar?.error} />{calendar?.stale && <p className="personal-source-note">Saved calendar{calendar.cachedAt ? ` from ${timestamp(calendar.cachedAt)}` : ''}{calendar.sourceDate ? ` for ${dateLabel(calendar.sourceDate)}` : ''}. This source could not be refreshed.</p>}
          {events.length ? <ul className="personal-event-list">{events.map((event, index) => <li key={event.id || index}><time dateTime={typeof event.start === 'string' ? event.start : undefined}>{event.allDay ? 'All day' : event.start ? dateLabel(event.start, { hour: 'numeric', minute: '2-digit' }) : 'Time unavailable'}</time><div><SourceLink href={event.url}><strong>{event.title || 'Untitled event'}</strong></SourceLink>{event.end && !event.allDay && <span className="personal-item-meta">Until {dateLabel(event.end, { hour: 'numeric', minute: '2-digit' })}</span>}</div></li>)}</ul> : <p className="personal-source-empty">{['ready', 'ok', 'success'].includes(calendar?.status) ? 'No events returned for this day.' : 'Calendar content is unavailable in this brief.'}</p>}
          {calendar?.truncated && <p className="personal-source-note">More events may be available in Google Calendar.</p>}
        </section></div>
      </>}
    </>}
    <p className="personal-source-note">Read only · refreshes run only when requested. Connection checks do not read your email or calendar.</p>
  </section>;
}

function TaskForm({ task, pending, onSave, onCancel }) {
  const [form, setForm] = useState(() => task ? { ...emptyTask(), ...Object.fromEntries(Object.keys(emptyTask()).map((key) => [key, task[key] ?? emptyTask()[key]])) } : emptyTask());
  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  return <form className="personal-editor" onSubmit={async (event) => { event.preventDefault(); await onSave({ ...form, title: form.title.trim(), due_date: form.due_date || null, due_time: form.due_date && form.due_time ? form.due_time : null }); }}>
    <h3>{task ? 'Edit task' : 'Add a task'}</h3><label>Title<Input autoFocus required maxLength={160} value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="What needs your attention?" /></label>
    <div className="personal-form-row"><label>Priority<select value={form.priority} onChange={(event) => set('priority', event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Due date<Input type="date" value={form.due_date} onChange={(event) => set('due_date', event.target.value)} /></label><label>Due time<Input type="time" value={form.due_time} onChange={(event) => set('due_time', event.target.value)} disabled={!form.due_date} /></label></div>
    <label className="personal-checkbox"><input type="checkbox" checked={form.important} onChange={(event) => set('important', event.target.checked)} />Mark as important</label><label>Notes<Textarea rows={3} maxLength={4000} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label><div className="personal-actions"><Button type="submit" size="sm" disabled={pending || !form.title.trim()}>{pending ? 'Saving…' : task ? 'Save task' : 'Add task'}</Button><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
function TaskRows({ items, completed, compact, pending, onEdit, onComplete, onDelete }) {
  return <ul className="personal-task-list">{items.map((task) => <li key={task.id} className={completed ? 'is-completed' : ''}>{!completed && <Button size="icon" variant="outline" className="personal-task-check" aria-label={`Complete ${task.title}`} disabled={pending || !!task.system_key} title={task.system_key ? 'Complete this automatic reminder by logging its activity in Pixelpop.' : undefined} onClick={() => onComplete(task)}><Check size={15} /></Button>}{completed && <CheckCheck className="personal-completed-icon" size={18} />}<div className="personal-task-main"><strong>{task.title || 'Untitled task'}</strong><span className="personal-item-meta">{task.priority ? `${human(task.priority)} priority` : 'Priority unavailable'}{task.important && ' · Important'}{task.due_date && <> · Due {dateLabel(task.due_date)}{task.due_time ? ` at ${task.due_time.slice(0, 5)}` : ''}</>}</span>{!compact && task.notes && <p>{task.notes}</p>}</div>{!completed && !compact && <div className="personal-row-actions"><Button size="icon" variant="ghost" disabled={pending} aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)}><Pencil size={14} /></Button><Button size="icon" variant="ghost" disabled={pending || !!task.schedule} title={task.schedule ? 'Manage recurring task schedules in Pixelpop.' : undefined} aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)}><Trash2 size={14} /></Button></div>}</li>)}</ul>;
}
function Disconnected({ onConnections }) { return <EmptyState title="Connect Pixelpop to continue" action={<Button size="sm" variant="outline" onClick={onConnections}>Open connections<ArrowRight size={14} /></Button>}>Manage your tasks and nutrition in Mari using your Pixelpop account.</EmptyState>; }
function TasksPanel({ source, connected, compact = false, pending, filter, setFilter, query, setQuery, page, setPage, editor, setEditor, onSave, onComplete, onDelete, onConnections, onOpen }) {
  const items = source.data?.results || [];
  return <section className="personal-panel"><SectionTitle icon={ListTodo} title={compact ? 'Tasks to do' : 'Tasks'} action={connected && (compact ? <Button size="sm" variant="ghost" onClick={onOpen}>Manage tasks<ArrowRight size={13} /></Button> : <div className="personal-actions"><Button size="icon" variant="ghost" aria-label="Reload tasks" disabled={source.loading} onClick={source.reload}><RefreshCw size={14} /></Button><Button size="sm" onClick={() => setEditor({})} disabled={pending || !!editor}><Plus size={14} />Add task</Button></div>)} />
    {!connected ? <Disconnected onConnections={onConnections} /> : <>
      <p className="personal-source-note">Tasks belong to Pixelpop’s shared workspace.</p>
      {!compact && <div className="personal-task-filter"><div className="personal-filter-buttons" aria-label="Task status">{['pending', 'completed'].map((value) => <Button key={value} type="button" size="sm" variant={filter === value ? 'secondary' : 'ghost'} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); setEditor(null); }}>{human(value)}</Button>)}</div><label className="personal-search"><Search size={15} /><Input value={query} aria-label="Search Pixelpop tasks" placeholder="Search tasks…" onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label></div>}
      {editor && !compact && <TaskForm key={editor.id || 'new'} task={editor.id ? editor : null} pending={pending} onSave={onSave} onCancel={() => setEditor(null)} />}
      <InlineError error={source.error} onRetry={source.reload} />
      {source.loading && !source.data ? <Loading label="Loading tasks…" /> : items.length ? <TaskRows items={compact ? items.slice(0, 5) : items} completed={!compact && filter === 'completed'} compact={compact} pending={pending} onEdit={setEditor} onComplete={onComplete} onDelete={onDelete} /> : !source.error && <EmptyState title={query && !compact ? 'No matching tasks' : !compact && filter === 'completed' ? 'No completed tasks yet' : 'Your task list is clear'}>{query && !compact ? 'Try another search or clear the search field.' : !compact && filter === 'completed' ? 'Tasks appear here after you mark them complete.' : 'Add a task when something needs doing.'}</EmptyState>}
      {!compact && <div className="personal-pagination"><span>{source.data?.count != null ? `${source.data.count} task${source.data.count === 1 ? '' : 's'}` : 'Count unavailable'}</span><div><Button size="sm" variant="outline" disabled={page === 1 || source.loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} />Previous</Button><span>Page {page}</span><Button size="sm" variant="outline" disabled={!source.data?.hasNext || source.loading} onClick={() => setPage(source.data.nextPage || page + 1)}>Next<ChevronRight size={14} /></Button></div></div>}
      <Freshness resource={source} />
    </>}
  </section>;
}

function NutritionTotals({ payload, compact = false }) {
  const totals = payload?.summary?.day_totals;
  const profile = payload?.profile;
  return <dl className={`personal-nutrition-totals ${compact ? 'is-compact' : ''}`}>{[['calories', 'Calories', ' kcal', 'daily_target_kcal'], ['protein', 'Protein', ' g', 'daily_target_protein_g'], ['carbs', 'Carbs', ' g', 'daily_target_carbs_g'], ['fat', 'Fat', ' g', 'daily_target_fat_g']].map(([key, label, suffix, goal]) => <div key={key}><dt>{label}</dt><dd>{number(totals?.[key], suffix)}</dd>{profile?.[goal] != null && <span>Goal {number(profile[goal], suffix)}</span>}</div>)}</dl>;
}
function MealForm({ meal, date, pending, onSave, onCancel }) {
  const requestId = useRef(crypto.randomUUID());
  const [name, setName] = useState(meal?.meal_name || '');
  const [items, setItems] = useState(() => meal?.items?.length ? meal.items.map((item) => Object.fromEntries(Object.keys(emptyFood()).map((key) => [key, item[key] == null ? '' : String(item[key])]))) : [emptyFood()]);
  const update = (index, key, value) => setItems((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  return <form className="personal-editor personal-meal-editor" onSubmit={async (event) => { event.preventDefault(); await onSave({ date, meal_name: name.trim(), ...(!meal ? { datetime: null, request_id: requestId.current } : {}), items: items.map((item) => ({ ...item, name: item.name.trim(), unit: item.unit.trim(), ...Object.fromEntries(['amount', 'calories', 'protein', 'carbs', 'fat'].map((key) => [key, Number(item[key])])) })) }); }}>
    <h3>{meal ? 'Edit meal' : 'Log a meal'}</h3><label>Meal name<Input required autoFocus maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="Breakfast, lunch, a snack…" /></label>
    {items.map((item, index) => <fieldset key={index} className="personal-food-row"><legend>Food {index + 1}</legend><div className="personal-food-heading"><label>Food name<Input required maxLength={160} value={item.name} onChange={(event) => update(index, 'name', event.target.value)} placeholder="e.g. Cooked rice" /></label><Button type="button" size="icon" variant="ghost" disabled={pending || items.length === 1} aria-label={`Remove food ${index + 1}`} onClick={() => setItems((previous) => previous.filter((_, itemIndex) => index !== itemIndex))}><X size={15} /></Button></div><div className="personal-food-values"><label>Amount<Input type="number" required min="0.001" max="999999999.999" step="0.001" value={item.amount} onChange={(event) => update(index, 'amount', event.target.value)} /></label><label>Unit<Input required maxLength={24} value={item.unit} onChange={(event) => update(index, 'unit', event.target.value)} /></label>{[['calories', 'Calories (kcal)'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)']].map(([key, label]) => <label key={key}>{label}<Input type="number" required min="0" max="99999999.99" step="0.01" value={item[key]} onChange={(event) => update(index, key, event.target.value)} /></label>)}</div></fieldset>)}
    <p className="personal-source-note">Enter nutrition for each listed amount. Saving an edit keeps every food row shown here.</p><div className="personal-actions"><Button type="button" size="sm" variant="outline" disabled={pending || items.length >= 100} onClick={() => setItems((previous) => [...previous, emptyFood()])}><Plus size={14} />Add food</Button><Button type="submit" size="sm" disabled={pending || !name.trim()}>{pending ? 'Saving…' : meal ? 'Save meal' : 'Log meal'}</Button><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button></div>
  </form>;
}
function GoalForm({ profile, pending, onSave, onCancel }) {
  const [values, setValues] = useState(() => Object.fromEntries(GOALS.map(([key]) => [key, profile?.[key] ?? ''])));
  return <form className="personal-editor" onSubmit={async (event) => { event.preventDefault(); await onSave(Object.fromEntries(GOALS.map(([key]) => [key, values[key] === '' ? null : Number(values[key])]))); }}><h3>Daily nutrition goals</h3><p className="personal-source-note">Set your own targets. Leave a field blank to clear its goal.</p><div className="personal-goal-fields">{GOALS.map(([key, label, unit]) => <label key={key}>{label} ({unit})<Input type="number" min="0.01" max="999999.99" step="0.01" value={values[key]} onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))} /></label>)}</div><div className="personal-actions"><Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save goals'}</Button><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button></div></form>;
}
function WeightForm({ weight, date, pending, onSave, onCancel }) {
  const [value, setValue] = useState(weight?.weight_kg || '');
  const [note, setNote] = useState(weight?.note || '');
  return <form className="personal-editor" onSubmit={async (event) => { event.preventDefault(); await onSave({ weight_kg: Number(value), note }); }}><h3>Weight for {dateLabel(date)}</h3><div className="personal-form-row"><label>Weight (kg)<Input type="number" required min="0.01" max="9999.99" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} autoFocus /></label><label>Note<Input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label></div><div className="personal-actions"><Button size="sm" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save weight'}</Button><Button size="sm" variant="ghost" type="button" disabled={pending} onClick={onCancel}>Cancel</Button></div></form>;
}
function NutritionPanel({ source, connected, compact = false, pending, date, setDate, mealEditor, setMealEditor, goalsOpen, setGoalsOpen, weightOpen, setWeightOpen, onSaveMeal, onSaveGoals, onSaveWeight, onDelete, onConnections, onOpen }) {
  const payload = source.data;
  const meals = Array.isArray(payload?.meals) ? payload.meals : [];
  const weights = Array.isArray(payload?.weights) ? payload.weights : [];
  const weight = weights.find((entry) => entry.date === date);
  return <section className="personal-panel"><SectionTitle icon={Utensils} title="Nutrition" action={connected && (compact ? <Button size="sm" variant="ghost" onClick={onOpen}>Open nutrition<ArrowRight size={13} /></Button> : <div className="personal-actions"><Button size="icon" variant="ghost" disabled={source.loading} aria-label="Reload nutrition" onClick={source.reload}><RefreshCw size={14} /></Button><Button size="sm" onClick={() => setMealEditor({})} disabled={pending || !!mealEditor}><Plus size={14} />Log meal</Button></div>)} />
    {!connected ? <Disconnected onConnections={onConnections} /> : <>
      {!compact ? <div className="personal-nutrition-toolbar"><label>Date<Input type="date" required max={manilaToday()} value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setMealEditor(null); setWeightOpen(false); } }} /></label><p>Your personal Pixelpop nutrition log · Manila dates</p></div> : <p className="personal-source-note">{dateLabel(date)} · Personal Pixelpop log</p>}
      <InlineError error={source.error} onRetry={source.reload} />
      {source.loading && !payload ? <Loading label="Loading nutrition…" /> : payload && <><NutritionTotals payload={payload} compact={compact} />
        {!compact && <>
          <div className="personal-nutrition-actions"><Button size="sm" variant="outline" disabled={pending || goalsOpen || !payload.profile} onClick={() => setGoalsOpen(true)}><Pencil size={13} />Edit goals</Button><Button size="sm" variant="outline" disabled={pending || weightOpen} onClick={() => setWeightOpen(true)}>{weight ? 'Edit weight' : 'Log weight'}</Button>{weight && <span>Weight {number(weight.weight_kg, ' kg')}</span>}</div>
          {!payload.profile && <p className="personal-source-note">No nutrition profile is available. Create one in Pixelpop before editing goals here.</p>}
          {goalsOpen && payload.profile && <GoalForm profile={payload.profile} pending={pending} onSave={onSaveGoals} onCancel={() => setGoalsOpen(false)} />}
          {weightOpen && <WeightForm key={date} weight={weight} date={date} pending={pending} onSave={onSaveWeight} onCancel={() => setWeightOpen(false)} />}
          {mealEditor && <MealForm key={`${date}-${mealEditor.id || 'new'}`} meal={mealEditor.id ? mealEditor : null} date={date} pending={pending} onSave={onSaveMeal} onCancel={() => setMealEditor(null)} />}
          <div className="personal-meals-heading"><h3>Meals</h3><span>{meals.length} logged</span></div>{meals.length ? <ul className="personal-meal-list">{meals.map((meal) => <li key={meal.id}><div className="personal-meal-top"><div><strong>{meal.meal_name || 'Meal'}</strong><span className="personal-item-meta">{number(meal.totals?.calories, ' kcal')}{meal.datetime && <> · {dateLabel(meal.datetime, { hour: 'numeric', minute: '2-digit' })}</>}</span></div><div className="personal-row-actions"><Button variant="ghost" size="icon" disabled={pending || !!mealEditor} aria-label={`Edit ${meal.meal_name || 'meal'}`} onClick={() => setMealEditor(meal)}><Pencil size={14} /></Button><Button variant="ghost" size="icon" disabled={pending} aria-label={`Delete ${meal.meal_name || 'meal'}`} onClick={() => onDelete(meal)}><Trash2 size={14} /></Button></div></div><ul>{(meal.items || []).map((item, index) => <li key={index}><span>{item.name}</span><span>{item.amount} {item.unit} · {number(item.calories, ' kcal')}</span></li>)}</ul></li>)}</ul> : <EmptyState title="No meals logged for this date">Log a meal with its food amounts and nutrition to build your daily totals.</EmptyState>}
        </>}
      </>}
      <Freshness resource={source} />
    </>}
  </section>;
}

function ConnectionsPanel({ google, connection, pending, onGoogle, onConnect, onDisconnect }) {
  const [baseUrl, setBaseUrl] = useState('https://pixelpopup-backend.vercel.app');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const connected = connection.data?.connected;
  return <div className="personal-connections"><section className="personal-panel"><SectionTitle title="Google accounts" action={<Button size="sm" variant="outline" disabled={pending || ACTIVE_JOBS.includes(google.data?.job?.status)} onClick={() => onGoogle('inspect')}><RefreshCw size={14} />Check connections</Button>} /><p className="personal-connection-intro">Mari uses the Google accounts already connected to Codex through MCP. Manage account access in Codex’s app connections.</p><InlineError error={google.error} onRetry={google.reload} /><dl className="personal-connection-list">{[['gmail', 'Gmail', Mail], ['calendar', 'Google Calendar', CalendarDays]].map(([key, title, Icon]) => { const source = google.data?.connections?.[key]; return <div key={key}><dt><Icon size={18} /><strong>{title}</strong></dt><dd><ConnectionBadge source={source} /><span>{source?.callable ? 'Available to Mari' : 'Availability has not been confirmed'}</span>{source?.lastCheckedAt && <small>Checked {timestamp(source.lastCheckedAt)}</small>}</dd></div>; })}</dl><p className="personal-source-note">Checking availability does not read messages or events. Use Create brief on Overview when you want a summary.</p></section>
    <section className="personal-panel"><SectionTitle title="Pixelpop" action={connected && <Button size="sm" variant="outline" disabled={pending} onClick={onDisconnect}><Unplug size={14} />Disconnect</Button>} /><InlineError error={connection.error || connection.data?.error} onRetry={connection.reload} />{connection.loading && !connection.data ? <Loading label="Checking Pixelpop connection…" /> : connected ? <><div className="personal-connected-account"><Badge variant="outline" className="personal-state is-connected">{human(connection.data.status || 'Connected')}</Badge><strong>{connection.data.user?.name || connection.data.user?.email || 'Pixelpop account'}</strong>{connection.data.user?.name && connection.data.user?.email && <span>{connection.data.user.email}</span>}</div><p className="personal-source-note">{connection.data.baseUrl}</p><p className="personal-connection-intro">Your tasks use Pixelpop’s shared workspace. Nutrition and weight entries belong to your signed-in user.</p><Freshness resource={connection} prefix="Connection checked" /></> : <><p className="personal-connection-intro">Connect your account to view and manage tasks, meals, nutrition goals, and weight inside Mari.</p><form className="personal-editor personal-connect-form" onSubmit={async (event) => { event.preventDefault(); try { await onConnect({ baseUrl: baseUrl.trim(), username: username.trim(), password }); } finally { setPassword(''); } }}><label>Pixelpop backend URL<Input required type="url" maxLength={2000} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} autoComplete="url" /></label><label>Username<Input required maxLength={150} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>Password<Input required type="password" maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><div className="personal-actions"><Button type="submit" size="sm" disabled={pending || !username.trim() || !password}>{pending ? 'Connecting…' : 'Connect Pixelpop'}</Button><Button type="button" size="sm" variant="ghost" disabled={connection.loading || pending} onClick={connection.reload}>Check saved connection</Button></div><p className="personal-source-note">Credentials go to Mari’s local backend. Mari keeps an isolated session and does not save your password.</p></form></>}</section>
  </div>;
}

export function PersonalWorkspace({ data, mutate, busy, onClose, onNewspaper }) {
  const [tab, setTab] = useState('overview');
  const [date, setDate] = useState(manilaToday);
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [taskEditor, setTaskEditor] = useState(null);
  const [mealEditor, setMealEditor] = useState(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [action, setAction] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250); return () => window.clearTimeout(timer); }, [query]);
  const google = useRemote('/personal/google', true, true);
  const connection = useRemote(`${PIXELPOP}/connection`);
  const connected = connection.data?.connected === true;
  const taskQuery = new URLSearchParams({ status: tab === 'overview' ? 'pending' : filter, q: tab === 'overview' ? '' : debouncedQuery, page: String(tab === 'overview' ? 1 : page) });
  const tasks = useRemote(`${PIXELPOP}/tasks?${taskQuery}`, connected && ['overview', 'tasks'].includes(tab));
  const nutrition = useRemote(`${PIXELPOP}/nutrition?${new URLSearchParams({ date })}`, connected && ['overview', 'nutrition'].includes(tab));
  const pending = !!action || !!busy;
  const workerOnline = data?.workers?.some((worker) => worker.status === 'online');
  const transact = async (path, body, method = 'POST', message = '') => {
    if (action || busy) return false;
    setAction(path); setError(''); setNotice('');
    try { await mutate(path, body, method); if (!mounted.current) return false; if (message) setNotice(message); return true; }
    catch (failure) { if (mounted.current) setError(errorText(failure)); return false; }
    finally { if (mounted.current) setAction(''); }
  };
  const googleAction = async (name) => { if (await transact(`/personal/google/${name}`, {}, 'POST', name === 'inspect' ? 'Google connection check requested.' : name === 'cancel' ? 'Cancellation requested.' : 'Google brief requested.')) google.reload(); };
  const saveTask = async (payload) => { const id = taskEditor?.id; if (await transact(`${PIXELPOP}/tasks${id ? `/${encodeURIComponent(id)}` : ''}`, payload, id ? 'PATCH' : 'POST', id ? 'Task saved.' : 'Task added.')) { setTaskEditor(null); tasks.reload(); } };
  const completeTask = async (task) => { if (await transact(`${PIXELPOP}/tasks/${encodeURIComponent(task.id)}/complete`, {}, 'POST', 'Task completed.')) tasks.reload(); };
  const saveMeal = async (payload) => { const id = mealEditor?.id; if (await transact(`${PIXELPOP}/nutrition/meals${id ? `/${encodeURIComponent(id)}` : ''}`, payload, id ? 'PATCH' : 'POST', id ? 'Meal saved.' : 'Meal logged.')) { setMealEditor(null); nutrition.reload(); } };
  const saveGoals = async (payload) => { if (await transact(`${PIXELPOP}/nutrition/profile`, payload, 'PATCH', 'Nutrition goals saved.')) { setGoalsOpen(false); nutrition.reload(); } };
  const saveWeight = async (payload) => { if (await transact(`${PIXELPOP}/nutrition/weights/${date}`, payload, 'PUT', 'Weight saved.')) { setWeightOpen(false); nutrition.reload(); } };
  const disconnect = async () => { if (await transact(`${PIXELPOP}/connection`, undefined, 'DELETE', 'Pixelpop disconnected.')) { connection.reload(); setTaskEditor(null); setMealEditor(null); } };
  const confirmDelete = async () => {
    if (!confirmation) return;
    const { kind, item } = confirmation;
    const path = kind === 'task' ? `${PIXELPOP}/tasks/${encodeURIComponent(item.id)}` : `${PIXELPOP}/nutrition/meals/${encodeURIComponent(item.id)}`;
    if (await transact(path, undefined, 'DELETE', `${kind === 'task' ? 'Task' : 'Meal'} deleted.`)) { setConfirmation(null); if (kind === 'task') { if (taskEditor?.id === item.id) setTaskEditor(null); tasks.reload(); } else { if (mealEditor?.id === item.id) setMealEditor(null); nutrition.reload(); } }
  };
  const openConnections = () => setTab('connections');
  const taskProps = { source: tasks, connected, pending, filter, setFilter, query, setQuery, page, setPage, editor: taskEditor, setEditor: setTaskEditor, onSave: saveTask, onComplete: completeTask, onDelete: (item) => setConfirmation({ kind: 'task', item }), onConnections: openConnections, onOpen: () => setTab('tasks') };
  const nutritionProps = { source: nutrition, connected, pending, date, setDate, mealEditor, setMealEditor, goalsOpen, setGoalsOpen, weightOpen, setWeightOpen, onSaveMeal: saveMeal, onSaveGoals: saveGoals, onSaveWeight: saveWeight, onDelete: (item) => setConfirmation({ kind: 'meal', item }), onConnections: openConnections, onOpen: () => setTab('nutrition') };
  return <section className="personal-workspace" aria-labelledby="personal-workspace-title"><header className="personal-heading"><div><h1 id="personal-workspace-title">Today</h1><p>{dateLabel(manilaToday(), { weekday: 'long', year: 'numeric' })} <span>· Manila</span></p></div><Button size="sm" variant="outline" onClick={onClose}><ArrowLeft size={14} />Back to workspace</Button></header>
    {notice && <div className="personal-notice" role="status"><Check size={15} /><span>{notice}</span><Button size="icon" variant="ghost" aria-label="Dismiss personal workspace notice" onClick={() => setNotice('')}><X size={14} /></Button></div>}
    <InlineError error={error} />
    <Tabs value={tab} onValueChange={setTab} className="personal-tabs"><TabsList variant="line" aria-label="Personal workspace"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger><TabsTrigger value="nutrition">Nutrition</TabsTrigger><TabsTrigger value="connections">Connections</TabsTrigger></TabsList>
      <TabsContent value="overview">{onNewspaper && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-[18px] mb-[18px]"><p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">A two-page morning edition: news, games and crypto.</p><Button size="sm" variant="outline" onClick={onNewspaper}><Newspaper size={15} />Open newspaper</Button></div>}<GoogleBrief source={google} pending={pending} onAction={googleAction} onConnections={openConnections} workerOnline={workerOnline} agent={data?.agents?.find((agent) => agent.id === google.data?.job?.agentId)} /><div className="personal-overview-secondary"><TasksPanel {...taskProps} compact /><NutritionPanel {...nutritionProps} compact /></div></TabsContent>
      <TabsContent value="tasks"><TasksPanel {...taskProps} /></TabsContent>
      <TabsContent value="nutrition"><NutritionPanel {...nutritionProps} /></TabsContent>
      <TabsContent value="connections"><ConnectionsPanel google={google} connection={connection} pending={pending} onGoogle={googleAction} onConnect={async (payload) => { if (await transact(`${PIXELPOP}/connect`, payload, 'POST', 'Pixelpop connected.')) connection.reload(); }} onDisconnect={disconnect} /></TabsContent>
    </Tabs>
    <Dialog open={!!confirmation} onOpenChange={(open) => { if (!open && !action) setConfirmation(null); }}><DialogContent className="personal-delete-dialog"><DialogHeader><DialogTitle>Delete {confirmation?.kind === 'task' ? 'task' : 'meal'}?</DialogTitle><DialogDescription>{confirmation?.kind === 'task' ? `“${confirmation.item.title || 'Untitled task'}” will be removed from Pixelpop’s shared workspace.` : `“${confirmation?.item.meal_name || 'Meal'}” and its food entries will be removed from your nutrition log.`} This cannot be undone.</DialogDescription></DialogHeader><InlineError error={error} /><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setConfirmation(null)}>Keep {confirmation?.kind}</Button><Button variant="destructive" disabled={pending} onClick={confirmDelete}>{action ? 'Deleting…' : `Delete ${confirmation?.kind || ''}`}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
