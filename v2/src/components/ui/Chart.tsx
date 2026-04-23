import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

interface Props {
  type: 'line' | 'bar';
  labels: string[];
  data: number[];
  unit?: string;
}

export function PremiumChart({ type, labels, data, unit = 'CHF' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0, 'rgba(129,140,248,0.45)');
    grad.addColorStop(0.5, 'rgba(129,140,248,0.15)');
    grad.addColorStop(1, 'rgba(129,140,248,0)');

    const config: ChartConfiguration = {
      type,
      data: {
        labels,
        datasets: [
          {
            label: `Valeur (${unit})`,
            data,
            borderColor: '#a5b4fc',
            backgroundColor: type === 'bar' ? 'rgba(129,140,248,0.55)' : grad,
            borderWidth: type === 'bar' ? 0 : 2.5,
            tension: 0.4,
            fill: type === 'line',
            pointRadius: 0,
            pointHoverRadius: 7,
            pointHoverBackgroundColor: '#c7d2fe',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0b0f1c',
            borderColor: '#818cf8',
            borderWidth: 1,
            titleColor: '#eef2ff',
            bodyColor: '#b8c4e0',
            padding: 12,
            cornerRadius: 10,
            displayColors: false,
          },
        },
        scales: {
          x: { grid: { color: 'rgba(129,140,248,0.04)' }, ticks: { color: '#6f82a8', font: { size: 10 } } },
          y: { grid: { color: 'rgba(129,140,248,0.06)' }, ticks: { color: '#6f82a8', font: { size: 10 }, callback: (v) => `${v} ${unit}` } },
        },
      },
    };
    chartRef.current = new ChartJS(ctx, config);
    return () => chartRef.current?.destroy();
  }, [type, labels, data, unit]);

  return <canvas ref={canvasRef} />;
}
