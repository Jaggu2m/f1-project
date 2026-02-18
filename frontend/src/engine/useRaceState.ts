import { useMemo, useRef } from "react";

type PositionPoint = {
  t: number;
  s: number;
  lap: number;
};

/* ---- TELEMETRY TYPES ---- */
export type TelemetryPoint = {
  t: number;
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  drs: number;
  x: number;
  y: number;
};

type PitStop = {
  lap: number;
  enter: number;
  exit: number;
};

/* ---- NEW TYPES FOR BACKEND DATA ---- */
type LapData = {
  lap: number;
  startTime: number; 
  s1: number | null;
  s2: number | null;
  s3: number | null;
};

type DriverData = {
  driverCode: string;
  team: string;
  teamColor: string;
  positions: PositionPoint[];
  telemetry?: TelemetryPoint[]; // Added Telemetry
  pitStops?: PitStop[];
  laps?: LapData[]; 
  bestSectors?: {
    s1: number | null;
    s2: number | null;
    s3: number | null;
  };
  compound?: "SOFT" | "MEDIUM" | "HARD" | string;
};

export type RaceData = {
  track: { 
    points: { x: number; y: number }[];
    length?: number; 
  };
  drivers: Record<string, DriverData>;
  bestSectors?: {
    s1: number | null;
    s2: number | null;
    s3: number | null;
  };
};

export type DriverState = {
  driverCode: string;
  teamColor: string;
  lap: number;
  s: number;
  gap: number;
  interval: number;
  inPit: boolean;
  compound?: "SOFT" | "MEDIUM" | "HARD" | string;
  positionChange?: number;
  telemetry?: TelemetryPoint; // Interpolated Telemetry State
};

/* =========================
   INTERPOLATE POSITION
   (Unchanged)
========================= */
function interpolate(points: PositionPoint[], raceTime: number) {
  if (!points.length) return null;

  if (raceTime <= points[0].t) return points[0];
  if (raceTime >= points[points.length - 1].t)
    return points[points.length - 1];

  let i = 1;
  while (i < points.length && points[i].t < raceTime) i++;

  const p0 = points[i - 1];
  const p1 = points[i];

  const ratio = (raceTime - p0.t) / (p1.t - p0.t);

  return {
    t: raceTime,
    lap: p0.lap,
    s: p0.s + ratio * (p1.s - p0.s),
  };
}

/* =========================
   INTERPOLATE TELEMETRY
   (Binary Search + Linear Interpolation)
========================= */
function interpolateTelemetry(points: TelemetryPoint[], raceTime: number): TelemetryPoint | null {
  if (!points || !points.length) return null;

  // Global bounds check
  if (raceTime <= points[0].t) return points[0];
  if (raceTime >= points[points.length - 1].t) return points[points.length - 1];

  // Binary Search
  let low = 0;
  let high = points.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].t < raceTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // low is now the index of the first point > raceTime
  // so we want to interpolate between low-1 and low
  const i = low;
  if (i <= 0) return points[0];
  if (i >= points.length) return points[points.length - 1];

  const p0 = points[i - 1];
  const p1 = points[i];

  // Time delta
  const dt = p1.t - p0.t;
  if (dt <= 0) return p0;

  const ratio = (raceTime - p0.t) / dt;

  // Helper for linear interp
  const lerp = (a: number, b: number) => a + (b - a) * ratio;

  return {
    t: raceTime,
    speed: lerp(p0.speed, p1.speed),
    rpm: lerp(p0.rpm, p1.rpm),
    gear: ratio < 0.5 ? p0.gear : p1.gear, // Discrete value
    throttle: lerp(p0.throttle, p1.throttle),
    brake: lerp(p0.brake, p1.brake),
    drs: ratio < 0.5 ? p0.drs : p1.drs,     // Discrete value
    x: lerp(p0.x, p1.x),
    y: lerp(p0.y, p1.y),
  };
}

/* =========================
   FIND TIME FOR GIVEN S (BINARY SEARCH)
   (Unchanged)
========================= */
function findTimeForS(points: PositionPoint[], targetS: number) {
  if (!points.length) return 0;
  
  // Hande out of bounds
  if (targetS <= points[0].s) return points[0].t;
  if (targetS >= points[points.length - 1].s) return points[points.length - 1].t;

  // Binary Search for first point where points[i].s >= targetS
  let low = 0;
  let high = points.length - 1;
  
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].s < targetS) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  
  // Now 'low' is the index where points[low].s >= targetS
  // We want to interpolate between low-1 and low
  const i = low;
  const p0 = points[i - 1];
  const p1 = points[i];

  if (!p0) return p1.t; // Should not happen given bounds checks

  if (p1.s === p0.s) return p0.t;
  
  const ratio = (targetS - p0.s) / (p1.s - p0.s);
  return p0.t + ratio * (p1.t - p0.t);
}

/* =========================
   MAIN HOOK
========================= */
export function useRaceState(
  raceData: RaceData | null,
  raceTime: number
): DriverState[] {
  
  const prevOrderRef = useRef<string[]>([]);

  return useMemo(() => {
    if (!raceData) return [];

    const states: DriverState[] = [];
    const trackLen = raceData.track.length || 58000;

    // Silverstone 2023 Grid (Approximate/Verified)
    const GRID_ORDER = [
      "VER", "NOR", "PIA", "LEC", "SAI", "RUS", "HAM", "ALB", "ALO", "GAS",
      "HUL", "STR", "OCO", "TSU", "ZHO", "DEV", "MAG", "BOT", "SAR", "PER" // PER pit lane start or back
    ];

    /* ---- Build live position state ---- */
    Object.values(raceData.drivers).forEach((driver) => {
      if (!driver || !driver.positions) return;

      const interp = interpolate(driver.positions, raceTime);
      if (!interp) return;
      
      // Interpolate Telemetry
      const tel = driver.telemetry ? interpolateTelemetry(driver.telemetry, raceTime) : undefined;

      const inPit = driver.pitStops?.some(
        (pit) => raceTime >= pit.enter && raceTime <= pit.exit
      ) ?? false;

      // Derived lap
      const derivedLap = Math.max(1, Math.floor(interp.s / trackLen) + 1);
      
      // GRID SYNTHESIS:
      let displayS = interp.s;
      
      if (raceTime < 1.0) {
        const gridIndex = GRID_ORDER.indexOf(driver.driverCode);
        if (gridIndex !== -1) {
           displayS = trackLen - (gridIndex * 16); // 16m spacing
        }
      }

      // Mock compound data since it's missing from the JSON
      // Deterministic mock based on driverCode length or char code
      const mockCompounds = ["SOFT", "MEDIUM", "HARD"];
      const compoundIndex = (driver.driverCode.charCodeAt(0) + driver.driverCode.length) % 3;
      const compound = driver.compound || mockCompounds[compoundIndex];

      states.push({
        driverCode: driver.driverCode,
        teamColor: driver.teamColor,
        lap: derivedLap,
        s: displayS, // Use modified S
        gap: 0, 
        interval: 0,
        inPit,
        compound,
        positionChange: 0, 
        telemetry: tel || undefined
      });
    });

    // Compute distance traveled for gap calculation
    const driverKeys = Object.keys(raceData.drivers);
    const firstSMap: Record<string, number> = {};
    
    driverKeys.forEach(key => {
      const d = raceData.drivers[key];
      if (d.positions && d.positions.length > 0) {
        firstSMap[d.driverCode] = d.positions[0].s;
      }
    });

    states.forEach(d => {
      const firstS = firstSMap[d.driverCode] ?? 0;
      (d as any)._distanceTraveled = d.s - firstS;
    });

    // Stable sort
    states.sort((a, b) => {
      const diff = ((b as any)._distanceTraveled || 0) - ((a as any)._distanceTraveled || 0);
      
      // Tiebreaker: Use starting grid position (firstS)
      if (Math.abs(diff) < 0.5) {
        const firstSA = firstSMap[a.driverCode] ?? 0;
        const firstSB = firstSMap[b.driverCode] ?? 0;
        return firstSB - firstSA;
      }
      return diff;
    });

    if (!states.length) return [];

    /* ---- Compute Gaps & Intervals ---- */
    const leader = states[0];
    const leaderKey = driverKeys.find(k => raceData.drivers[k].driverCode === leader.driverCode);
    const leaderData = leaderKey ? raceData.drivers[leaderKey] : null;

    states.forEach((driverState, index) => {
      // 1. GAP TO LEADER
      if (index === 0) {
        driverState.gap = 0;
        driverState.interval = 0;
      } else if (leaderData) {
         // Distance traveled by this driver
        const myDistTraveled = (driverState as any)._distanceTraveled || 0;
        const leaderFirstS = firstSMap[leader.driverCode] ?? 0;
        const leaderSAtSameDist = myDistTraveled + leaderFirstS;
        
        const leaderTimeAtSameS = findTimeForS(leaderData.positions, leaderSAtSameDist);
        const rawGap = raceTime - leaderTimeAtSameS;
        driverState.gap = rawGap > 0.001 ? Math.round(rawGap * 1000) / 1000 : 0;

        // 2. INTERVAL
        const ahead = states[index - 1];
        const aheadKey = driverKeys.find(k => raceData.drivers[k].driverCode === ahead.driverCode);
        const aheadData = aheadKey ? raceData.drivers[aheadKey] : null;

        if (aheadData) {
          const aheadFirstS = firstSMap[ahead.driverCode] ?? 0;
          const aheadSAtSameDist = myDistTraveled + aheadFirstS;
          const aheadTimeAtSameS = findTimeForS(aheadData.positions, aheadSAtSameDist);
          const rawInterval = raceTime - aheadTimeAtSameS;
          driverState.interval = rawInterval > 0.001 ? Math.round(rawInterval * 1000) / 1000 : 0;
        }
      }

      // 3. Position Change
      const prevIndex = prevOrderRef.current.indexOf(driverState.driverCode);
      if (prevIndex !== -1) {
        driverState.positionChange = prevIndex - index;
      } else {
        driverState.positionChange = 0;
      }
    });

    // Update previous order ref for next frame
    prevOrderRef.current = states.map(s => s.driverCode);

    return states;
  }, [raceData, raceTime]);
}
