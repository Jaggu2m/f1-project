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

type RaceData = {
  track: { points: RawTrackPoint[]; length?: number };
  drivers: Record<string, DriverData>;
};

type RaceRendererProps = {
  raceTime: number;
  raceData: RaceData;
};

type Normalization = {
  minX: number;
  minY: number;
  scale: number;
};

type PitStop = {
  lap: number;
  enter: number;
  exit: number;
};

type DriverData = {
  driverCode: string;
  team: string;
  teamColor: string;
  positions: PositionPoint[];
  pitStops?: PitStop[];
};

/* =========================
   CONSTANTS
========================= */

const PADDING = 60;
const PIT_ALPHA = 0.25; // opacity when car is in pit
const PIT_OFFSET = 30;  // pixels sideways from racing line for pit lane


const TRACK_HALF_WIDTH = 100; // meters
const SMOOTHING = 0.15;  // Lower = smoother/floatier, higher = snappier (0-1).

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

  // Binary search for the right interval (faster than linear scan)
  let low = 0;
  let high = points.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (points[mid].t <= t) low = mid;
    else high = mid;
  }

  const p0 = points[low];
  const p1 = points[high];

  const a = (t - p0.t) / (p1.t - p0.t || 1);

  return {
    lap: p0.lap,
    s: p0.s + a * (p1.s - p0.s),
  };
}

function isInPit(driver: DriverData, raceTime: number) {
  return driver.pitStops?.some(
    p => raceTime >= p.enter && raceTime <= p.exit
  );
}

/* =========================
   COMPONENT
========================= */
export default function RaceRenderer({ raceTime, raceData }: RaceRendererProps) {
  const trackCanvas = useRef<HTMLCanvasElement>(null);
  const carCanvas = useRef<HTMLCanvasElement>(null);

  const [track, setTrack] = useState<TrackPoint[]>([]);

  const normRef = useRef<Normalization | null>(null);
  const lastXYRef = useRef<Record<string, { x: number; y: number }>>({});

  /* =========================
     BUILD TRACK ON DATA CHANGE
  ========================== */
  useEffect(() => {
    if (raceData?.track?.points) {
      setTrack(buildTrack(raceData.track.points));
    }
  }, [raceData]);

  /* =========================
     DRAW TRACK (TRUE HOLLOW)
  ========================== */
  /* =========================
     FULL SCREEN RESIZE
  ========================== */
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);


  /* =========================
     DRAW TRACK (TRUE HOLLOW)
  ========================== */
  /* =========================
     DRAW TRACK (SECTOR HIGHLIGHTS)
  ========================== */
  useEffect(() => {
    if (!track.length || !trackCanvas.current || !dimensions.width) return;

    const rotated = track.map(p => rotate(p.x, p.y));

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    rotated.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    // Fit to container
    const width = dimensions.width;
    const height = dimensions.height;

    const scale = Math.min(
      (width - PADDING * 2) / (maxX - minX),
      (height - PADDING * 2) / (maxY - minY)
    );

    normRef.current = { minX, minY, scale };

    const ctx = trackCanvas.current.getContext("2d")!;
    trackCanvas.current.width = width;
    trackCanvas.current.height = height;

    // Background
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, width, height);

    // Prepare Sector Paths
    const totalLength = track[track.length - 1].s;
    const s1End = totalLength / 3;
    const s2End = (totalLength * 2) / 3;

    const sectors = {
      left: [new Path2D(), new Path2D(), new Path2D()],
      right: [new Path2D(), new Path2D(), new Path2D()]
    };

    const getSectorIndex = (s: number) => {
      if (s < s1End) return 0;
      if (s < s2End) return 1;
      return 2;
    };

    // Check if the track data physically repeats the start point at the end
    // (buildTrack might have added it, or data came that way)
    const pFirst = track[0];
    const pLast = track[track.length - 1];
    const isClosedPhysically = Math.hypot(pFirst.x - pLast.x, pFirst.y - pLast.y) < 2;
    
    // If physically closed, we ignore the last point for geometry calculation
    // to avoid a zero-length segment (A->A) which breaks normals.
    const effectiveLen = isClosedPhysically ? track.length - 1 : track.length;

    // Calculate boundary points
    const leftPts: { x: number; y: number; s: number }[] = [];
    const rightPts: { x: number; y: number; s: number }[] = [];

    for (let i = 0; i < effectiveLen; i++) {
      const p = track[i];
      // Wrap around using effective length
      const next = track[(i + 1) % effectiveLen]; 

      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.hypot(dx, dy) || 1;

      const nx = -dy / len;
      const ny = dx / len;

      const leftPoint = rotate(
        p.x + nx * TRACK_HALF_WIDTH,
        p.y + ny * TRACK_HALF_WIDTH
      );

      const rightPoint = rotate(
        p.x - nx * TRACK_HALF_WIDTH,
        p.y - ny * TRACK_HALF_WIDTH
      );

      leftPts.push({
        x: (leftPoint.x - minX) * scale + PADDING,
        y: (leftPoint.y - minY) * scale + PADDING,
        s: p.s
      });
      rightPts.push({
        x: (rightPoint.x - minX) * scale + PADDING,
        y: (rightPoint.y - minY) * scale + PADDING,
        s: p.s
      });
    }

    // Build Paths
    const colors = ["#2a2a2a", "#333", "#2a2a2a"]; // Alternating dark colors
    
    // Helper to draw segments
    const drawRails = (pts: typeof leftPts, sectorPaths: Path2D[]) => {
       for (let i = 0; i < pts.length; i++) {
         const pCurr = pts[i];
         const pNext = pts[(i + 1) % pts.length]; // Explicit wrap for drawing
         
         const idx = getSectorIndex(pCurr.s);
         sectorPaths[idx].moveTo(pCurr.x, pCurr.y);
         sectorPaths[idx].lineTo(pNext.x, pNext.y);
       }
    };

    drawRails(leftPts, sectors.left);
    drawRails(rightPts, sectors.right);

    // Draw Sectors
    ctx.lineWidth = 2;
    [0, 1, 2].forEach(i => {
      ctx.strokeStyle = colors[i];
      ctx.stroke(sectors.left[i]);
      ctx.stroke(sectors.right[i]);
    });

    // Checkered start line (Reference from first points)
    if (leftPts.length > 0 && rightPts.length > 0) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(leftPts[0].x, leftPts[0].y);
      ctx.lineTo(rightPts[0].x, rightPts[0].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [track, dimensions]);

  /* =========================
   DRAW CARS (WITH PIT FADE)
  ========================= */
  useEffect(() => {
    if (!raceData || !track.length || !normRef.current || !carCanvas.current || !dimensions.width)
      return;

    const ctx = carCanvas.current.getContext("2d")!;
    carCanvas.current.width = dimensions.width;
    carCanvas.current.height = dimensions.height;
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const { minX, minY, scale } = normRef.current;

    Object.values(raceData.drivers).forEach((driver: DriverData) => {
      const interp = interpolateLapS(driver.positions, raceTime);
      if (!interp) return;

      // Backend 's' is already GLOBAL cumulative distance.
      const raceS = interp.s;
      const basePos = positionFromS(raceS, track);
      const r = rotate(basePos.x, basePos.y);

      let tx = (r.x - minX) * scale + PADDING;
      let ty = (r.y - minY) * scale + PADDING;

      // Pit lane offset: move car sideways off racing line
      const activePit = driver.pitStops?.find(
        p => raceTime >= p.enter && raceTime <= p.exit
      );

      if (activePit) {
        // Compute track direction normal for lateral offset
        const aheadPos = positionFromS(raceS + 10, track);
        const rAhead = rotate(aheadPos.x, aheadPos.y);
        const atx = (rAhead.x - minX) * scale + PADDING;
        const aty = (rAhead.y - minY) * scale + PADDING;

        const dirX = atx - tx;
        const dirY = aty - ty;
        const dirLen = Math.hypot(dirX, dirY) || 1;

        // Normal perpendicular to track direction
        const nx = -dirY / dirLen;
        const ny = dirX / dirLen;

        // Smooth transition: ease in/out over 3 seconds at pit boundaries
        const TRANSITION = 3;
        const pitDuration = activePit.exit - activePit.enter;
        const elapsed = raceTime - activePit.enter;
        const remaining = activePit.exit - raceTime;

        let blend = 1;
        if (elapsed < TRANSITION) {
          blend = elapsed / TRANSITION; // ease in
        } else if (remaining < TRANSITION && pitDuration > TRANSITION * 2) {
          blend = remaining / TRANSITION; // ease out
        }

        tx += nx * PIT_OFFSET * blend;
        ty += ny * PIT_OFFSET * blend;
      }

      const prev = lastXYRef.current[driver.driverCode];
      let x = tx;
      let y = ty;

      if (prev) {
        const dx = tx - prev.x;
        const dy = ty - prev.y;
        const dist = Math.hypot(dx, dy);

        const MAX_SMOOTH_DISTANCE = 200;

        if (dist < MAX_SMOOTH_DISTANCE) {
          x = prev.x + dx * SMOOTHING;
          y = prev.y + dy * SMOOTHING;
        }
      }

      lastXYRef.current[driver.driverCode] = { x, y };

      // PIT visual style
      const inPit = isInPit(driver, raceTime);
      ctx.globalAlpha = inPit ? PIT_ALPHA : 1.0;

      // Car dot
      ctx.fillStyle = driver.teamColor;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      ctx.fillText(driver.driverCode, x + 7, y + 4);

      // PIT badge next to car
      if (inPit) {
        ctx.fillStyle = "#cc0000";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText("PIT", x + 7, y + 14);
      }

      ctx.globalAlpha = 1.0;
    });
  }, [raceTime, raceData, track, dimensions]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}>
      <canvas ref={trackCanvas} style={{ position: "absolute", top: 0, left: 0 }} />
      <canvas ref={carCanvas} style={{ position: "absolute", top: 0, left: 0 }} />
    </div>
  );
}
