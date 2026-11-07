export function coreActivity({ workerOnline, projectId, agents = [], jobs = [], services = [], task }) {
  if (!workerOnline) return 'offline';
  const inContext = (item) => !projectId || item.projectId === projectId;
  const liveAgent = agents.some((item) => inContext(item) && item.live && item.status === 'working');
  const liveJob = jobs.some((item) => inContext(item) && item.status === 'running');
  if (liveAgent || liveJob) return 'working';
  if (services.some((item) => inContext(item) && item.status === 'running' && isFreshServiceObservation(item))) return 'running';
  if (task && ['awaiting_approval', 'awaiting_input', 'paused'].includes(task.status)) return 'waiting';
  return 'idle';
}
import { isFreshServiceObservation } from '../../shared/health.js';

