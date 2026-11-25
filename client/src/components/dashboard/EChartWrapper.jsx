// client/src/components/dashboard/EChartWrapper.jsx
import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import {
  BarChart,
  LineChart,
  PieChart,
  FunnelChart,
  TreemapChart
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  FunnelChart,
  TreemapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer
]);

export default function EChartWrapper({
  option,
  height = 280,
  onChartClick,
  className = ''
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const clickHandlerRef = useRef(onChartClick);

  useEffect(() => {
    clickHandlerRef.current = onChartClick;
  }, [onChartClick]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const instance = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = instance;

    instance.on('click', (params) => {
      if (clickHandlerRef.current) {
        clickHandlerRef.current(params);
      }
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current && !chartRef.current.isDisposed()) {
        chartRef.current.resize();
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (!instance.isDisposed()) {
        instance.dispose();
      }
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && !chartRef.current.isDisposed() && option) {
      chartRef.current.setOption(option, { notMerge: true, lazyUpdate: false });
    }
  }, [option]);

  return (
    <div
      ref={containerRef}
      style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
      className={className}
    />
  );
}
