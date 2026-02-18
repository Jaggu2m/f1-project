import React, { useEffect, useRef, useState } from "react";

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

type RaceData = {
  track: { points: RawTrackPoint[]; length?: number };
  drivers: Record<string, DriverData>;
};

type RaceRendererProps = {
  raceTime: number;
  raceData: RaceData;
  selectedDriver?: string | null;
  onDriverSelect?: (code: string) => void;
};

type Normalization = {
  minX: number;
  minY: number;
  scale: number;
};

/* =========================
   CONSTANTS
========================= */

const PADDING = 60;
const PIT_ALPHA = 0.25; // opacity when car is in pit
const PIT_OFFSET = 30;  // pixels sideways from racing line for pit lane

// const TRACK_HALF_WIDTH = 100; // Unused, logic uses 200 * scale straight
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

/* =========================
   COMPONENT
========================= */
export default function RaceRenderer({ raceTime, raceData, selectedDriver, onDriverSelect }: RaceRendererProps) {
  const trackCanvas = useRef<HTMLCanvasElement>(null);
  const carCanvas = useRef<HTMLCanvasElement>(null);

  const [track, setTrack] = useState<TrackPoint[]>([]);
  const normRef = useRef<Normalization | null>(null);
  const lastXYRef = useRef<Record<string, { x: number; y: number }>>({});
  
  /* ---- CAMERA STATE ---- */
  // Target camera state
  const targetCam = useRef({ x: 0, y: 0, zoom: 1 });
  // Current camera state (for smoothing)
  const currentCam = useRef({ x: 0, y: 0, zoom: 1 });
  const animationFrameRef = useRef<number | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  /* ... resize observer ... */
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  /* =========================
     BUILD TRACK
  ========================== */
  useEffect(() => {
    if (raceData?.track?.points) {
      setTrack(buildTrack(raceData.track.points));
    }
  }, [raceData]);

  /* =========================
     CAMERA LERP LOGIC
  ========================== */
  useEffect(() => {
    const updateCamera = () => {
      // 1. Determine Target
      if (selectedDriver && lastXYRef.current[selectedDriver]) {
        const carPos = lastXYRef.current[selectedDriver];
        // We want car to be center. 
        // Logic: center = (width/2, height/2). 
        // Transform: translate(width/2, height/2) scale(zoom) translate(-carX, -carY)
        // Effectively: offset inputs by -carX, -carY, then scale, then center.
        
        targetCam.current = {
          x: carPos.x,
          y: carPos.y,
          zoom: 2.5
        };
      } else {
        targetCam.current = {
          x: dimensions.width / 2, 
          y: dimensions.height / 2,
          zoom: 1
        };
      }

      // 2. Lerp
      const t = 0.1; // Smooth factor
      currentCam.current.x += (targetCam.current.x - currentCam.current.x) * t;
      currentCam.current.y += (targetCam.current.y - currentCam.current.y) * t;
      currentCam.current.zoom += (targetCam.current.zoom - currentCam.current.zoom) * t;

      animationFrameRef.current = requestAnimationFrame(updateCamera);
    }
    
    animationFrameRef.current = requestAnimationFrame(updateCamera);
    return () => {
        if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [selectedDriver, dimensions]); // Depend on dimensions so reset works

  /* =========================
     DRAW LOOP
  ========================== */
  useEffect(() => {
    if (!raceData || !track.length || !trackCanvas.current || !carCanvas.current || !dimensions.width) return;

    const ctxTrack = trackCanvas.current.getContext("2d")!;
    const ctxCar = carCanvas.current.getContext("2d")!;
    
    trackCanvas.current.width = dimensions.width;
    trackCanvas.current.height = dimensions.height;
    carCanvas.current.width = dimensions.width;
    carCanvas.current.height = dimensions.height;

    // --- 1. Compute Base Normalization (Fit to Screen) ---
    if (!normRef.current) { 
        const rotated = track.map(p => rotate(p.x, p.y));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        rotated.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        const scale = Math.min(
            (dimensions.width - PADDING * 2) / (maxX - minX),
            (dimensions.height - PADDING * 2) / (maxY - minY)
        );
        normRef.current = { minX, minY, scale };
    }
    const { minX, minY, scale } = normRef.current;

    // --- 2. Apply Camera Transform ---
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const zoom = currentCam.current.zoom;
    const tx = currentCam.current.x; 
    const ty = currentCam.current.y;

    [ctxTrack, ctxCar].forEach(ctx => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);
        ctx.translate(-tx, -ty);
    });

    // --- 3. Draw Track ---
    // (Simplified drawing for performance)
    const rotated = track.map(p => rotate(p.x, p.y));
    const trackWidthPx = 200 * scale; 
    
    ctxTrack.lineCap = "round";
    ctxTrack.lineJoin = "round";
    
    // Outer
    ctxTrack.beginPath();
    ctxTrack.strokeStyle = "#444";
    ctxTrack.lineWidth = trackWidthPx;
    rotated.forEach((p, i) => {
        const tpx = (p.x - minX) * scale + PADDING;
        const tpy = (p.y - minY) * scale + PADDING;
        if(i===0) ctxTrack.moveTo(tpx, tpy);
        else ctxTrack.lineTo(tpx, tpy);
    });
    ctxTrack.stroke();
    
    // Inner
    ctxTrack.strokeStyle = "#222";
    ctxTrack.lineWidth = trackWidthPx - 4; 
    ctxTrack.stroke();
    
    // Start/Finish Line (Approx)
    if (rotated.length > 0) {
        const p0 = rotated[0];
        const tpx = (p0.x - minX) * scale + PADDING;
        const tpy = (p0.y - minY) * scale + PADDING;
        ctxTrack.beginPath();
        ctxTrack.fillStyle = "#fff";
        ctxTrack.arc(tpx, tpy, trackWidthPx/2, 0, Math.PI*2);
        ctxTrack.fill();
    }

    // --- 4. Draw Cars ---
    Object.values(raceData.drivers).forEach((driver: DriverData) => {
      const interp = interpolateLapS(driver.positions, raceTime);
      if (!interp) return;

      const raceS = interp.s;
      const basePos = positionFromS(raceS, track);
      const r = rotate(basePos.x, basePos.y);

      let cx = (r.x - minX) * scale + PADDING;
      let cy = (r.y - minY) * scale + PADDING;

      // Pit offset logic 
      const activePit = driver.pitStops?.find(p => raceTime >= p.enter && raceTime <= p.exit);
      if(activePit) { 
         // Simplified pit offset just to separate visually
         const aheadPos = positionFromS(raceS + 10, track);
         const rAhead = rotate(aheadPos.x, aheadPos.y);
         const ax = (rAhead.x - minX) * scale + PADDING;
         const ay = (rAhead.y - minY) * scale + PADDING;
         
         const dx = ay - cy; // Perpendicular vector (simplified)
         const dy = -(ax - cx); 
         const len = Math.hypot(dx, dy) || 1;
         
         cx += (dx/len) * PIT_OFFSET;
         cy += (dy/len) * PIT_OFFSET;
      }

      // Smoothing
      const prev = lastXYRef.current[driver.driverCode];
      if (prev && Math.hypot(cx - prev.x, cy - prev.y) < 200) {
          cx = prev.x + (cx - prev.x) * SMOOTHING;
          cy = prev.y + (cy - prev.y) * SMOOTHING;
      }
      lastXYRef.current[driver.driverCode] = { x: cx, y: cy };

      const isSelected = selectedDriver === driver.driverCode;

      // Draw Car
      ctxCar.fillStyle = driver.teamColor;
      ctxCar.globalAlpha = activePit ? PIT_ALPHA : (selectedDriver && !isSelected ? 0.3 : 1.0);
      
      ctxCar.beginPath();
      const radius = isSelected ? 8 : 5;
      ctxCar.arc(cx, cy, radius, 0, Math.PI * 2);
      ctxCar.fill();
      
      if (isSelected) {
          ctxCar.strokeStyle = "#fff";
          ctxCar.lineWidth = 2;
          ctxCar.stroke();
          
          ctxCar.beginPath();
          ctxCar.strokeStyle = "#00d2be"; 
          ctxCar.lineWidth = 2;
          ctxCar.arc(cx, cy, radius + 4, 0, Math.PI * 2);
          ctxCar.stroke();
      }

      // Label
      if (currentCam.current.zoom > 1.5 || isSelected) {
          ctxCar.fillStyle = "#fff";
          ctxCar.font = "11px sans-serif";
          ctxCar.fillText(driver.driverCode, cx + 10, cy + 4);
      }
      
      ctxCar.globalAlpha = 1.0;
    });

    ctxTrack.restore();
    ctxCar.restore();

  }, [raceTime, raceData, track, dimensions, selectedDriver]);

  /* =========================
     CLICK HANDLER
  ========================== */
  const handleCanvasClick = (e: React.MouseEvent) => {
      if (!trackCanvas.current || !onDriverSelect) return;
      const rect = trackCanvas.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      const zoom = currentCam.current.zoom;
      const tx = currentCam.current.x;
      const ty = currentCam.current.y;

      const worldX = (clickX - cx) / zoom + tx;
      const worldY = (clickY - cy) / zoom + ty;

      let bestDist = 20 / zoom; 
      let bestDriver = null;

      Object.entries(lastXYRef.current).forEach(([code, pos]) => {
          const dist = Math.hypot(pos.x - worldX, pos.y - worldY);
          if (dist < bestDist) {
              bestDist = dist;
              bestDriver = code;
          }
      });

      if (bestDriver) {
          onDriverSelect(bestDriver);
      } else {
          onDriverSelect(""); 
      }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", background: "#111" }} onClick={handleCanvasClick}>
      <canvas ref={trackCanvas} style={{ position: "absolute", top: 0, left: 0 }} />
      <canvas ref={carCanvas} style={{ position: "absolute", top: 0, left: 0 }} />
    </div>
  );
}
