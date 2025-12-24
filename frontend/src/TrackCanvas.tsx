import { useEffect, useRef } from "react";

type Point = { x: number; y: number };

export default function TrackCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/track_geometry_monza.csv")
      .then(res => res.text())
      .then(text => {
  const lines = text.split("\n").slice(1);
  const points: Point[] = lines
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .map(line => {
    const [x, y] = line.split(",");
    return { x: Number(x), y: Number(y) };
  })
  .filter(p => !isNaN(p.x) && !isNaN(p.y));

  console.log("Loaded points:", points.length);
  console.log("Sample points:", points.slice(0, 5));

  drawTrack(points);
});

  }, []);

  const drawTrack = (points: Point[]) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 800;
    canvas.height = 800;

    // Normalize points
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const scale = 700 / Math.max(maxX - minX, maxY - minY);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = (p.x - minX) * scale + 50;
      const y = canvas.height - ((p.y - minY) * scale + 50);

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  };

  return <canvas ref={canvasRef} style={{ background: "#111" }} />;
}
