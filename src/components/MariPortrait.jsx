import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import atlas from '@/assets/mari-portrait-atlas-v3.png';
import { portraitSequence as sequence } from '@/lib/portrait-motion';
import './mari-portrait.css';

const columns = 6;
const rows = 4;
const frameCount = columns * rows;

let atlasPromise;

// Sharing only the image load lets StrictMode safely dispose and remount the
// player without duplicate downloads or callbacks into an unmounted instance.
function preloadAtlas() {
  if (!atlasPromise) {
    atlasPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';

      function finish(error) {
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve();
      }

      image.onload = async () => {
        try {
          if (typeof image.decode === 'function') await image.decode();
          // The contract is six columns and four rows of square raster cells.
          // The atlas can use a different resolution while preserving its grid.
          if (!image.naturalWidth || !image.naturalHeight
            || image.naturalWidth % columns !== 0 || image.naturalHeight % rows !== 0
            || image.naturalWidth / columns !== image.naturalHeight / rows) {
            throw new Error('The portrait atlas must contain 24 square frames.');
          }
          finish();
        } catch (error) {
          finish(error);
        }
      };
      image.onerror = () => finish(new Error('The portrait image could not load.'));
      image.src = atlas;
    });
  }
  return atlasPromise;
}

function initialView(paused) {
  return {
    status: 'loading',
    frame: 0,
    phase: 'breathing',
    motion: 'loading',
    paused: Boolean(paused),
    reducedMotion: false,
    visibility: typeof document !== 'undefined' && document.hidden ? 'hidden' : 'visible',
    transitionCount: 0,
  };
}

/** Decorative raster animation. No execution or availability props belong here. */
export function MariPortrait({ paused = false, showControls = false, onPausedChange } = {}) {
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const initialPausedRef = useRef(Boolean(paused));
  const descriptionId = useId();
  const [view, setView] = useState(() => initialView(paused));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let timer = null;
    let observer;
    let status = 'loading';
    let frame = 0;
    let step = 0;
    let isPaused = initialPausedRef.current;
    let reducedMotion = media.matches;
    let hidden = document.hidden;
    let transitionCount = 0;

    function inViewport() {
      const box = host.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0
        && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
    }

    let onScreen = inViewport();

    function motion() {
      if (status !== 'ready') return status;
      if (reducedMotion) return 'reduced';
      if (isPaused) return 'paused';
      if (hidden) return 'hidden';
      if (!onScreen) return 'offscreen';
      return 'playing';
    }

    function publish() {
      if (disposed) return;
      const next = {
        status, frame, phase: sequence[step].phase, paused: isPaused, reducedMotion, transitionCount,
        motion: motion(),
        visibility: hidden ? 'hidden' : onScreen ? 'visible' : 'offscreen',
      };
      setView((current) => Object.keys(next).every((key) => current[key] === next[key]) ? current : next);
    }

    function showFrame(nextFrame) {
      if (frame === nextFrame) return;
      frame = nextFrame;
      transitionCount += 1;
    }

    function stop() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }

    function schedule() {
      if (disposed || motion() !== 'playing') return;
      timer = window.setTimeout(() => {
        timer = null;
        if (disposed || motion() !== 'playing') return;
        step = (step + 1) % sequence.length;
        showFrame(sequence[step].frame);
        publish();
        schedule();
      }, sequence[step].hold);
    }

    function sync() {
      if (disposed) return;
      stop();
      step = 0;
      // All interruptions leave the neutral drawing visible. Resuming starts
      // with a full frontal breathing rest before any occasional lean.
      showFrame(0);
      publish();
      schedule();
    }

    function visibilityChange() {
      hidden = document.hidden;
      sync();
    }

    function preferenceChange(event) {
      reducedMotion = event.matches;
      sync();
    }

    function viewportChange() {
      const next = inViewport();
      if (next === onScreen) return;
      onScreen = next;
      sync();
    }

    document.addEventListener('visibilitychange', visibilityChange);
    media.addEventListener('change', preferenceChange);
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        const next = entry.isIntersecting && entry.intersectionRatio > 0;
        if (next === onScreen) return;
        onScreen = next;
        sync();
      });
      observer.observe(host);
    } else {
      window.addEventListener('scroll', viewportChange, { passive: true });
      window.addEventListener('resize', viewportChange, { passive: true });
    }

    runtimeRef.current = {
      setPaused(nextPaused) {
        if (disposed || isPaused === Boolean(nextPaused)) return;
        isPaused = Boolean(nextPaused);
        sync();
      },
    };

    sync();
    preloadAtlas().then(() => {
      if (disposed) return;
      status = 'ready';
      sync();
    }, () => {
      if (disposed) return;
      status = 'error';
      sync();
    });

    return () => {
      disposed = true;
      stop();
      runtimeRef.current = null;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibilityChange);
      media.removeEventListener('change', preferenceChange);
      window.removeEventListener('scroll', viewportChange);
      window.removeEventListener('resize', viewportChange);
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setPaused(paused);
  }, [paused]);

  const motionLabel = view.paused ? 'Resume portrait animation' : 'Pause portrait animation';
  const explanation = view.status === 'loading' ? 'The character portrait is loading.'
    : view.status === 'error' ? 'The character portrait could not load. Reload to retry.'
      : view.reducedMotion ? 'Portrait animation is disabled by your reduced motion preference.'
        : view.paused ? 'The decorative portrait animation is paused.'
          : 'The decorative portrait animation is independent of task activity.';
  const portraitStyle = view.status === 'ready' ? {
    backgroundImage: `url("${atlas}")`,
    backgroundPosition: `${(view.frame % columns) / (columns - 1) * 100}% ${Math.floor(view.frame / columns) / (rows - 1) * 100}%`,
  } : undefined;

  return <>
    <div
      ref={hostRef}
      className="mari-portrait"
      role="img"
      aria-label="Mari character portrait"
      aria-describedby={descriptionId}
      aria-busy={view.status === 'loading'}
      data-frame={view.frame}
      data-frame-count={frameCount}
      data-phase={view.phase}
      data-motion={view.motion}
      data-transition-count={view.transitionCount}
      data-visibility={view.visibility}
      style={portraitStyle}
    >
      {view.status !== 'ready' && <span className="mari-portrait-fallback">
        {view.status === 'loading' ? 'Loading portrait…' : 'Portrait unavailable. Reload to retry.'}
      </span>}
    </div>
    <span id={descriptionId} className="mari-portrait-description">{explanation}</span>
    {showControls && <Button
      className="mari-portrait-motion"
      variant="ghost"
      size="icon-sm"
      type="button"
      aria-label={motionLabel}
      aria-describedby={descriptionId}
      title={view.reducedMotion || view.status !== 'ready' ? explanation : motionLabel}
      disabled={view.reducedMotion || view.status !== 'ready' || !onPausedChange}
      onClick={() => onPausedChange?.(!view.paused)}
    >
      {view.paused || view.reducedMotion ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
    </Button>}
  </>;
}
