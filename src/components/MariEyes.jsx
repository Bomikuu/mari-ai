import { useId } from 'react';
import './mari-eyes.css';

const leftEye = 'M30 53C48 40 79 39 103 51C84 69 49 71 30 53Z';
const rightEye = 'M137 51C161 39 192 40 210 53C191 71 156 69 137 51Z';

/** A still identity illustration; expression is independent of agent activity. */
export function MariEyes({ compact = false }) {
  const instanceId = useId();
  const leftClip = `${instanceId}-mari-blue-eye`;
  const rightClip = `${instanceId}-mari-red-eye`;

  return <svg
    className={`mari-eyes${compact ? ' mari-eyes--compact' : ''}`}
    width="224"
    height="94"
    viewBox="0 0 240 100"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <clipPath id={leftClip}><path d={leftEye} /></clipPath>
      <clipPath id={rightClip}><path d={rightEye} /></clipPath>
    </defs>

    <g className="mari-eyes-crest">
      <path className="mari-eyes-gold-fill" d="M120 9L129 19L120 30L111 19L120 9Z" />
      <path className="mari-eyes-crest-inset" d="M120 13L125.5 19L120 25.5L114.5 19L120 13Z" />
      <path className="mari-eyes-paper-fill" d="M120 13L125.5 19L120 18.5L120 13Z" />
      <path className="mari-eyes-gold-line" d="M111 19L105 25M129 19L135 25" />
    </g>

    <g className="mari-eyes-brows">
      <path d="M39 30C56 25 76 26 92 31" />
      <path d="M148 31C164 26 184 25 201 30" />
    </g>

    <path className="mari-eyes-sclera" d={leftEye} />
    <path className="mari-eyes-sclera" d={rightEye} />

    <g clipPath={`url(#${leftClip})`}>
      <ellipse className="mari-eyes-blue-dark" cx="66" cy="52" rx="19" ry="22" />
      <path className="mari-eyes-blue" d="M49 50C52 43 80 43 83 50L83 64C75 76 57 76 49 64V50Z" />
      <path className="mari-eyes-blue-dark" d="M49 48C57 42 75 42 83 48V53C72 48 60 48 49 53V48Z" />
      <path className="mari-eyes-iris-facet" d="M53 57L60 64L58 69L51 63L53 57ZM79 57L72 64L74 69L81 63L79 57Z" />
      <ellipse className="mari-eyes-ink-fill" cx="66" cy="51" rx="6.3" ry="11" />
      <path className="mari-eyes-paper-fill" d="M57 44L62 43L62 49L57 50V44Z" />
      <circle className="mari-eyes-paper-fill" cx="75" cy="60" r="1.6" />
    </g>

    <g clipPath={`url(#${rightClip})`}>
      <ellipse className="mari-eyes-red-dark" cx="174" cy="52" rx="19" ry="22" />
      <path className="mari-eyes-red" d="M157 50C160 43 188 43 191 50V64C183 76 165 76 157 64V50Z" />
      <path className="mari-eyes-red-dark" d="M157 48C165 42 183 42 191 48V53C180 48 168 48 157 53V48Z" />
      <path className="mari-eyes-iris-facet" d="M161 57L168 64L166 69L159 63L161 57ZM187 57L180 64L182 69L189 63L187 57Z" />
      <ellipse className="mari-eyes-ink-fill" cx="174" cy="51" rx="6.3" ry="11" />
      <path className="mari-eyes-paper-fill" d="M165 44L170 43L170 49L165 50V44Z" />
      <circle className="mari-eyes-paper-fill" cx="183" cy="60" r="1.6" />
    </g>

    <g className="mari-eyes-upper-lids">
      <path d="M24 45L34 48C52 35 81 36 105 50L102 53C79 43 51 43 31 56L24 45Z" />
      <path d="M216 45L206 48C188 35 159 36 135 50L138 53C161 43 189 43 209 56L216 45Z" />
      <path d="M30 50L25 48L29 57L34 57L30 50Z" />
      <path d="M210 50L215 48L211 57L206 57L210 50Z" />
    </g>
    <g className="mari-eyes-lower-lids">
      <path d="M34 57C52 70 81 69 97 58" />
      <path d="M143 58C159 69 188 70 206 57" />
    </g>

    <g className="mari-eyes-glasses">
      <path d="M20 43L29 35L98 36C107 36 111 40 111 48L107 65C106 72 102 75 95 76L42 79C30 79 24 73 22 64L20 43Z" />
      <path d="M220 43L211 35L142 36C133 36 129 40 129 48L133 65C134 72 138 75 145 76L198 79C210 79 216 73 218 64L220 43Z" />
      <path d="M111 48C115 43 125 43 129 48M12 41L20 44M220 44L228 41" />
    </g>
    <path className="mari-eyes-gold-fill" d="M120 40L123 44L120 48L117 44L120 40Z" />
  </svg>;
}
