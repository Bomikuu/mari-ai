import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { safeNewspaperUrl } from '../../shared/newspaper-layout.js';

export function BroadsheetPaper({ edition, children }) {
  const plan = edition.printPlan, root = useRef(null), [scale, setScale] = useState(1);
  const [view, setView] = useState(() => window.matchMedia('(max-width: 600px)').matches ? 'reading' : 'paper');
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1.25, entry.contentRect.width / (plan.width * 4 / 3))));
    observer.observe(root.current); return () => observer.disconnect();
  }, [plan.width]);
  return <div className={`newspaper-spread broadsheet-spread broadsheet-view--${view}`} ref={root}>
    <div className="broadsheet-view-switch" aria-label="Newspaper view"><span>{plan.pages === 1 ? 'One A4 front page' : 'Two A4 pages · full summaries retained'}</span><div><Button size="sm" variant={view === 'paper' ? 'secondary' : 'ghost'} aria-pressed={view === 'paper'} onClick={() => setView('paper')}>Paper layout</Button><Button size="sm" variant={view === 'reading' ? 'secondary' : 'ghost'} aria-pressed={view === 'reading'} onClick={() => setView('reading')}>Reading view</Button></div></div>
    <div className="broadsheet-paper-pages">
      {Array.from({ length: plan.pages }, (_, index) => <div className="broadsheet-sheet-shell" key={index} style={{ width: plan.width * 4 / 3 * scale, height: plan.height * 4 / 3 * scale }}>
        <section className="broadsheet-sheet" aria-label={`Mari Daily page ${index + 1} of ${plan.pages}`} style={{ width: `${plan.width}pt`, height: `${plan.height}pt`, transform: `scale(${scale})` }}>
          {plan.blocks.filter((b) => b.page === index + 1).map((b, i) => {
            const style = { left: `${b.x}pt`, top: `${b.y}pt`, width: `${b.width}pt`, height: `${b.height}pt` };
            if (b.type === 'fill') return <div aria-hidden="true" className="broadsheet-block" key={i} style={{ ...style, background: b.color }} />;
            if (b.type === 'line') return <div aria-hidden="true" className="broadsheet-block" key={i} style={{ ...style, borderTop: b.height ? 0 : `${b.weight}pt solid ${b.color}`, borderLeft: b.height ? `${b.weight}pt solid ${b.color}` : 0 }} />;
            if (b.type === 'image') return <img className="broadsheet-block" key={i} src={`/api/artifacts/${encodeURIComponent(b.artifactId)}/content`} alt={b.alt} style={style} />;
            const href = safeNewspaperUrl(b.link), Tag = b.role === 'title' ? 'h4' : 'div';
            return <Tag key={i} className="broadsheet-block broadsheet-type" style={{ ...style, fontFamily: b.font.startsWith('sans') ? 'MariPaperSans, sans-serif' : 'MariNewspaper, serif', fontWeight: ['bold', 'sansBold'].includes(b.font) ? 700 : 400, fontSize: `${b.size}pt`, lineHeight: `${b.lineHeight}pt`, textAlign: b.align, color: b.color }}>
              {href ? <a href={href} target="_blank" rel="noreferrer">{b.lines.map((text, n) => <span key={n}>{text}</span>)}</a> : b.lines.map((text, n) => <span key={n}>{text}</span>)}
            </Tag>;
          })}
        </section>
      </div>)}
    </div>
    <div className="broadsheet-reading">{children}</div>
  </div>;
}
