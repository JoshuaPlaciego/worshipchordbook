import React from 'react';

interface PianoVisualizerProps {
  absoluteNotes: number[];
  title?: string;
  scale?: number;
  isStandalone?: boolean;
  delayMs?: number;
  onHelpClick?: () => void;
  onPlayClick?: () => void;
}

export const PianoVisualizer: React.FC<PianoVisualizerProps> = ({
  absoluteNotes,
  title = "",
  scale = 1,
  isStandalone = true,
  delayMs = 150,
  onHelpClick,
  onPlayClick
}) => {
  // Dynamically calculate keys needed to avoid clipping
  const maxNote = absoluteNotes.length > 0 ? Math.max(...absoluteNotes) : 24;
  const numOctaves = Math.max(2, Math.ceil((maxNote + 2) / 12));

  const whiteKeys: number[] = [];
  const blackKeyOffsets: number[] = [];

  const wPattern = [0, 2, 4, 5, 7, 9, 11];
  const bPattern = [1, 3, -1, 6, 8, 10, -1];

  for (let o = 0; o < numOctaves; o++) {
    wPattern.forEach(n => whiteKeys.push(n + o * 12));
    bPattern.forEach(n => blackKeyOffsets.push(n === -1 ? -1 : n + o * 12));
  }
  // Cap off the keyboard with a final C
  whiteKeys.push(numOctaves * 12);
  blackKeyOffsets.push(-1);

  const w = 24;
  const h = 85;
  const rx = 2;
  const totalW = whiteKeys.length * w;
  const scaledW = totalW * scale;

  const content = (
    <svg
      viewBox={`0 0 ${totalW} ${h}`}
      style={{
        width: '100%',
        maxWidth: `${scaledW}px`,
        height: 'auto',
        aspectRatio: `${totalW} / ${h}`,
        display: 'block',
        margin: '0 auto'
      }}
      className="rounded-md shadow-[0_6px_20px_rgba(0,0,0,0.6)] border border-indigo-900/50 select-none"
    >
      {/* Draw all white keys first */}
      {whiteKeys.map((noteAbs, i) => {
        const isActive = absoluteNotes.includes(noteAbs);
        const noteIndexInChord = absoluteNotes.indexOf(noteAbs);
        const delay = isActive ? noteIndexInChord * delayMs : 0;

        const fill = isActive ? '#c7d2fe' : '#f8fafc';
        const stroke = isActive ? '#6366f1' : '#334155';
        const animClass = isActive ? 'play-key-white' : '';

        return (
          <rect
            key={`white-${i}`}
            x={i * w}
            y={0}
            width={w}
            height={h}
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            className={animClass}
            style={isActive ? { animationDelay: `${delay}ms` } : undefined}
          />
        );
      })}

      {/* Draw all black keys on top */}
      {blackKeyOffsets.map((noteAbs, i) => {
        if (noteAbs === -1) return null;

        const isActive = absoluteNotes.includes(noteAbs);
        const noteIndexInChord = absoluteNotes.indexOf(noteAbs);
        const delay = isActive ? noteIndexInChord * delayMs : 0;

        const fill = isActive ? '#4f46e5' : '#0f172a';
        const stroke = isActive ? '#818cf8' : '#000000';
        const animClass = isActive ? 'play-key-black' : '';

        return (
          <rect
            key={`black-${i}`}
            x={(i + 1) * w - w * 0.35}
            y={0}
            width={w * 0.7}
            height={h * 0.6}
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
            rx={rx}
            className={animClass}
            style={isActive ? { animationDelay: `${delay}ms` } : undefined}
          />
        );
      })}
    </svg>
  );

  if (isStandalone) {
    const maxWidth = scaledW + 40;
    return (
      <div
        className="flex flex-col items-center snap-center shrink-0 bg-black/30 p-4 sm:p-5 rounded-2xl border border-indigo-500/20 relative shadow-inner"
        style={{ width: `${maxWidth}px`, maxWidth: '100%', flex: '0 0 auto' }}
      >
        {onHelpClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHelpClick();
            }}
            className="absolute top-3 left-3 animate-bulb text-amber-400 hover:text-amber-300 transition-all p-1 z-10 scale-105 active:scale-95"
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
            className="absolute top-3 right-3 text-indigo-400 hover:text-emerald-400 transition-all p-1 z-10 hover:scale-110 active:scale-90"
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

        {title && (
          <span className="text-[10px] sm:text-xs text-indigo-300 font-extrabold mb-4 uppercase tracking-widest text-center w-full block">
            {title}
          </span>
        )}

        {content}
      </div>
    );
  }

  return content;
};
