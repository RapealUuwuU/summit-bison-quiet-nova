import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Bbox } from "@/lib/seismo/regions";
import type { HeatGrid, LandFile, Quake, SynthEvent } from "@/lib/seismo/model";

type Scenario = { lat: number; lon: number; mag: number };

type Props = {
  land: LandFile;
  view: Bbox;
  region: Bbox;
  events: Quake[];
  heat: HeatGrid | null;
  showHeat: boolean;
  showHist: boolean;
  scenario: Scenario | null;
  synth: SynthEvent[] | null;
  horizon: number;
  playFrac: number;
  onPick: (lat: number, lon: number) => void;
};

type Proj = {
  w: number;
  h: number;
  cos: number;
  x: (lon: number) => number;
  y: (lat: number) => number;
};

function project(view: Bbox): Proj {
  const mid = ((view.minLat + view.maxLat) / 2) * (Math.PI / 180);
  const cos = Math.max(0.2, Math.cos(mid));
  const w = Math.max(0.2, (view.maxLon - view.minLon) * cos);
  const h = Math.max(0.2, view.maxLat - view.minLat);
  return {
    w,
    h,
    cos,
    x: (lon) => (lon - view.minLon) * cos,
    y: (lat) => view.maxLat - lat,
  };
}

function ringPath(ring: [number, number][], proj: Proj): string {
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    d += `${i === 0 ? "M" : "L"}${proj.x(lon).toFixed(3)} ${proj.y(lat).toFixed(3)}`;
  }
  return `${d}Z`;
}

function heatUrl(heat: HeatGrid): string {
  const { cols, rows, values, p98 } = heat;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(cols, rows);
  for (let i = 0; i < values.length; i++) {
    const t = Math.max(0, Math.min(1, values[i] / p98));
    const eased = Math.sqrt(t);
    image.data[i * 4] = 228;
    image.data[i * 4 + 1] = Math.round(162 - 70 * eased);
    image.data[i * 4 + 2] = Math.round(58 + 40 * (1 - eased));
    image.data[i * 4 + 3] = Math.round(eased * 190);
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function dotRadius(mag: number, span: number): number {
  if (mag >= 7) return span * 0.012;
  if (mag >= 6) return span * 0.008;
  if (mag >= 5) return span * 0.0048;
  return span * 0.0032;
}

export function QuakeMap(props: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState("點地圖放假設主震");
  const [glow, setGlow] = useState<string | null>(null);
  const proj = useMemo(() => project(props.view), [props.view]);
  const span = Math.max(proj.w, proj.h);
  const label = span * 0.038;

  useEffect(() => {
    if (!props.showHeat || !props.heat) {
      setGlow(null);
      return;
    }
    setGlow(heatUrl(props.heat));
  }, [props.showHeat, props.heat]);

  const landD = useMemo(
    () => props.land.rings.map((ring) => ringPath(ring, proj)).join(""),
    [props.land, proj],
  );

  const visible = useMemo(() => {
    const inside = props.events.filter(
      (event) =>
        event.lon >= props.view.minLon &&
        event.lon <= props.view.maxLon &&
        event.lat >= props.view.minLat &&
        event.lat <= props.view.maxLat,
    );
    if (inside.length <= 6000) return inside;
    return inside.filter((event) => event.mag >= 5.5);
  }, [props.events, props.view]);

  const grid = useMemo(() => {
    const lineStep = proj.h > 12 ? 5 : 1;
    const lonLine = proj.w > 12 ? 5 : 1;
    const latLabel = proj.h > 24 ? 10 : proj.h > 12 ? 5 : proj.h > 6 ? 2 : 1;
    const lonLabel = proj.w > 24 ? 10 : proj.w > 12 ? 5 : proj.w > 6 ? 2 : 1;
    const lats: number[] = [];
    const lons: number[] = [];
    for (let lat = Math.ceil(props.view.minLat / lineStep) * lineStep; lat < props.view.maxLat; lat += lineStep) {
      lats.push(lat);
    }
    for (let lon = Math.ceil(props.view.minLon / lonLine) * lonLine; lon < props.view.maxLon; lon += lonLine) {
      lons.push(lon);
    }
    return {
      lats,
      lons,
      latText: lats.filter((lat) => lat % latLabel === 0),
      lonText: lons.filter((lon) => lon % lonLabel === 0),
    };
  }, [props.view, proj.h, proj.w]);

  function geoAt(event: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const local = point.matrixTransform(matrix.inverse());
    if (local.x < 0 || local.y < 0 || local.x > proj.w || local.y > proj.h) return null;
    return {
      lon: props.view.minLon + local.x / proj.cos,
      lat: props.view.maxLat - local.y,
      x: local.x,
      y: local.y,
    };
  }

  function pick(event: MouseEvent<SVGSVGElement>) {
    const geo = geoAt(event);
    if (!geo) return;
    props.onPick(geo.lat, geo.lon);
  }

  function hover(event: MouseEvent<SVGSVGElement>) {
    const geo = geoAt(event);
    if (!geo) {
      setCursor("點地圖放假設主震");
      return;
    }
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    let best: Quake | null = null;
    let bestD = 16;
    if (svg && matrix) {
      for (const quake of visible) {
        if (quake.mag < 5) continue;
        const point = svg.createSVGPoint();
        point.x = proj.x(quake.lon);
        point.y = proj.y(quake.lat);
        const screen = point.matrixTransform(matrix);
        const d = Math.hypot(screen.x - event.clientX, screen.y - event.clientY);
        if (d < bestD) {
          best = quake;
          bestD = d;
        }
      }
    }
    if (best) {
      setCursor(`M${best.mag.toFixed(1)} · ${best.dep.toFixed(0)} km · ${best.lat.toFixed(2)}°N ${best.lon.toFixed(2)}°E`);
    } else {
      setCursor(`${geo.lat.toFixed(2)}°N  ${geo.lon.toFixed(2)}°E`);
    }
  }

  const limit = props.playFrac * props.horizon;
  const rx = proj.x(props.region.minLon);
  const ry = proj.y(props.region.maxLat);
  const rw = proj.x(props.region.maxLon) - rx;
  const rh = proj.y(props.region.minLat) - ry;

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-lg border border-line bg-bg lg:h-map">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${proj.w} ${proj.h}`}
        className="h-full w-full"
        role="img"
        aria-label="西太平洋地震目錄地圖。點擊可放置假設主震。"
        onClick={pick}
        onMouseMove={hover}
      >
        <rect width={proj.w} height={proj.h} className="fill-raised" />
        {glow ? <image href={glow} width={proj.w} height={proj.h} /> : null}
        <path d={landD} className="fill-surface-2 stroke-accent" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        <g className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.7}>
          {grid.lats.map((lat) => (
            <line key={`lat-${lat}`} x1={0} x2={proj.w} y1={proj.y(lat)} y2={proj.y(lat)} />
          ))}
          {grid.lons.map((lon) => (
            <line key={`lon-${lon}`} y1={0} y2={proj.h} x1={proj.x(lon)} x2={proj.x(lon)} />
          ))}
        </g>
        <g className="fill-muted" fontSize={label} fontFamily="Outfit, sans-serif">
          {grid.latText.map((lat) => (
            <text key={`tlat-${lat}`} x={span * 0.02} y={proj.y(lat) - span * 0.012}>
              {lat}°N
            </text>
          ))}
          {grid.lonText.map((lon) => (
            <text key={`tlon-${lon}`} x={proj.x(lon) + span * 0.012} y={proj.h - span * 0.04}>
              {lon}°E
            </text>
          ))}
        </g>
        <rect
          x={rx}
          y={ry}
          width={rw}
          height={rh}
          fill="none"
          className="stroke-primary"
          strokeWidth={1.25}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        {props.showHist
          ? visible.map((event) => {
              const inside =
                event.lat >= props.region.minLat &&
                event.lat <= props.region.maxLat &&
                event.lon >= props.region.minLon &&
                event.lon <= props.region.maxLon;
              const strong = event.mag >= 6;
              return (
                <circle
                  key={`${event.ms}-${event.lat}-${event.lon}`}
                  cx={proj.x(event.lon)}
                  cy={proj.y(event.lat)}
                  r={dotRadius(event.mag, span)}
                  className={strong ? "fill-primary" : "fill-accent"}
                  opacity={(event.mag >= 7 ? 0.95 : strong ? 0.85 : 0.62) * (inside ? 1 : 0.28)}
                />
              );
            })
          : null}
        {props.showHist
          ? visible
              .filter((event) => event.mag >= 7)
              .filter((event, index, list) => {
                const x = proj.x(event.lon);
                const y = proj.y(event.lat);
                return !list.slice(0, index).some((other) => {
                  const dx = proj.x(other.lon) - x;
                  const dy = proj.y(other.lat) - y;
                  return dx * dx + dy * dy < span * span * 0.004;
                });
              })
              .map((event) => (
                <text
                  key={`m-${event.ms}-${event.lon}`}
                  x={proj.x(event.lon) + span * 0.014}
                  y={proj.y(event.lat) - span * 0.01}
                  className="fill-fg"
                  fontSize={label * 0.85}
                  fontWeight={600}
                  fontFamily="Outfit, sans-serif"
                >
                  {event.mag.toFixed(1)}
                </text>
              ))
          : null}
        {props.synth
          ? props.synth
              .filter((event) => event.tDays <= limit)
              .map((event, index) => (
                <circle
                  key={`s-${index}`}
                  cx={proj.x(event.lon)}
                  cy={proj.y(event.lat)}
                  r={event.mag >= 6 ? span * 0.008 : span * 0.0045}
                  className={event.kind === "background" ? "fill-fg" : "fill-accent"}
                  opacity={0.9}
                />
              ))
          : null}
        {props.scenario ? (
          <g
            className="stroke-primary fill-primary"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            transform={`translate(${proj.x(props.scenario.lon)} ${proj.y(props.scenario.lat)})`}
          >
            <circle r={span * 0.028} fill="none" />
            <line x1={-span * 0.04} x2={span * 0.04} />
            <line y1={-span * 0.04} y2={span * 0.04} />
            <text
              x={span * 0.045}
              y={-span * 0.03}
              stroke="none"
              fontSize={label * 0.85}
              fontWeight={600}
              fontFamily="Outfit, sans-serif"
            >
              {`M${props.scenario.mag.toFixed(1)}`}
            </text>
          </g>
        ) : null}
      </svg>
      <p className="pointer-events-none absolute top-3 left-3 max-w-[70%] rounded-md bg-surface px-2 py-1 text-xs text-muted">
        {cursor}
      </p>
    </div>
  );
}
