export function isFreshServiceObservation(service, at = Date.now()) {
  const observed = Date.parse(service?.lastProbeAt || '');
  return Number.isFinite(observed) && at - observed >= -5000 && at - observed < 30000;
}
