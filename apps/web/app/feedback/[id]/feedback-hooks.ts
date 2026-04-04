"use client";

import { useEffect, useState } from "react";

export const useCountUp = (target: number, duration = 1200): number => {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let current = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      current = Math.min(current + step, target);
      setValue(Math.floor(current));
      if (current >= target) clearInterval(id);
    }, 16);

    return () => clearInterval(id);
  }, [target, duration]);

  return value;
};

export const useAnimWidth = (score: number, delay = 0): number => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setWidth(score), delay + 200);
    return () => clearTimeout(id);
  }, [score, delay]);

  return width;
};
