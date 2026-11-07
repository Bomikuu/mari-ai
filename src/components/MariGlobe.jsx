import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import './mari-globe.css';

const activityLabels = {
  working: 'A task is in progress',
  running: 'Project services are running',
  waiting: 'Waiting for your review',
  idle: 'Ready for your next instruction',
  offline: 'The local worker is offline',
};

const lineStyles = {
  working: { colorToken: '--globe-line-working', opacity: 0.62, innerOpacity: 0.3, ringOpacity: 0.6 },
  running: { colorToken: '--globe-line-running', opacity: 0.54, innerOpacity: 0.26, ringOpacity: 0.5 },
  waiting: { colorToken: '--globe-line', opacity: 0.5, innerOpacity: 0.23, ringOpacity: 0.46 },
  idle: { colorToken: '--globe-line', opacity: 0.5, innerOpacity: 0.23, ringOpacity: 0.46 },
  offline: { colorToken: '--globe-line-muted', opacity: 0.4, innerOpacity: 0.2, ringOpacity: 0.36 },
};

const initialRotation = new THREE.Euler(0.22, 0.37, -0.18);
const innerRotation = new THREE.Euler(-0.16, 0.32, 0.2);
const orbitRotation = new THREE.Euler(1.02, -0.2, -0.42);

function geodesicEdges(radius, detail) {
  const shell = new THREE.IcosahedronGeometry(radius, detail);
  const edges = new THREE.EdgesGeometry(shell);
  const positions = Array.from(edges.getAttribute('position').array);
  edges.dispose();
  shell.dispose();
  return positions;
}

function sphericalPoint(latitude, longitude) {
  return [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)];
}

// Geometry is independently authored from mathematical primitives. These fixed
// decorative points do not represent connected agents, services, or other data.
const outerEdges = geodesicEdges(1, 2);
const innerEdges = geodesicEdges(0.63, 1);
const nodePositions = [
  [0.24, -0.7], [0.9, 0.45], [-0.25, 1.7], [-0.75, 2.4],
  [0.5, 3.5], [-0.46, 4.5], [0.78, 5.45],
].map(([latitude, longitude]) => sphericalPoint(latitude, longitude).map((value) => value * 1.015));
const linkPositions = [[0, 2], [1, 5], [3, 6], [2, 4]]
  .flatMap(([a, b]) => [...nodePositions[a], ...nodePositions[b]]);
const orbitPositions = Array.from({ length: 128 }, (_, index) => {
  const angle = index / 128 * Math.PI * 2;
  return [Math.cos(angle) * 1.23, Math.sin(angle) * 1.23, 0];
}).flat();

function projectFallback(positions, rotation) {
  const projected = [];
  for (let index = 0; index < positions.length; index += 3) {
    const point = new THREE.Vector3().fromArray(positions, index);
    if (rotation) point.applyEuler(rotation);
    point.applyEuler(initialRotation);
    projected.push([180 + point.x * 108, 153 - point.y * 108]);
  }
  return projected;
}

function edgePath(points) {
  return points.map(([x, y], index) => `${index % 2 ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
}

// The vector fallback shares the actual topology and is projected once, without
// retaining GPU resources or rebuilding geometry during React renders.
const fallbackShape = {
  outer: edgePath(projectFallback(outerEdges)),
  inner: edgePath(projectFallback(innerEdges, innerRotation)),
  links: edgePath(projectFallback(linkPositions)),
  orbit: `${projectFallback(orbitPositions, orbitRotation).map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')}Z`,
  nodes: projectFallback(nodePositions.flat()),
};

function StaticGlobe({ sizeScale }) {
  return <svg className="mari-globe-fallback" viewBox="0 0 360 306" fill="none" aria-hidden="true">
    <g className="globe-fallback-geometry" transform={`translate(180 153) scale(${sizeScale}) translate(-180 -153)`}>
      <g stroke="currentColor" strokeWidth="0.75">
        <path className="globe-fallback-outer" d={fallbackShape.outer} />
        <path className="globe-fallback-inner" d={fallbackShape.inner} />
        <path className="globe-fallback-links" d={fallbackShape.links} />
        <path className="globe-fallback-orbit" d={fallbackShape.orbit} />
      </g>
      <g fill="currentColor" opacity="0.86">
        {fallbackShape.nodes.map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="2.8" />)}
      </g>
    </g>
  </svg>;
}

/** Ambient identity motion is independent of the factual activity prop. */
export function MariGlobe({ activity = 'offline', paused = false, sizeScale = 1, showControls = false, onPausedChange }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const activityRef = useRef(activity);
  const pausedRef = useRef(paused);
  const resolvedSizeScale = Number.isFinite(sizeScale) && sizeScale > 0 ? Math.min(sizeScale, 3) : 1;
  const sizeScaleRef = useRef(resolvedSizeScale);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [rendererState, setRendererState] = useState('initializing');
  activityRef.current = activity;
  pausedRef.current = paused;
  sizeScaleRef.current = resolvedSizeScale;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    let renderer;
    let disposed = false;
    let failed = false;
    let contextLost = false;
    let animating = false;
    let hasSize = false;
    let frames = 0;
    let lastFrame = 0;
    let activeTime = 0;
    let onScreen = true;
    let resizeObserver;
    let intersectionObserver;
    let themeObserver;
    const geometries = new Set();
    const materials = new Set();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = media.matches;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2, 2, 1.5, -1.5, 0.1, 20);
    camera.position.z = 5;
    const globe = new THREE.Group();
    globe.rotation.copy(initialRotation);
    scene.add(globe);

    function geometry(value) { geometries.add(value); return value; }
    function material(value) { materials.add(value); return value; }
    function lines(positions, lineMaterial) {
      const value = geometry(new THREE.BufferGeometry());
      value.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      return new THREE.LineSegments(value, lineMaterial);
    }
    function lineMaterial(opacity) {
      return material(new THREE.LineBasicMaterial({ color: '#737373', transparent: true, opacity, depthWrite: false }));
    }

    const outerMaterial = lineMaterial(0.5);
    const innerMaterial = lineMaterial(0.23);
    const ringMaterial = lineMaterial(0.46);
    const linkMaterial = lineMaterial(0.24);
    const nodeMaterial = material(new THREE.MeshBasicMaterial({ color: '#737373', transparent: true, opacity: 0.86, depthWrite: false }));
    const outer = lines(outerEdges, outerMaterial);
    const inner = lines(innerEdges, innerMaterial);
    inner.rotation.copy(innerRotation);
    const orbitGeometry = geometry(new THREE.BufferGeometry());
    orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(orbitPositions, 3));
    const orbit = new THREE.LineLoop(orbitGeometry, ringMaterial);
    orbit.rotation.copy(orbitRotation);
    const nodeGeometry = geometry(new THREE.SphereGeometry(0.026, 8, 6));
    globe.add(outer, inner, orbit, lines(linkPositions, linkMaterial));
    nodePositions.forEach((position) => {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
      node.position.fromArray(position);
      globe.add(node);
    });

    function showRenderer(value) {
      if (!disposed) setRendererState(value);
    }
    function stop() {
      renderer?.setAnimationLoop(null);
      animating = false;
      lastFrame = 0;
    }
    function fallback(reason) {
      failed = reason !== 'context-lost';
      stop();
      host.dataset.motion = 'fallback';
      showRenderer(reason);
    }
    function render() {
      if (disposed || !renderer || failed || contextLost || !hasSize || document.hidden || !onScreen) return;
      try {
        renderer.render(scene, camera);
        frames += 1;
        host.dataset.renderCount = String(frames);
        host.dataset.rotation = globe.rotation.y.toFixed(4);
      } catch {
        fallback('unavailable');
      }
    }
    function frame(now) {
      if (pausedRef.current || prefersReducedMotion || document.hidden || !onScreen || !hasSize || contextLost || failed) {
        stop();
        return;
      }
      if (lastFrame && now - lastFrame < 1000 / 30 - 0.5) return;
      const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.08) : 0;
      lastFrame = now;
      const state = activityRef.current;
      activeTime += delta;
      globe.rotation.y += delta * (state === 'working' ? 0.26 : state === 'running' ? 0.18 : 0.125);
      globe.scale.setScalar(state === 'working' ? 1 + Math.sin(activeTime * 2.4) * 0.008 : 1);
      render();
    }
    function sync() {
      if (disposed) return;
      const state = activityRef.current;
      const style = lineStyles[state] || lineStyles.offline;
      const computed = window.getComputedStyle(host);
      const color = (token, fallbackColor) => computed.getPropertyValue(token).trim() || fallbackColor;
      const currentColor = color(style.colorToken, color('--globe-line', '#737373'));
      outerMaterial.color.set(currentColor);
      outerMaterial.opacity = style.opacity;
      innerMaterial.color.set(currentColor);
      innerMaterial.opacity = style.innerOpacity;
      ringMaterial.color.set(currentColor);
      ringMaterial.opacity = style.ringOpacity;
      linkMaterial.color.set(currentColor);
      linkMaterial.opacity = state === 'offline' ? 0.18 : 0.24;
      nodeMaterial.color.set(currentColor);
      nodeMaterial.opacity = state === 'offline' ? 0.72 : 0.86;
      host.dataset.reducedMotion = String(prefersReducedMotion);
      host.dataset.visibility = document.hidden ? 'hidden' : onScreen ? 'visible' : 'offscreen';
      const canMove = renderer && !prefersReducedMotion && !pausedRef.current && !document.hidden && onScreen && hasSize && !contextLost && !failed;
      host.dataset.motion = failed || contextLost ? 'fallback'
        : document.hidden ? 'hidden'
          : !onScreen ? 'offscreen'
            : prefersReducedMotion ? 'reduced'
              : pausedRef.current ? 'paused'
                : canMove ? (state === 'working' ? 'resonating' : state === 'running' ? 'rotating' : 'ambient')
                  : 'static';
      if (!canMove) {
        stop();
        globe.scale.setScalar(1);
        render();
      } else {
        render();
        if (!animating && !failed) {
          animating = true;
          renderer.setAnimationLoop(frame);
        }
      }
    }
    function resize() {
      if (disposed || !renderer || failed || contextLost) return;
      const { width, height } = host.getBoundingClientRect();
      hasSize = width > 0 && height > 0;
      if (hasSize) {
        const baseRadius = Math.min(width * 0.3, height * 0.38, 132);
        const radius = baseRadius * sizeScaleRef.current;
        host.dataset.baseProjectedDiameter = (baseRadius * 2).toFixed(2);
        host.dataset.projectedDiameter = (radius * 2).toFixed(2);
        camera.left = -width / (2 * radius);
        camera.right = width / (2 * radius);
        camera.top = height / (2 * radius);
        camera.bottom = -height / (2 * radius);
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(width, height, false);
      }
      sync();
    }
    function motionChange(event) {
      prefersReducedMotion = event.matches;
      setReducedMotion(event.matches);
      sync();
    }
    function visibilityChange() { sync(); }
    function lost(event) {
      event.preventDefault();
      contextLost = true;
      fallback('context-lost');
    }
    function restored() {
      if (disposed) return;
      contextLost = false;
      failed = false;
      resize();
      if (!failed) showRenderer('webgl');
    }

    setReducedMotion(prefersReducedMotion);
    media.addEventListener('change', motionChange);
    document.addEventListener('visibilitychange', visibilityChange);
    try {
      // Probe first so disabled WebGL reaches the vector fallback quietly.
      const options = { alpha: true, antialias: true, powerPreference: 'low-power' };
      const context = canvas.getContext('webgl2', options);
      if (!context) fallback('unavailable');
      else {
        renderer = new THREE.WebGLRenderer({ canvas, context, ...options });
        renderer.setClearColor('#000000', 0);
        canvas.addEventListener('webglcontextlost', lost);
        canvas.addEventListener('webglcontextrestored', restored);
        const box = host.getBoundingClientRect();
        onScreen = box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
        resize();
        if (!failed) showRenderer('webgl');
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(host);
        } else window.addEventListener('resize', resize);
        if (typeof IntersectionObserver !== 'undefined') {
          intersectionObserver = new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            sync();
          });
          intersectionObserver.observe(host);
        }
      }
    } catch {
      fallback('unavailable');
    }
    runtimeRef.current = { sync, resize };
    themeObserver = new MutationObserver(sync);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      disposed = true;
      runtimeRef.current = null;
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      themeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibilityChange);
      media.removeEventListener('change', motionChange);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      scene.clear();
      renderer?.dispose();
    };
  }, []);

  useEffect(() => { runtimeRef.current?.sync(); }, [activity, paused]);
  useEffect(() => { runtimeRef.current?.resize(); }, [resolvedSizeScale]);

  const staticFallback = rendererState === 'unavailable' || rendererState === 'context-lost';
  const motionLabel = reducedMotion ? 'Globe motion is off because reduced motion is enabled'
    : staticFallback ? 'Globe motion is unavailable because 3D rendering is unavailable'
      : rendererState !== 'webgl' ? 'Globe motion is loading'
        : paused ? 'Resume globe animation' : 'Pause globe animation';
  const motionDescription = staticFallback ? ' A static globe is shown because 3D rendering is unavailable.'
    : reducedMotion ? ' Animation is disabled by your reduced motion preference.'
      : paused ? ' Animation is paused.' : '';
  return <>
    <div
      ref={hostRef}
      className="mari-globe"
      role="img"
      aria-label={`Mari geodesic identity globe. ${activityLabels[activity] || activityLabels.offline}. Ambient rotation is independent of this status.${motionDescription}`}
      data-activity={activity}
      data-renderer={rendererState}
      data-paused={paused}
      data-size-scale={resolvedSizeScale}
    >
      <StaticGlobe sizeScale={resolvedSizeScale} />
      <canvas ref={canvasRef} className="mari-globe-canvas" aria-hidden="true" />
      {staticFallback && <span className="mari-globe-fallback-note" aria-hidden="true">Static globe · 3D unavailable</span>}
    </div>
    {showControls && <Button
      className="mari-globe-motion"
      variant="ghost"
      size="icon-sm"
      type="button"
      aria-label={motionLabel}
      title={motionLabel}
      disabled={reducedMotion || rendererState !== 'webgl' || !onPausedChange}
      onClick={() => onPausedChange?.(!paused)}
    >
      {paused || reducedMotion ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
    </Button>}
  </>;
}
