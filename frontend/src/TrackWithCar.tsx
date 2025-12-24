import { useEffect, useRef, useState } from "react";

type Point = { t: number; x: number; y: number };

type Norm = {
  minX: number;
  minY: number;
  scale: number;
};

export default function TrackWithCar() {
  const trackRef = useRef<HTMLCanvasElement>(null);
  const carRef = useRef<HTMLCanvasElement>(null);

  const [points, setPoints] = useState<Point[]>([]);
  const [playing, setPlaying] = useState(false);

  // animation refs (NO React state for animation)
  const timeRef = useRef(0);
  const normRef = useRef<Norm | null>(null);

  /* ============================
     LOAD DATA (ONCE)
     ============================ */
  useEffect(() => {
    fetch("/single_car_positions_monza.csv")
      .then(r => r.text())
      .then(text => {
        const rows = text.split("\n").slice(1);

        const pts: Point[] = rows
          .map(r => r.trim())
          .filter(Boolean)
          .map(r => r.split(",").map(Number))
          .filter(r => r.length === 3 && r.every(n => !isNaN(n)))
          .map(([t, x, y]) => ({ t, x, y }));

        setPoints(pts);

        // --- PRECOMPUTE NORMALIZATION ONCE ---
        const xs = pts.map(p => p.x);
        const ys = pts.map(p => p.y);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const scale = 700 / Math.max(maxX - minX, maxY - minY);

        normRef.current = { minX, minY, scale };

        drawTrack(pts);
      });
  }, []);

  /* ============================
     DRAW STATIC TRACK
     ============================ */
  const drawTrack = (pts: Point[]) => {
    if (!normRef.current) return;

    const canvas = trackRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 800;
    canvas.height = 800;

    const { minX, minY, scale } = normRef.current;

    ctx.clearRect(0, 0, 800, 800);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    pts.forEach((p, i) => {
      const x = (p.x - minX) * scale + 50;
      const y = canvas.height - ((p.y - minY) * scale + 50);

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  };

  /* ============================
     INTERPOLATION
     ============================ */
  const getCarPosition = (t: number) => {
    if (points.length < 2) return null;

    let i = points.findIndex(p => p.t > t);
    if (i <= 0) i = 1;
    if (i >= points.length) i = points.length - 1;

    const p0 = points[i - 1];
    const p1 = points[i];

    const alpha = (t - p0.t) / (p1.t - p0.t);

    return {
      x: p0.x + alpha * (p1.x - p0.x),
      y: p0.y + alpha * (p1.y - p0.y),
    };
  };

  /* ============================
     ANIMATION LOOP (SMOOTH)
     ============================ */
  useEffect(() => {
    if (!playing) return;

    let last = performance.now();
    let rafId: number;

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      timeRef.current += dt;

      // loop lap
      if (timeRef.current > points[points.length - 1]?.t) {
        timeRef.current = 0;
      }

      drawCar(timeRef.current);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [playing, points]);

  /* ============================
     DRAW CAR
     ============================ */
  const drawCar = (t: number) => {
    if (!normRef.current) return;

    const canvas = carRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 800;
    canvas.height = 800;
    ctx.clearRect(0, 0, 800, 800);

    const pos = getCarPosition(t);
    if (!pos) return;

    const { minX, minY, scale } = normRef.current;

    const x = (pos.x - minX) * scale + 50;
    const y = canvas.height - ((pos.y - minY) * scale + 50);

    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div>
      <div style={{ position: "relative", width: 800, height: 800 }}>
        <canvas ref={trackRef} style={{ position: "absolute" }} />
        <canvas ref={carRef} style={{ position: "absolute" }} />
      </div>

      <button onClick={() => setPlaying(p => !p)}>
        {playing ? "Pause" : "Play"}
      </button>
    </div>
  );
}
