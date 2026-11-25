'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SequentialBackgroundAnimationProps {
  totalFrames?: number;
  fps?: number;
  initialHoldMs?: number;
  endHoldMs?: number;
  transitionMs?: number;
  className?: string;
}

export default function SequentialBackgroundAnimation({
  totalFrames = 80,
  fps = 16,
  initialHoldMs = 600,
  endHoldMs = 1200,
  transitionMs = 600,
  className = 'fixed inset-0 pointer-events-none -z-10 overflow-hidden',
}: SequentialBackgroundAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentFrameRef = useRef<number>(0);
  const animStateRef = useRef<'init' | 'playing' | 'hold-end' | 'transitioning'>('init');
  const lastFrameTimeRef = useRef<number>(0);
  const stateStartTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const [firstFrameLoaded, setFirstFrameLoaded] = useState<boolean>(false);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Canvas scaling to match devicePixelRatio without blurring
    const updateCanvasSize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      renderCurrent();
    };

    const drawSingleImage = (img: HTMLImageElement, alpha = 1.0) => {
      if (!canvas || !ctx || !img.complete || img.naturalWidth === 0) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const iw = img.naturalWidth || 1280;
      const ih = img.naturalHeight || 720;

      const canvasRatio = cw / ch;
      const imageRatio = iw / ih;

      let renderW: number;
      let renderH: number;
      let offsetX: number;
      let offsetY: number;

      // Object-fit: cover implementation for canvas
      if (canvasRatio > imageRatio) {
        renderW = cw;
        renderH = cw / imageRatio;
        offsetX = 0;
        offsetY = (ch - renderH) / 2;
      } else {
        renderH = ch;
        renderW = ch * imageRatio;
        offsetX = (cw - renderW) / 2;
        offsetY = 0;
      }

      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, Math.round(offsetX), Math.round(offsetY), Math.round(renderW), Math.round(renderH));
    };

    const renderCurrent = () => {
      const img = imagesRef.current[currentFrameRef.current];
      if (img && img.complete) {
        drawSingleImage(img, 1.0);
      }
    };

    // Preload frames progressively
    imagesRef.current = new Array(totalFrames);

    // Load Frame 0 first for immediate rendering
    const img0 = new Image();
    img0.src = `/api/animation-frame/0`;
    img0.onload = () => {
      imagesRef.current[0] = img0;
      setFirstFrameLoaded(true);
      updateCanvasSize();
      renderCurrent();
    };

    // Preload remaining frames
    for (let i = 1; i < totalFrames; i++) {
      const img = new Image();
      img.src = `/api/animation-frame/${i}`;
      img.onload = () => {
        imagesRef.current[i] = img;
      };
    }

    window.addEventListener('resize', updateCanvasSize);
    updateCanvasSize();

    if (prefersReducedMotion) {
      // For reduced motion, hold static frame 0 or early frame
      return () => {
        window.removeEventListener('resize', updateCanvasSize);
      };
    }

    const frameIntervalMs = 1000 / fps;
    let isTabVisible = !document.hidden;

    const onVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        lastFrameTimeRef.current = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Animation Loop
    const loop = (timestamp: number) => {
      if (!isTabVisible) {
        rafIdRef.current = requestAnimationFrame(loop);
        return;
      }

      const state = animStateRef.current;

      if (state === 'init') {
        if (!stateStartTimeRef.current) stateStartTimeRef.current = timestamp;
        if (timestamp - stateStartTimeRef.current >= initialHoldMs) {
          animStateRef.current = 'playing';
          lastFrameTimeRef.current = timestamp;
        }
        renderCurrent();
      } else if (state === 'playing') {
        const elapsed = timestamp - lastFrameTimeRef.current;
        if (elapsed >= frameIntervalMs) {
          lastFrameTimeRef.current = timestamp - (elapsed % frameIntervalMs);
          const nextFrame = currentFrameRef.current + 1;

          if (nextFrame >= totalFrames) {
            currentFrameRef.current = totalFrames - 1;
            animStateRef.current = 'hold-end';
            stateStartTimeRef.current = timestamp;
          } else {
            // Check if next frame is ready before advancing to prevent blank flash
            if (imagesRef.current[nextFrame]?.complete) {
              currentFrameRef.current = nextFrame;
            }
          }
          renderCurrent();
        }
      } else if (state === 'hold-end') {
        if (timestamp - stateStartTimeRef.current >= endHoldMs) {
          animStateRef.current = 'transitioning';
          stateStartTimeRef.current = timestamp;
        }
        renderCurrent();
      } else if (state === 'transitioning') {
        const progress = Math.min(1, (timestamp - stateStartTimeRef.current) / transitionMs);
        const endImg = imagesRef.current[totalFrames - 1];
        const startImg = imagesRef.current[0];

        if (endImg?.complete && startImg?.complete) {
          drawSingleImage(endImg, 1.0);
          drawSingleImage(startImg, progress);
        }

        if (progress >= 1) {
          currentFrameRef.current = 0;
          animStateRef.current = 'init';
          stateStartTimeRef.current = timestamp;
          renderCurrent();
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [totalFrames, fps, initialHoldMs, endHoldMs, transitionMs]);

  return (
    <div
      className={className}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className={`w-full h-full block transition-opacity duration-700 ${
          firstFrameLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
