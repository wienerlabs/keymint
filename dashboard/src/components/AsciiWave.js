import { useEffect, useRef } from "react";

const COLORS = ["#7DD8FF", "#FF7D97", "#FFE57D"];
const CHARS = "~≈∿∾~≈∿∾~";

export default function AsciiWave() {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let animId;
    let cols, rows;
    const cellW = 18;
    const cellH = 24;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.ceil(canvas.width / cellW) + 1;
      rows = Math.ceil(canvas.height / cellH) + 1;
    }

    resize();
    window.addEventListener("resize", resize);

    function draw() {
      const t = frameRef.current * 0.02;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "14px AuxMono, monospace";
      ctx.textBaseline = "middle";

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * cellW;
          const y = row * cellH;

          // layered sine waves
          const wave1 = Math.sin(col * 0.15 + row * 0.08 + t);
          const wave2 = Math.sin(col * 0.08 - row * 0.12 + t * 0.7);
          const wave3 = Math.sin(col * 0.05 + row * 0.05 + t * 1.3);
          const combined = (wave1 + wave2 + wave3) / 3;

          // pick color based on position wave
          const colorWave = Math.sin(col * 0.1 + row * 0.06 + t * 0.5);
          const colorIdx =
            colorWave < -0.33 ? 0 : colorWave < 0.33 ? 1 : 2;

          // opacity from wave intensity
          const opacity = 0.03 + Math.abs(combined) * 0.07;

          // pick char
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
