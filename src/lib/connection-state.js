export function disconnectedExecutionView(data, at = Date.now()) {
  return {
    ...data,
    workers: data.workers.map((worker) => ({ ...worker, status: worker.status === 'offline' || at - Date.parse(worker.lastHeartbeatAt || 0) >= 20000 ? 'offline' : 'reconnecting' })),
    agents: data.agents.map((agent) => ({ ...agent, live: false, connectivity: 'offline', stale: true })),
    services: data.services.map((service) => service.ownership === 'managed' && ['running', 'starting', 'stopping'].includes(service.status) ? { ...service, status: 'unknown', healthReason: 'Connection lost; current process health is unconfirmed.' } : service),
  };
}
