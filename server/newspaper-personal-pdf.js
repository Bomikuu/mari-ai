import {BRIEFING_SECTIONS,BRIEFING_PRINT_LIMITS,briefingMeta} from '../shared/newspaper-briefing.js';
import {newspaperDate} from '../shared/newspaper-layout.js';
const M=20,W=555.28,INK='#161513',RED='#9b1717';
function personalBlocks(doc,personal,{page,top,body=9.2,calendarLimit=8}){
  const blocks=[];
  function text(value,x,y,width,{size=body,bold=false,color=INK,link}={}){
    const content=String(value||'').replace(/\s+/g,' ').trim(),font=bold?'bold':'serif',lineHeight=size*1.2;
    doc.font(font).fontSize(size);const lines=[];let line='';
    for(const raw of content.split(' ')){
      const words=[];let part='';
      for(const letter of raw){if(part&&doc.widthOfString(part+letter)>width){words.push(part);part=letter;}else part+=letter;}if(part)words.push(part);
      for(const word of words){const next=line?`${line} ${word}`:word;if(line&&doc.widthOfString(next)>width){lines.push(line);line=word;}else line=next;}
    }
    if(line)lines.push(line);const height=lines.length*lineHeight;
    blocks.push({type:'text',page,text:content,lines,x,y,width,height,font,size,lineHeight,color,align:'left',...(link?{link}:{})});return y+height;
  }
  function rule(x,y,width,height=0){blocks.push({type:'line',page,x,y,width,height,weight:.45,color:'#746f65'});}
  let y=text('FOR YOU',M,top,W,{size:23,bold:true});
  y=text(`Private briefing · ${newspaperDate(personal.date,{weekday:true})} · Asia/Manila`,M,y+4,W,{size:8})+13;
  const columnTop=y,width=(W-30)/3;let bottom=y;
  for(const [index,kind]of ['calendar','mail','x'].entries()){
    const source=personal[kind],x=M+index*(width+15);let cy=columnTop;
    if(index)rule(x-7.5,cy,0,120);
    cy=text(BRIEFING_SECTIONS[kind].toUpperCase(),x,cy,width,{size:9,bold:true,color:RED})+7;
    const items=source.items.slice(0,kind==='calendar'?calendarLimit:BRIEFING_PRINT_LIMITS[kind]);
    if(!items.length)cy=text(source.status==='empty'?(kind==='x'?source.note:kind==='calendar'?'No events were returned for today.':'No matching emails were returned.'):source.note,x,cy,width,{size:body})+9;
    else for(const item of items){
      const title=kind==='calendar'?item.title:kind==='mail'?item.subject:`@${item.handle}`;
      if(kind==='calendar'){
        cy=text(briefingMeta(kind,item),x,cy,width,{size:7.7,bold:true})+3;
        cy=text(title,x,cy,width,{size:10.6,bold:true,link:item.url})+10;
      }else{
        cy=text(title,x,cy,width,{size:12,bold:true,link:item.url})+4;
        cy=text(briefingMeta(kind,item),x,cy,width,{size:6.8})+5;
        cy=text(item.text+(item.excerpt?' [excerpt]':''),x,cy,width,{size:body,link:item.url})+11;
      }
      rule(x,cy-5,width);
    }
    const remaining=source.items.length-items.length;
    if(remaining||source.truncated)cy=text(`${items.length} shown${source.truncated?' from a limited source result':` of ${source.total}`}${remaining?`; ${remaining} more in Mari’s reading view`:''}.`,x,cy+2,width,{size:7.2})+7;
    if(source.checkedAt)cy=text(`Checked ${newspaperDate(source.checkedAt,{time:true})} Manila${source.status==='stale'?' · cached, not a live feed':''}`,x,cy+3,width,{size:6.6})+6;
    if(kind==='x')cy=text(source.note,x,cy,width,{size:7.1})+7;
    bottom=Math.max(bottom,cy);
  }
  for(const block of blocks)if(block.type==='line'&&block.height>0)block.height=bottom-columnTop;
  return {blocks,bottom};
}
export function addPersonalBriefing(doc,plan,edition){
  const personal=edition.personal;if(!personal)return plan;
  const content=plan.blocks.filter(b=>b.page===plan.pages&&b.y<788),end=Math.max(110,...content.map(b=>b.y+b.height));
  if(plan.pages===1){const inline=personalBlocks(doc,personal,{page:1,top:end+16});if(inline.bottom<=777)return {...plan,blocks:[...plan.blocks,...inline.blocks]};}
  if(plan.pages!==1)throw new Error('Personal briefing requires a compact news front page before its second A4 sheet.');
  let result;
  outer:for(const calendarLimit of [8,6,4])for(const body of [9.2,8.8,8.2]){const candidate=personalBlocks(doc,personal,{page:2,top:112,body,calendarLimit});if(candidate.bottom<=777){result=candidate;break outer;}}
  if(!result)throw new Error('Personal briefing exceeds its readable A4 bounds.');
  const header=plan.blocks.filter(b=>b.page===1&&(b.y<=99||b.y>=788)).map(b=>({...b,page:2,...(b.text==='MANILA · 1 OF 1'?{text:'MANILA · 2 OF 2',lines:['MANILA · 2 OF 2']}:{}),...(b.text==='MARI DAILY · 1'?{text:'MARI DAILY · 2',lines:['MARI DAILY · 2']}:{}),...(b.y===795?{text:'Private edition: includes personal email previews and calendar titles. Source links open the original items.',lines:['Private edition: includes personal email previews and calendar titles. Source links open the original items.']}: {})}));
  const first=plan.blocks.map(b=>b.text==='MANILA · 1 OF 1'?{...b,text:'MANILA · 1 OF 2',lines:['MANILA · 1 OF 2']}:b);
  return {...plan,pages:2,blocks:[...first,...header,...result.blocks]};
}
