import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, Status } from './Primitives';
import { request } from '@/lib/api';

export const money = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? 'Unknown' : new Intl.NumberFormat('en-PH',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
export const count = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('en-PH',{maximumFractionDigits:8}).format(value);
export const sourceTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : 'Not checked';
export function useMarketResource(path, { poll = false } = {}) {
  const [revision,setRevision]=useState(0),[state,setState]=useState({path:null,data:null,error:'',loading:true});
  const reload=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{let stopped=false,timer;const controller=new AbortController();
    const read=async()=>{if(document.hidden){if(poll)timer=setTimeout(read,5000);return;}setState(s=>({path,data:s.path===path?s.data:null,error:'',loading:true}));try{const data=await request(path,{signal:controller.signal});if(!stopped)setState({path,data,error:'',loading:false});}catch(e){if(!stopped&&e.name!=='AbortError')setState(s=>({path,data:s.path===path?s.data:null,error:e.message,loading:false}));}if(!stopped&&poll)timer=setTimeout(read,typeof poll==='number'?poll:5000);};read();return()=>{stopped=true;controller.abort();clearTimeout(timer);};
  },[path,revision,poll]);
  return{...(state.path===path?state:{data:null,error:'',loading:true}),reload};
}
export function MarketError({children}) { return children ? <p className="market-error" role="alert">{children}</p> : null; }
export function AnalysisPanel({kind,selection,mutate,busy,revision}) {
  const resource=useMarketResource(`/personal/analysis/${kind}`,{poll:5000}),[config,setConfig]=useState(null),[model,setModel]=useState(''),[effort,setEffort]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[note,setNote]=useState('');
  useEffect(()=>{resource.reload();},[revision]);
  const available=config?.models.find(m=>m.id===model),job=resource.data?.job,active=['queued','running'].includes(job?.status);
  async function loadModels(){setLoading(true);setError('');try{const value=await request('/personal/analysis/models');setConfig(value);setModel(value.defaultModel);setEffort(value.defaultEffort);}catch(e){setError(e.message);}finally{setLoading(false);}}
  async function run(){setError('');setNote('');try{const result=await mutate(`/personal/analysis/${kind}`,{selection,model,effort});if(result?.reused)setNote('Reopened the saved result for these exact inputs; no new turn was queued.');resource.reload();}catch(e){setError(e.message);}}
  async function cancel(){try{await mutate(`/personal/analysis/${kind}/cancel`,{jobId:job.id});resource.reload();}catch(e){setError(e.message);}}
  const saved=resource.data?.results?.[0];
  return <section className="market-analysis">
    <div className="market-section-heading"><div><h2>{kind==='crypto'?'Investment review':'Selected-post summary'}</h2><p>{kind==='crypto'?'Review your evidence and risk profile before a decision.':'Summarize attributed claims from the selected cached posts.'} Runs only when you request it.</p></div>{!config&&<Button variant="outline" size="sm" onClick={loadModels} disabled={loading}>{loading?'Checking Codex…':'Load available models'}</Button>}</div>
    {config&&<><div className="market-analysis-controls"><label>Model<NativeSelect label="Analysis model" value={model} onChange={e=>{setModel(e.target.value);const m=config.models.find(m=>m.id===e.target.value);setEffort(m.efforts.includes('low')?'low':m.defaultEffort);}}>{config.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</NativeSelect></label><label>Reasoning<NativeSelect label="Analysis reasoning effort" value={effort} onChange={e=>setEffort(e.target.value)}>{available?.efforts.map(e=><option key={e} value={e}>{e}</option>)}</NativeSelect></label><Button size="sm" onClick={run} disabled={!!busy||active||!model||!effort||(kind==='x'&&!selection.postIds.length)}>{kind==='crypto'?'Analyze this snapshot':`Summarize ${selection.postIds.length} posts`}</Button></div><p className="market-note">One Codex turn · inherited service tier: {config.inheritedServiceTier} · no specialist delegation. Global settings stay separate.</p></>}
    <MarketError>{error||resource.error}</MarketError>{note&&<p className="market-note" role="status">{note}</p>}
    {job&&<div className="market-job"><Status value={job.status} compact/><span>{job.model} · {job.effort}{job.startedAt&&` · started ${sourceTime(job.startedAt)}`}</span>{active&&<Button variant="outline" size="sm" onClick={cancel} disabled={!!busy||job.cancelRequested}><Square size={12}/>{job.cancelRequested?'Cancelling…':'Cancel analysis'}</Button>}{job.error&&<MarketError>{job.error}</MarketError>}</div>}
    {saved?<div className="market-saved-analysis"><div className="market-result-byline"><strong>{saved.stale?'Saved analysis · inputs have changed':'Saved analysis'}</strong><span>{sourceTime(saved.generatedAt)} · {saved.model} / {saved.effort}</span></div><p className="market-prose">{saved.output.overview||saved.output.summary}</p>
      {saved.output.assessments?.map(a=><article className="market-assessment" key={a.asset}><h3>{a.asset}<span>{a.action.replaceAll('_',' ')}</span></h3><p>{a.reason}</p><dl><div><dt>Evidence</dt><dd>{a.evidence.map((e,i)=><p key={i}>{e.observation} <small>[{e.sourceId}]</small></p>)}</dd></div><div><dt>Opposing evidence</dt><dd>{a.opposingEvidence}</dd></div><div><dt>Downside</dt><dd>{a.downside}</dd></div><div><dt>Reconsider when</dt><dd>{a.invalidation}</dd></div></dl></article>)}
      {saved.output.items?.map(i=><p key={i.postId}><strong>Post {i.postId}</strong> · {i.takeaway}</p>)}
      {saved.output.limitations?.length>0&&<ul>{saved.output.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul>}
      <details><summary>Captured sources and usage</summary><ul>{saved.sources.map(s=><li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · {sourceTime(s.fetchedAt)}</li>)}</ul><p className="market-note">{saved.usage?`Codex reported ${count(saved.usage.inputTokens)} input and ${count(saved.usage.outputTokens)} output tokens. Total: ${count(saved.usage.totalTokens)}.`:'Codex did not report token usage for this saved result.'}</p></details>
    </div>:<p className="market-empty">{active?'The requested turn is in progress. Its result will appear here.':'No analysis saved yet. Charts, ledger calculations and feed refreshes run without AI.'}</p>}
  </section>;
}
