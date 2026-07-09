"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../lib/utils";

interface AnimatedBeamProps {
  className?: string;
  containerRef: React.RefObject<HTMLElement | null>;
  fromRef: React.RefObject<HTMLElement | null>;
  toRef: React.RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}

export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 4,
  delay = 0,
  pathColor = "gray",
  pathWidth = 2,
  pathOpacity = 0.2,
  gradientStartColor = "#10b981",
  gradientStopColor = "#10b981",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: AnimatedBeamProps) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [pathD, setPathD] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef]);

  useEffect(() => {
    if (!containerRef.current || !fromRef.current || !toRef.current || !svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const rectA = fromRef.current.getBoundingClientRect();
    const rectB = toRef.current.getBoundingClientRect();

    const fromX = rectA.left - svgRect.left + rectA.width / 2 + startXOffset;
    const fromY = rectA.top - svgRect.top + rectA.height / 2 + startYOffset;
    const toX = rectB.left - svgRect.left + rectB.width / 2 + endXOffset;
    const toY = rectB.top - svgRect.top + rectB.height / 2 + endYOffset;

    const width = toX - fromX;
    const height = toY - fromY;
    const hypotenuse = Math.sqrt(width * width + height * height);
    const curvatureX = curvature * (hypotenuse / 2) * (width > 0 ? 1 : -1);
    const curvatureY = curvature * (hypotenuse / 2) * (height > 0 ? 1 : -1);
    const controlPointX = (fromX + toX) / 2 - curvatureX;
    const controlPointY = (fromY + toY) / 2 - curvatureY;

    setPathD(`M ${fromX},${fromY} Q ${controlPointX},${controlPointY} ${toX},${toY}`);
  }, [containerRef, fromRef, toRef, size, curvature, startXOffset, startYOffset, endXOffset, endYOffset]);

  return (
    <svg
      ref={svgRef}
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      fill="none"
      className={cn("pointer-events-none absolute left-0 top-0 transform-gpu", className)}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={size.width} y2={size.height}>
          <stop stopColor={gradientStartColor} stopOpacity={0} />
          <stop stopColor={gradientStartColor} />
          <stop offset="0.5" stopColor={gradientStopColor} />
          <stop offset="1" stopColor={gradientStopColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      <path d={pathD} stroke={pathColor} strokeWidth={pathWidth} strokeOpacity={pathOpacity} fill="none" />

      <path
        d={pathD}
        stroke={`url(#${id})`}
        strokeWidth={pathWidth}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.18 0.82"
        className="nq-animated-beam"
        style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
        fill="none"
      />

      <style>{`
        @keyframes nq-animated-beam {
          from { stroke-dashoffset: ${reverse ? 0 : 1}; }
          to { stroke-dashoffset: ${reverse ? 1 : 0}; }
        }
        .nq-animated-beam {
          animation-name: nq-animated-beam;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>
    </svg>
  );
}
