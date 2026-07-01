import React from 'react';

interface Dot {
  s: number; // string index (0 = thinnest, numStrings - 1 = thickest)
  f: number; // fret number
  label: string; // R, 3, 5, etc.
  color: string; // Hex color
}

interface FretboardVisualizerProps {
  numStrings: number;
  numFrets: number;
  dots: Dot[];
  minFret?: number;
  sequenceLine?: boolean;
  boxName?: string;
  onHelpClick?: () => void;
  onPlayClick?: () => void;
}

export const FretboardVisualizer: React.FC<FretboardVisualizerProps> = ({
  numStrings,
  numFrets,
  dots,
  minFret = 1,
  sequenceLine = false,
  boxName = "",
  onHelpClick,
  onPlayClick
}) => {
  const w = 260;
  const stringSpacing = 24;
  const topPadding = 20;
  const h = (numStrings - 1) * stringSpacing;
  const svgHeight = h + topPadding + 32;
  const fretSpacing = w / numFrets;

  // Draw sequence line if requested
  let sequenceLineElement: React.ReactNode = null;
  if (sequenceLine && dots.length > 0) {
    const sortedDots = [...dots].sort((a, b) => (b.s !== a.s ? b.s - a.s : a.f - b.f));
    const points = sortedDots
      .map(d => `${15 + ((d.f - minFret + 0.5) * fretSpacing * 0.85)},${topPadding + (d.s * stringSpacing)}`)
      .join(' ');
    sequenceLineElement = (
      <polyline
        points={points}
        fill="none"
        stroke="#fbbf24"
        strokeOpacity={0.8}
        strokeWidth={2.5}
        className="animate-flow"
      />
    );
  }

  // Draw strings
  const stringsElements: React.ReactNode[] = [];
  for (let i = 0; i < numStrings; i++) {
    const y = topPadding + i * stringSpacing;
    const strokeColor = i === 0 || (numStrings === 6 && i === 1) ? '#ffffff' : '#9ca3af';
    const strokeW = 1.5 + i * 0.4;
    stringsElements.push(
      <line
        key={`str-${i}`}
        x1={15}
        y1={y}
        x2={w - 15}
        y2={y}
        stroke={strokeColor}
        strokeOpacity={0.7}
        strokeWidth={strokeW}
      />
    );
  }

  // Draw frets and position labels
  const fretsElements: React.ReactNode[] = [];
  const fretLabels: React.ReactNode[] = [];
  for (let i = 0; i <= numFrets; i++) {
    const x = 15 + i * fretSpacing * 0.85;
    fretsElements.push(
      <line
        key={`fret-${i}`}
        x1={x}
        y1={topPadding}
        x2={x}
        y2={topPadding + h}
        stroke="#4b5563"
        strokeWidth={2}
      />
    );
    if (i < numFrets) {
      fretLabels.push(
        <text
          key={`lbl-${i}`}
          x={x + fretSpacing * 0.425}
          y={topPadding + h + 22}
          fill="#94a3b8"
          fontSize="11"
          fontWeight="bold"
          textAnchor="middle"
          className="font-mono"
        >
          {minFret + i}
        </text>
      );
    }
  }

  return (
    <div
      className="flex flex-col items-center snap-center shrink-0 bg-black/30 p-4 sm:p-5 rounded-2xl border border-indigo-500/20 relative shadow-inner"
      style={{ width: `${w + 40}px`, maxWidth: '100%', flex: '0 0 auto' }}
    >
      {onHelpClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHelpClick();
          }}
          className="absolute top-2 left-2 animate-bulb text-amber-400 hover:text-amber-300 transition-all p-2 sm:p-2.5 z-10 scale-105 active:scale-95 bg-black/40 hover:bg-black/60 rounded-full"
          title="💡 Learn Chord/Scale Secrets"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </button>
      )}

      {onPlayClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayClick();
          }}
          className="absolute top-2 right-2 text-indigo-400 hover:text-emerald-400 transition-all p-2 sm:p-2.5 z-10 hover:scale-110 active:scale-90 bg-black/40 hover:bg-black/60 rounded-full"
          title="🔊 Listen to this Shape"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      )}

      {boxName && (
        <span className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-4 uppercase tracking-widest text-center">
          {boxName}
        </span>
      )}

      <svg
        viewBox={`0 0 ${w} ${svgHeight}`}
        style={{ width: '100%', height: 'auto', aspectRatio: `${w} / ${svgHeight}`, display: 'block' }}
        className="select-none font-mono"
      >
        {stringsElements}
        {fretsElements}
        {fretLabels}
        {sequenceLineElement}

        {/* Dots with pop-in animations */}
        {dots.map((dot, index) => {
          const y = topPadding + dot.s * stringSpacing;
          const x = 15 + (dot.f - minFret + 0.5) * fretSpacing * 0.85;
          const isRoot = dot.label === 'R';
          const r = isRoot ? 13 : 11;
          const delay = (numStrings - 1 - dot.s) * 150;

          return (
            <g
              key={`dot-${index}`}
              className="pop-in-note"
              style={{
                animationDelay: `${delay}ms`,
                transformOrigin: `${x}px ${y}px`
              }}
            >
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={dot.color}
                stroke={isRoot ? '#e0e7ff' : '#6366f1'}
                strokeWidth={2}
              />
              <text
                x={x}
                y={y + 4}
                fill="#ffffff"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                {dot.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
