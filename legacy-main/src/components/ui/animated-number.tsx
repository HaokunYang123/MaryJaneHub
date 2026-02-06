"use client";

import { useState, useEffect, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  format?: 'currency' | 'number' | 'percent';
}

/**
 * Animated number component that counts up when scrolled into view
 */
export function AnimatedNumber({
  value,
  duration = 1500,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  format = 'number',
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);

          const timeoutId = setTimeout(() => {
            let startTime: number;
            let animationFrame: number;

            const animate = (currentTime: number) => {
              if (!startTime) startTime = currentTime;
              const progress = Math.min((currentTime - startTime) / duration, 1);

              // Easing: easeOutQuart
              const easeOutQuart = 1 - Math.pow(1 - progress, 4);
              const currentValue = easeOutQuart * value;

              setDisplayValue(currentValue);

              if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
              } else {
                setDisplayValue(value);
              }
            };

            animationFrame = requestAnimationFrame(animate);
          }, delay);

          return () => clearTimeout(timeoutId);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [value, duration, delay, hasAnimated]);

  // Format the display value
  const formatValue = (val: number): string => {
    switch (format) {
      case 'currency':
        return val.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      case 'percent':
        return val.toFixed(decimals);
      default:
        return decimals > 0
          ? val.toFixed(decimals)
          : Math.floor(val).toLocaleString('en-US');
    }
  };

  return (
    <span ref={elementRef} className={`tabular-nums ${className}`}>
      {prefix}
      {formatValue(displayValue)}
      {suffix}
    </span>
  );
}

/**
 * Animated currency display
 */
export function AnimatedCurrency({
  value,
  duration = 1500,
  delay = 0,
  className = '',
}: {
  value: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <AnimatedNumber
      value={value}
      duration={duration}
      delay={delay}
      decimals={2}
      prefix="$"
      format="currency"
      className={className}
    />
  );
}

/**
 * Animated percentage display
 */
export function AnimatedPercent({
  value,
  duration = 1200,
  delay = 0,
  decimals = 1,
  className = '',
  showSign = false,
}: {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  className?: string;
  showSign?: boolean;
}) {
  const sign = showSign && value > 0 ? '+' : '';
  return (
    <AnimatedNumber
      value={value}
      duration={duration}
      delay={delay}
      decimals={decimals}
      prefix={sign}
      suffix="%"
      format="percent"
      className={className}
    />
  );
}
