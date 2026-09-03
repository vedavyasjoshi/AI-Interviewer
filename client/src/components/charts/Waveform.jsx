import { useEffect, useRef } from 'react';

// Live mic waveform for the recording state. When `active` becomes true it
// opens its own lightweight getUserMedia stream, runs a Web Audio AnalyserNode,
// and draws animated frequency bars on a canvas. It fully releases the mic and
// audio graph when `active` goes false or the component unmounts.
//
// It uses a separate stream from the recorder on purpose: the browser
// SpeechRecognition path never exposes a MediaStream, so this is the only way
// to visualize audio consistently across both STT paths.
export default function Waveform({ active, bars = 32 }) {
  const canvasRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    let stopped = false;
    let audioCtx;
    let stream;
    let rafId;

    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return; // permission denied / no mic — just render nothing animated
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);

      const freq = new Uint8Array(analyser.frequencyBinCount);
      const canvas = canvasRef.current;
      const ctx = canvas && canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;

      const resize = () => {
        if (!canvas) return;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();

      const draw = () => {
        if (stopped || !ctx) return;
        analyser.getByteFrequencyData(freq);
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        const step = Math.floor(freq.length / bars);
        const gap = 3;
        const barW = (w - gap * (bars - 1)) / bars;
        for (let i = 0; i < bars; i++) {
          // Average a slice of the spectrum for this bar.
          let sum = 0;
          for (let j = 0; j < step; j++) sum += freq[i * step + j];
          const v = sum / step / 255; // 0..1
          const barH = Math.max(2, v * h * 0.9);
          const x = i * (barW + gap);
          const y = (h - barH) / 2;
          // Louder bars trend toward the green accent.
          ctx.fillStyle = v > 0.55 ? '#4ee1a0' : '#6c8cff';
          const r = Math.min(barW / 2, 3);
          roundRect(ctx, x, y, barW, barH, r);
          ctx.fill();
        }
        rafId = requestAnimationFrame(draw);
      };
      draw();

      cleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
      };
    }

    run();

    return () => {
      stopped = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      } else if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [active, bars]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="waveform" aria-hidden="true" />;
}

// Small rounded-rect helper (older Safari lacks ctx.roundRect).
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
