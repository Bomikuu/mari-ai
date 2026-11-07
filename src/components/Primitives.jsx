import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronDown, Orbit, Pause, Play, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { human } from '@/lib/api';
const MariPortrait = lazy(() => import('./MariPortrait.jsx').then((module) => ({ default: module.MariPortrait })));
const MariGlobe = lazy(() => import('./MariGlobe.jsx').then((module) => ({ default: module.MariGlobe })));

export function Panel({ title, action, children, className = '', id }) {
  return <section className={`panel ${className}`} aria-label={title} id={id}>
    <div className="panel-heading"><h2>{title}</h2>{action}</div>{children}
  </section>;
}

export function Status({ value = 'unknown', label, compact = false }) {
  return <span className={`status status-${value} ${compact ? 'status-compact' : ''}`}><span className="status-dot" aria-hidden="true" />{label || human(value)}</span>;
}

export function Empty({ icon: Icon = Orbit, title, children, action }) {
  return <div className="empty-state"><Icon size={25} aria-hidden="true" /><strong>{title}</strong>{children && <div className="empty-copy">{children}</div>}{action}</div>;
}

export function Core({ message, workerOnline, activity = 'offline' }) {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (event) => setReducedMotion(event.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const motionLabel = paused ? 'Resume avatar and globe animation' : 'Pause avatar and globe animation';
  return <section className="mari-core mari-core--portrait" aria-label="Mari personal AI" data-activity={activity}>
    <Suspense fallback={null}><MariGlobe activity={activity} paused={paused} sizeScale={2} /></Suspense>
    <Suspense fallback={<div className="portrait-pending" aria-hidden="true" />}><MariPortrait paused={paused} /></Suspense>
    <div className="portrait-wordmark"><span>MARI</span><small>PERSONAL AI</small></div>
    <Button className="core-motion-control" variant="ghost" size="icon-sm" aria-label={motionLabel} title={reducedMotion ? 'Animation is paused by your reduced motion preference' : motionLabel} disabled={reducedMotion} onClick={() => setPaused((value) => !value)}>{paused || reducedMotion ? <Play size={14} /> : <Pause size={14} />}</Button>
    <p className="core-caption">{message || (workerOnline ? 'Ready for your next instruction' : 'Waiting for the local worker')}</p>
    <span className="core-footnote">LOCAL WORKSPACE</span>
  </section>;
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return <div className="error-banner" role="alert"><WifiOff size={16} /><span>{error}</span><Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button></div>;
}

export function TinyBadge({ children }) { return <Badge variant="outline" className="tiny-badge">{children}</Badge>; }

export function NativeSelect({ label, value, onChange, children, className = '' }) {
  return <span className={`native-select ${className}`}><select aria-label={label} value={value} onChange={onChange}>{children}</select><ChevronDown size={14} aria-hidden="true" /></span>;
}
