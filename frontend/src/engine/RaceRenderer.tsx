import { useEffect, useRef, useState } from "react";

/* =========================
   TYPES
========================= */
type RawTrackPoint = { x: number; y: number };
type TrackPoint = { x: number; y: number; s: number };

type PositionPoint = {
  t: number;
  s: number;
  lap: number;
};

type DriverData = {
  driverCode: string;
  team: string;
  teamColor: string;
  positions: PositionPoint[];
};

type RaceData = {
  track: { points: RawTrackPoint[] };
  drivers: Record<string, DriverData>;
};

type RaceRendererProps = {
  raceTime: number;
};

type Normalization = {
  minX: number;
  minY: number;
  scale: number;
};

/* =========================
   CONSTANTS
========================= */
const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 600;
const PADDING = 60;

const TRACK_HALF_WIDTH = 100; // meters
const START_LINE_WIDTH = 10; // meters
const SMOOTHING = 0.25;

/* =========================
   UTILS
========================= */
const rotate = (x: number, y: number) => ({ x: y, y: -x });

function buildTrack(points: RawTrackPoint[]): TrackPoint[] {
  let s = 0;
  return points.map((p, i) => {
    if (i > 0) {
      const prev = points[i - 1];
      s += Math.hypot(p.x - prev.x, p.y - prev.y);
    }
    return { x: p.x, y: p.y, s };
  });
}

function getNormal(p0: RawTrackPoint, p1: RawTrackPoint) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function positionFromS(s: number, track: TrackPoint[]) {
  const len = track[track.length - 1].s;
  const wrapped = ((s % len) + len) % len;

  for (let i = 1; i < track.length; i++) {
    if (track[i].s >= wrapped) {
      const a = (wrapped - track[i - 1].s) / (track[i].s - track[i - 1].s);
      return {
        x: track[i - 1].x + a * (track[i].x - track[i - 1].x),
        y: track[i - 1].y + a * (track[i].y - track[i - 1].y),
      };
    }
  }
  return track[track.length - 1];
}

function interpolateLapS(points: PositionPoint[], t: number) {
  if (!points.length) return null;
  if (t <= points[0].t) return points[0];
  if (t >= points[points.length - 1].t)
    return points[points.length - 1];

  let i = 1;
  while (i < points.length && points[i].t < t) i++;

  const p0 = points[i - 1];
  const p1 = points[i];
  const a = (t - p0.t) / (p1.t - p0.t);

  return { lap: p0.lap, s: p0.s + a * (p1.s - p0.s) };
}

/* =========================
   COMPONENT
========================= */
export default function RaceRenderer({ raceTime }: RaceRendererProps) {
  const trackCanvas = useRef<HTMLCanvasElement>(null);
  const carCanvas = useRef<HTMLCanvasElement>(null);

  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [track, setTrack] = useState<TrackPoint[]>([]);

  const normRef = useRef<Normalization | null>(null);
  const lastXYRef = useRef<Record<string, { x: number; y: number }>>({});

  /* =========================
     LOAD DATA
  ========================== */
  useEffect(() => {
    fetch("/race_positions_silverstone_2023_lapaware.json")
      .then(res => res.json())
      .then(data => {
        setRaceData(data);
        setTrack(buildTrack(data.track.points));
      });
  }, []);

  /* =========================
     DRAW TRACK (TRUE HOLLOW)
  ========================== */
  useEffect(() => {
    if (!track.length || !trackCanvas.current) return;

    const rotated = track.map(p => rotate(p.x, p.y));

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    rotated.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const scale = Math.min(
      (CANVAS_WIDTH - PADDING * 2) / (maxX - minX),
      (CANVAS_HEIGHT - PADDING * 2) / (maxY - minY)
    );

    normRef.current = { minX, minY, scale };

    const ctx = trackCanvas.current.getContext("2d")!;
    trackCanvas.current.width = CANVAS_WIDTH;
    trackCanvas.current.height = CANVAS_HEIGHT;

    // Background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Build borders
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];

    for (let i = 0; i < track.length - 1; i++) {
      const p = track[i];
      const n = getNormal(track[i], track[i + 1]);

      const l = rotate(
        p.x + n.x * TRACK_HALF_WIDTH,
        p.y + n.y * TRACK_HALF_WIDTH
      );
      const r = rotate(
        p.x - n.x * TRACK_HALF_WIDTH,
        p.y - n.y * TRACK_HALF_WIDTH
      );

      left.push({
        x: (l.x - minX) * scale + PADDING,
        y: (l.y - minY) * scale + PADDING,
      });
      right.push({
        x: (r.x - minX) * scale + PADDING,
        y: (r.y - minY) * scale + PADDING,
      });
    }

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;

    ctx.beginPath();
    left.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    );
    ctx.stroke();

    ctx.beginPath();
    right.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    );
    ctx.stroke();

    // Checkered start line
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    ctx.lineTo(right[0].x, right[0].y);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [track]);

  /* =========================
     DRAW CARS
  ========================== */
  useEffect(() => {
    if (!raceData || !track.length || !normRef.current || !carCanvas.current)
      return;

    const ctx = carCanvas.current.getContext("2d")!;
    carCanvas.current.width = CANVAS_WIDTH;
    carCanvas.current.height = CANVAS_HEIGHT;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const { minX, minY, scale } = normRef.current;
    const trackLength = track[track.length - 1].s;

    Object.values(raceData.drivers).forEach(driver => {
      const interp = interpolateLapS(driver.positions, raceTime);
      if (!interp) return;

      const raceS = interp.lap * trackLength + interp.s;
      const pos = positionFromS(raceS, track);
      const r = rotate(pos.x, pos.y);

      const tx = (r.x - minX) * scale + PADDING;
      const ty = (r.y - minY) * scale + PADDING;

      const prev = lastXYRef.current[driver.driverCode];
      const x = prev ? prev.x + (tx - prev.x) * SMOOTHING : tx;
      const y = prev ? prev.y + (ty - prev.y) * SMOOTHING : ty;

      lastXYRef.current[driver.driverCode] = { x, y };

      ctx.fillStyle = driver.teamColor;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(driver.driverCode, x, y - 8);
    });
  }, [raceTime, raceData, track]);

  return (
    <div style={{ position: "relative", width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
      <canvas ref={trackCanvas} style={{ position: "absolute" }} />
      <canvas ref={carCanvas} style={{ position: "absolute" }} />
    </div>
  );
}
