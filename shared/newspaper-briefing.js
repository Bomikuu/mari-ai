import {newspaperDate} from './newspaper-layout.js';
export const BRIEFING_SECTIONS={calendar:'Today’s schedule',mail:'Important mail',x:'From your X accounts'};
export const BRIEFING_PRINT_LIMITS={calendar:8,mail:3,x:3};
export function eventTime(event){
  if(event.allDay)return 'All day';
  const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const crossDay=day(event.start)!==day(event.end);
  const format=v=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',...(crossDay?{month:'short',day:'numeric'}:{})}).format(new Date(v));
  try{return `${format(event.start)} – ${format(event.end)}`;}catch{return 'Time unavailable';}
}
export function briefingMeta(kind,item){
  if(kind==='calendar')return eventTime(item);
  if(kind==='mail')return `${item.from} · ${newspaperDate(item.receivedAt,{time:true})}`;
  return newspaperDate(item.publishedAt,{time:true});
}
export function validatePersonalBriefing(personal,date){
  if(!personal)return;
  if(personal.date!==date||!/^\d{4}-\d{2}-\d{2}$/.test(personal.date))throw new Error('Personal briefing must match the edition date.');
  for(const [kind,max]of [['calendar',30],['mail',20],['x',3]]){
    const source=personal[kind];
    if(!source||!['ready','empty','disabled','unavailable','setup','stale','partial'].includes(source.status)||!Array.isArray(source.items)||source.items.length>max||typeof source.note!=='string'||source.note.length>500)throw new Error('Personal briefing exceeds its printable bounds.');
    for(const item of source.items){
      const fields=kind==='calendar'?['title']:kind==='mail'?['subject','from','text']:['handle','text'];
      if(fields.some(f=>typeof item[f]!=='string'||item[f].length>(f==='text'?240:100)))throw new Error('Personal briefing text exceeds its bounds.');
      let u;try{u=new URL(item.url);}catch{throw new Error('Personal source link is invalid.');}
      const hosts=kind==='mail'?['mail.google.com']:kind==='calendar'?['calendar.google.com','www.google.com']:['x.com'];
      if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.includes(u.hostname))throw new Error('Personal source link is invalid.');
    }
  }
}
