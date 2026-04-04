import { useEffect, useRef } from "react";

const COLORS = ["#7DD8FF", "#FF7D97", "#FFE57D"];
const CHARS = "~\u2248\u223F\u223E~\u2248\u223F\u223E~";

export default function AsciiWave() {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let animId;
    let cols, rows;
    const cellW = 20;
    const cellH = 26;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = document.documentElement.scrollHeight;
      cols = Math.ceil(canvas.width / cellW) + 1;
      rows = Math.ceil(canvas.height / cellH) + 1;
    }

    resize();
    window.addEventListener("resize", resize);

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(document.body);

    function draw() {
      const t = frameRef.current * 0.015;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '18px "AuxMono", monospace';
      ctx.textBaseline = "middle";

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * cellW;
          const y = row * cellH;

          const wave1 = Math.sin(col * 0.12 + row * 0.06 + t);
          const wave2 = Math.sin(col * 0.07 - row * 0.1 + t * 0.6);
          const wave3 = Math.sin(col * 0.04 + row * 0.04 + t * 1.1);
          const combined = (wave1 + wave2 + wave3) / 3;

          const colorWave = Math.sin(col * 0.08 + row * 0.05 + t * 0.4);
          const colorIdx =
            colorWave < -0.33 ? 0 : colorWave < 0.33 ? 1 : 2;

          const opacity = 0.35 + Math.abs(combined) * 0.55;

          const charIdx = Math.floor(
            ((combined + 1) / 2) * (CHARS.length - 1)
          );

          ctx.fillStyle = COLORS[colorIdx];
          ctx.globalAlpha = opacity;
          ctx.fillText(CHARS[charIdx], x, y);
        }
      }

      ctx.globalAlpha = 1;
      frameRef.current++;
      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
