import fs from 'node:fs/promises';
import path from 'node:path';
import { validateHttpUrl } from './security.js';
const SKIP=new Set(['node_modules','.git','.mari','dist','build','.next','vendor','target','.venv']);
export function normalizeRoute(value,baseUrl) {
 try {
  const base=new URL(baseUrl),url=new URL(value,base);
  if(url.origin!==base.origin||url.username||url.password||!['http:','https:'].includes(url.protocol))return null;
  const route=url.pathname.replace(/\/{2,}/g,'/');
  if(/\[|\]|\*|:|\.(?:png|jpe?g|gif|svg|webp|ico|css|js|map|xml|pdf|zip)$/i.test(route))return null;
  return route.length>1?route.replace(/\/$/,''):route;
 } catch {return null;}
}
async function fetchText(url,origin) {
 const response=await fetch(url,{signal:AbortSignal.timeout(4000),redirect:'manual'});
 if(response.status>=300&&response.status<400)throw new Error('Redirect skipped during route discovery.');
 if(new URL(response.url).origin!==origin||!response.ok)throw new Error(`Route discovery received HTTP ${response.status}.`);
 const reader=response.body?.getReader();if(!reader)return '';
 let size=0;const chunks=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error('Route discovery response exceeded 2 MiB.');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}
export async function inventoryRoutes(project,baseUrl) {
 try{validateHttpUrl(baseUrl);}catch(error){throw Object.assign(error,{status:400,code:'INVALID_URL'});}const base=new URL(baseUrl),found=new Map(),errors=[];
 const add=(route,source)=>{const r=normalizeRoute(route,baseUrl);if(!r)return;if(found.has(r))found.get(r).add(source);else if(found.size<20)found.set(r,new Set([source]));};add('/','base');
 const queue=[project.path];let visited=0;
 while(queue.length&&visited<600&&found.size<20) {
  const directory=queue.shift();const entries=await fs.readdir(directory,{withFileTypes:true}).catch(()=>[]);
  for(const entry of entries) {
   if(++visited>600)break;
   const full=path.join(directory,entry.name),relative=path.relative(project.path,full).replaceAll(path.sep,'/');
   if(entry.isDirectory()&&!entry.isSymbolicLink()&&!SKIP.has(entry.name)&&relative.split('/').length<7)queue.push(full);
   if(!entry.isFile()||! /\.(js|jsx|json|html|vue|svelte|astro)$/.test(entry.name))continue;
   const stat=await fs.stat(full);if(stat.size>500000)continue;
   if(/(?:^|\/)(?:app|pages)\//.test(relative)&&/(?:page|index)\.(jsx?|vue|svelte|astro)$/.test(relative)) {
    let route=relative.replace(/^.*?(?:app|pages)\//,'').replace(/(?:^|\/)(?:page|index)\.(jsx?|vue|svelte|astro)$/,'').replace(/\([^/]+\)\//g,'');add('/'+route,'source');
   }
   const pageFile=relative.match(/(?:^|\/)pages\/(.+)\.(jsx?|vue|svelte|astro)$/);
   if(pageFile&&!/^(?:api\/|_)/.test(pageFile[1])&&!/(?:^|\/)_/.test(pageFile[1]))add('/'+pageFile[1].replace(/(?:^|\/)index$/,''),'source');
   const sveltePage=relative.match(/(?:^|\/)routes\/(.*)\+page\.svelte$/);
   if(sveltePage)add('/'+sveltePage[1].replace(/\([^/]+\)\//g,''),'source');
   const text=await fs.readFile(full,'utf8').catch(()=>'');
   for(const match of text.matchAll(/(?:path\s*[:=]\s*["']|href\s*=\s*["'])(\/[^"'\s]*)/g))add(match[1],'source');
  }
 }
 await Promise.all([
  (async()=>{try{const text=await fetchText(new URL('/sitemap.xml',base).href,base.origin);for(const match of text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi))add(match[1].replaceAll('&amp;','&'),'sitemap');}catch(e){errors.push({source:'sitemap',message:e.message});}})(),
  (async()=>{try{const text=await fetchText(base.href,base.origin);for(const match of text.matchAll(/href\s*=\s*["']([^"']+)["']/gi))add(match[1].replaceAll('&amp;','&'),'navigation');}catch(e){errors.push({source:'navigation',message:e.message});}})(),
 ]);
 return {routes:[...found.keys()],inventory:[...found].map(([route,sources])=>({route,sources:[...sources]})),maxRoutes:20,truncated:found.size===20||visited>=600,errors};
}
