import { useState } from 'react';
import { AGENT_PORTRAITS } from '../../shared/agent-catalog.js';
import './agent-portrait.css';

const files = import.meta.glob('../assets/agents/chibi-v1/*.webp', { eager: true, query: '?url', import: 'default' });

export function AgentPortrait({ portraitId, name = 'Agent', size = 56 }) {
  const [failedSource, setFailedSource] = useState(null);
  const known = AGENT_PORTRAITS.some((item) => item.id === portraitId);
  const source = known ? files[`../assets/agents/chibi-v1/${portraitId}.webp`] : null;
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] || '').join('').toLocaleUpperCase() || 'A';
  return <span className="agent-portrait" style={{ '--portrait-size': `${size}px` }} aria-hidden="true">
    {source && source !== failedSource ? <img src={source} alt="" width="256" height="256" loading="lazy" onError={() => setFailedSource(source)} /> : <span className="agent-initials">{initials}</span>}
  </span>;
}
