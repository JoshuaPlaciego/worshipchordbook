import React, { useState, useEffect } from 'react';

export function LiveConcertClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col text-left select-none">
      <span className="text-[11px] font-mono font-black text-indigo-300 drop-shadow-[0_0_4px_rgba(129,140,248,0.3)] tracking-wider">
        {time || '00:00:00'}
      </span>
    </div>
  );
}
