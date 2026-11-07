import { id, now } from './store.js';
import { resolveAgentProfile } from './agent-profiles.js';
import { captureTeamRoster, createTeamRun } from './agent-teams.js';
import { cleanKnowledgeText } from './knowledge.js';

export async function prepareDelegatedGoal(store,{profileId,projectId=null,text,title='Phone goal'},resolveProfile=resolveAgentProfile) {
  if(typeof text!=='string'||!text.trim()||text.length>6000)throw new Error('A phone goal must contain 1–6,000 characters.');
  if(projectId&&!store.get('projects',projectId))throw new Error('The configured project is no longer registered.');
  const profile=await resolveProfile(store,profileId,{projectId,personal:!projectId});if(!profile)throw new Error('Choose a configured coordinator.');
  const chat={id:id('chat'),profileId,profile,projectId,title,threadId:null,createdAt:now(),lastActivityAt:now()};
  const captured=await captureTeamRoster(store,chat,resolveProfile);
  const message={id:id('message'),chatId:chat.id,role:'user',content:cleanKnowledgeText(text.trim()),mode:'team',status:'sent',createdAt:now()};
  return {chat,message,captured};
}
// Caller owns a synchronous transaction with its incoming-update receipt.
export function commitDelegatedGoal(store,prepared,origin) {
  store.put('agentChats',prepared.chat);store.put('agentMessages',prepared.message);
  const {team,job}=createTeamRun(store,prepared.chat,prepared.message,prepared.captured);
  store.update('agentMessages',prepared.message.id,{jobId:job.id,taskId:job.taskId});
  store.update('agentTeams',team.id,{origin});return store.get('agentTeams',team.id);
}
