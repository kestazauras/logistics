"use client";

import { Chart, DoughnutController, ArcElement } from "chart.js";
import { useEffect, useRef } from "react";

Chart.register(DoughnutController, ArcElement);

interface EfficiencyChartProps {
  efficiency: number;
  isDark: boolean;
}

export default function EfficiencyChart({ efficiency, isDark }: EfficiencyChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<"doughnut"> | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    chartRef.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        datasets: [
          {
            data: [0, 100],
            backgroundColor: ["#FF671F", "#e2e8f0"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: { tooltip: { enabled: false } },
        cutout: "75%",
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const color =
      efficiency >= 99.9 ? "#10b981" : efficiency > 70 ? "#FF671F" : "#ef4444";
    chart.data.datasets[0].data = [Math.min(100, efficiency), Math.max(0, 100 - efficiency)];
    chart.data.datasets[0].backgroundColor = [color, isDark ? "#374151" : "#e2e8f0"];
    chart.update();
  }, [efficiency, isDark]);

  return <canvas ref={canvasRef} id="efficiency-chart" />;
}
