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
const SMOOTHING = 0.25;

/* =========================
   UTILS
========================= */
const rotate = (x: number, y: number) => ({ x: y, y: -x });

/* =========================
   TRACK HELPERS
========================= */
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

function positionFromS(s: number, track: TrackPoint[]) {
  const trackLength = track[track.length - 1].s;
  const wrapped = ((s % trackLength) + trackLength) % trackLength;

  for (let i = 1; i < track.length; i++) {
    if (track[i].s >= wrapped) {
      const p0 = track[i - 1];
      const p1 = track[i];
      const a = (wrapped - p0.s) / (p1.s - p0.s);
      return {
        x: p0.x + a * (p1.x - p0.x),
        y: p0.y + a * (p1.y - p0.y),
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

  return {
    lap: p0.lap,
    s: p0.s + a * (p1.s - p0.s),
  };
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
     RESET VISUAL SMOOTHING
  ========================== */
  useEffect(() => {
    lastXYRef.current = {};
  }, [raceTime]);

  /* =========================
     LOAD DATA
  ========================== */
  useEffect(() => {
    fetch("/race_positions_monaco_2023_lapaware.json")
      .then(res => res.json())
      .then((data: RaceData) => {
        setRaceData(data);
        setTrack(buildTrack(data.track.points));
      });
  }, []);

  /* =========================
     DRAW TRACK
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

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;

    ctx.beginPath();
    rotated.forEach((p, i) => {
      const x = (p.x - minX) * scale + PADDING;
      const y = (p.y - minY) * scale + PADDING;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [track]);

  /* =========================
     DRAW CARS (PURE)
  ========================== */
  useEffect(() => {
    if (!raceData || !track.length || !normRef.current || !carCanvas.current)
      return;

    const ctx = carCanvas.current.getContext("2d")!;
    carCanvas.current.width = CANVAS_WIDTH;
    carCanvas.current.height = CANVAS_HEIGHT;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

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

      ctx.fillStyle = "#fff";
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
