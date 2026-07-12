import React, { useState, useRef, useEffect } from 'react';

interface MarqueeTitleProps {
  title: string;
  className?: string;
  textSizeClass?: string; // e.g. "text-xl sm:text-2xl md:text-3xl"
  alignment?: 'center' | 'left';
}

export const MarqueeTitle: React.FC<MarqueeTitleProps> = ({
  title,
  className = '',
  textSizeClass = 'text-xl sm:text-2xl md:text-3xl',
  alignment = 'center',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isMarquee, setIsMarquee] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        // If text width is wider than container, activate continuous marquee
        setIsMarquee(textWidth > containerWidth - 4);
      }
    };

    // Run on mount & title change
    checkOverflow();
    
    // Simple delay to make sure styles/fonts are loaded & rendered
    const timer = setTimeout(checkOverflow, 100);

    window.addEventListener('resize', checkOverflow);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [title]);

  const wrapperClass = `w-full overflow-hidden whitespace-nowrap relative flex items-center ${
    isMarquee 
      ? 'justify-start' 
      : alignment === 'center' 
        ? 'justify-center mx-auto' 
        : 'justify-start'
  } ${className}`;

  if (isMarquee) {
    return (
      <div ref={containerRef} className={wrapperClass}>
        <div className="flex animate-marquee-train shrink-0">
          <span ref={textRef} className={`${textSizeClass} font-sans font-black tracking-tight uppercase pr-16`}>
            {title}
          </span>
        </div>
        <div className="flex animate-marquee-train shrink-0">
          <span className={`${textSizeClass} font-sans font-black tracking-tight uppercase pr-16`}>
            {title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={wrapperClass}>
      <span ref={textRef} className={`${textSizeClass} font-sans font-black tracking-tight uppercase truncate`}>
        {title}
      </span>
    </div>
  );
};
