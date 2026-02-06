"use client";

import { useState, useEffect, useRef } from 'react';

interface UseAnimatedNumberOptions {
  duration?: number;
  delay?: number;
  decimals?: number;
}

/**
 * Hook to animate a number counting up
 * Uses Intersection Observer to trigger when element is visible
 */
export function useAnimatedNumber(
  targetValue: number,
  options: UseAnimatedNumberOptions = {}
) {
  const { duration = 1500, delay = 0, decimals = 0 } = options;
  const [displayValue, setDisplayValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);

          // Start animation after delay
          const timeoutId = setTimeout(() => {
            let startTime: number;
            let animationFrame: number;

            const animate = (currentTime: number) => {
              if (!startTime) startTime = currentTime;
              const progress = Math.min((currentTime - startTime) / duration, 1);

              // Easing function: easeOutQuart for smooth deceleration
              const easeOutQuart = 1 - Math.pow(1 - progress, 4);
              const currentValue = easeOutQuart * targetValue;

              setDisplayValue(
                decimals > 0
                  ? parseFloat(currentValue.toFixed(decimals))
                  : Math.floor(currentValue)
              );

              if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
              } else {
                setDisplayValue(targetValue);
              }
            };

            animationFrame = requestAnimationFrame(animate);

            return () => cancelAnimationFrame(animationFrame);
          }, delay);

          return () => clearTimeout(timeoutId);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [targetValue, duration, delay, decimals, hasAnimated]);

  return { displayValue, elementRef, hasAnimated };
}

/**
 * Format number as currency
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format number with commas
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Format as percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return value.toFixed(decimals) + '%';
}
