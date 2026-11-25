// client/src/components/dashboard/ExecutiveChartsGrid.jsx
import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell
} from 'recharts';
import EChartWrapper from './EChartWrapper';
import { canAccessTab } from '../../utils/rbac';
import { formatInrCompact, formatInrFull } from '../../utils/dateRange';
import {
  BarChart3,
  PieChart as PieChartIcon,
  Filter,
  Hammer,
  Package,
  Users,
  Boxes,
  Truck,
  Sparkles
} from 'lucide-react';

const LEVEL_NAMES = {
  1: 'L1: Core & Stator',
  2: 'L2: Rotor & Winding',
  3: 'L3: Electronics',
  4: 'L4: Dyno & Thermal',
  5: 'L5: Final Calib.'
};

function SectionHeader({ icon: Icon, title, subtitle, actionLabel, onAction, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="h-4 w-4 text-sky-600 shrink-0" />}
          <h2 className="text-xs font-semibold text-slate-900 leading-snug">{title}</h2>
        </div>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {children}
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-[11px] font-medium text-sky-700 hover:underline cursor-pointer px-1"
          >
            {actionLabel} →
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExecutiveChartsGrid({
  currentUser,
  summary,
  activeDomain = 'all',
  onNavigate
}) {
  const [trendMode, setTrendMode] = useState('daily'); // 'daily' | 'cumulative'
  const [showQuoteOverlay, setShowQuoteOverlay] = useState(true);
  const [financeMixMode, setFinanceMixMode] = useState('breakdown'); // 'breakdown' | 'method'
  const [floorMode, setFloorMode] = useState('qc'); // 'wip' | 'qc'
  const [stockChartMode, setStockChartMode] = useState('treemap'); // 'treemap' | 'bar'

  const safeNav = (tab, opts) => {
    if (canAccessTab(currentUser, tab)) {
      onNavigate(tab, opts);
    }
  };

  const {
    leads = {},
    quotations = {},
    purchase_orders = {},
    finance = {},
    manufacturing = {},
    qc = {},
    inventory = {},
    logistics = {},
    customer_service = {},
    analytics = {}
  } = summary || {};

  // 1. ECharts Option: Revenue Bookings vs Collections Timeline
  const revenueTimelineOption = useMemo(() => {
    const rawTrend = analytics.revenue_trend || [];
    const dates = rawTrend.map((d) => d.date);
    const isCum = trendMode === 'cumulative';

    const poSeriesData = rawTrend.map((d) =>
      Number(isCum ? d.cum_po_value : d.po_value || 0)
    );
    const cashSeriesData = rawTrend.map((d) =>
      Number(isCum ? d.cum_cash_collected : d.cash_collected || 0)
    );
    const quoteSeriesData = rawTrend.map((d) => Number(d.quote_value || 0));

    const series = [
      {
        name: isCum ? 'Cumulative PO Book' : 'PO Bookings',
        type: isCum ? 'line' : 'bar',
        smooth: true,
        barMaxWidth: 28,
        itemStyle: { color: '#0f172a', borderRadius: [4, 4, 0, 0] },
        areaStyle: isCum ? { color: 'rgba(15, 23, 42, 0.12)' } : undefined,
        data: poSeriesData
      },
      {
        name: isCum ? 'Cumulative Cash' : 'Cash Collected',
        type: isCum ? 'line' : 'bar',
        smooth: true,
        barMaxWidth: 28,
        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
        areaStyle: isCum ? { color: 'rgba(16, 185, 129, 0.16)' } : undefined,
        data: cashSeriesData
      }
    ];

    if (showQuoteOverlay && !isCum) {
      series.push({
        name: 'Quotation Value',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: '#0284c7' },
        lineStyle: { width: 2, type: 'dashed' },
        data: quoteSeriesData
      });
    }

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 11 },
        valueFormatter: (val) => formatInrFull(val)
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11, color: '#475569' }
      },
      grid: { top: 20, right: 16, bottom: 38, left: 12, containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 10, color: '#64748b' },
        axisLine: { lineStyle: { color: '#e2e8f0' } }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          color: '#64748b',
          formatter: (val) => formatInrCompact(val)
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series
    };
  }, [analytics.revenue_trend, trendMode, showQuoteOverlay]);

  // 2. ECharts Option: Collection Breakdown / Payment Methods Donut
  const cashMixOption = useMemo(() => {
    let data = [];
    if (financeMixMode === 'breakdown') {
      data = [
        { name: 'Advance Received', value: Number(finance.advance_received || 0), itemStyle: { color: '#10b981' } },
        { name: 'Final Settlement', value: Number(finance.final_received || 0), itemStyle: { color: '#0d9488' } },
        { name: 'Milestone / Ret.', value: Number(finance.milestone_received || 0) + Number(finance.retention_received || 0), itemStyle: { color: '#0284c7' } },
        { name: 'Balance Receivable', value: Number(finance.balance_due || 0), itemStyle: { color: '#f59e0b' } }
      ].filter((d) => d.value > 0);
    } else {
      const palette = ['#0f172a', '#0284c7', '#10b981', '#8b5cf6', '#f59e0b'];
      data = (analytics.payment_by_method || [])
        .map((m, i) => ({
          name: `${String(m.method || 'Bank Transfer').replace(/_/g, ' ').toUpperCase()} (${m.count})`,
          value: Number(m.amount || 0),
          itemStyle: { color: palette[i % palette.length] }
        }))
        .filter((d) => d.value > 0);
    }

    if (data.length === 0) {
      data = [{ name: 'No Data', value: 1, itemStyle: { color: '#e2e8f0' } }];
    }

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        textStyle: { color: '#f8fafc', fontSize: 11 },
        formatter: (p) => `${p.name}<br/><strong>${formatInrFull(p.value)}</strong> (${p.percent}%)`
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 10, color: '#475569' }
      },
      series: [
        {
          type: 'pie',
          radius: ['48%', '74%'],
          center: ['50%', '43%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 11, fontWeight: 'bold', formatter: '{d}%' }
          },
          data
        }
      ]
    };
  }, [finance, analytics.payment_by_method, financeMixMode]);

  // 3. ECharts Option: End-to-End Commercial Funnel
  const funnelOption = useMemo(() => {
    const funnelItems = [
      {
        name: `Leads (${leads.total || 0})`,
        value: Math.max(1, Number(leads.estimated_value || 0)),
        rawVal: Number(leads.estimated_value || 0),
        module: 'leads',
        itemStyle: { color: '#6366f1' }
      },
      {
        name: `Quotations (${quotations.total || 0})`,
        value: Math.max(1, Number(quotations.total_value || 0)),
        rawVal: Number(quotations.total_value || 0),
        module: 'quotations',
        itemStyle: { color: '#0284c7' }
      },
      {
        name: `Sales POs (${purchase_orders.total || 0})`,
        value: Math.max(1, Number(purchase_orders.total_value || 0)),
        rawVal: Number(purchase_orders.total_value || 0),
        module: 'purchase_orders',
        itemStyle: { color: '#0f172a' }
      },
      {
        name: `Cash Collected (${finance.payment_count || 0})`,
        value: Math.max(1, Number(finance.total_received || 0)),
        rawVal: Number(finance.total_received || 0),
        module: 'payments',
        itemStyle: { color: '#10b981' }
      }
    ];

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        textStyle: { color: '#f8fafc', fontSize: 11 },
        formatter: (p) => `${p.name}<br/>Value: <strong>${formatInrFull(p.data.rawVal)}</strong><br/><span style="color:#94a3b8">Click to open module</span>`
      },
      series: [
        {
          name: 'Commercial Funnel',
          type: 'funnel',
          left: '8%',
          right: '8%',
          top: 10,
          bottom: 10,
          minSize: '26%',
          maxSize: '100%',
          sort: 'none',
          gap: 3,
          label: {
            show: true,
            position: 'inside',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 600,
            formatter: (p) => `${p.name}\n${formatInrCompact(p.data.rawVal)}`
          },
          itemStyle: { borderColor: '#fff', borderWidth: 1.5, borderRadius: 4 },
          data: funnelItems
        }
      ]
    };
  }, [leads, quotations, purchase_orders, finance]);

  // 4. Production Floor & QC By Level Data (Recharts)
  const levelChartData = useMemo(() => {
    const levelDist = manufacturing.level_distribution || {};
    const levelUnits = manufacturing.level_units || {};
    const qcList = qc.by_level || [];
    return [1, 2, 3, 4, 5].map((lvl) => {
      const qRow = qcList.find((x) => Number(x.level) === lvl) || {};
      return {
        level: LEVEL_NAMES[lvl],
        activeWOs: Number(levelDist[lvl] || 0),
        wipUnits: Number(levelUnits[lvl] || 0),
        inspections: Number(qRow.inspections || 0),
        passedUnits: Number(qRow.passed_units || 0),
        rejectedUnits: Number(qRow.rejected_units || 0)
      };
    });
  }, [manufacturing, qc]);

  // 5. ECharts Option: Warehouse Stock Valuation Treemap / Category Chart
  const warehouseOption = useMemo(() => {
    const cats = (inventory.stock_by_category || []).map((c) => ({
      name: c.category,
      value: Number(c.stock_value || 0),
      lowCount: Number(c.low_stock_count || 0),
      itemCount: Number(c.item_count || 0),
      itemStyle: {
        color: Number(c.low_stock_count || 0) > 0 ? '#e11d48' : '#0284c7'
      }
    }));

    if (stockChartMode === 'treemap') {
      return {
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          textStyle: { color: '#f8fafc', fontSize: 11 },
          formatter: (p) => {
            const d = p.data || {};
            return `<strong>${p.name}</strong><br/>Valuation: ${formatInrFull(d.value)}<br/>SKUs: ${d.itemCount || 0} • Low Stock: <span style="color:${d.lowCount > 0 ? '#fda4af' : '#6ee7b7'}">${d.lowCount || 0}</span>`;
          }
        },
        series: [
          {
            type: 'treemap',
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            top: 4,
            bottom: 4,
            left: 4,
            right: 4,
            label: {
              show: true,
              fontSize: 10,
              color: '#fff',
              formatter: (p) => `${p.name}\n${formatInrCompact(p.value)}`
            },
            itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2, borderRadius: 4 },
            data: cats.map((c, idx) => {
              const healthyColors = ['#0f172a', '#0369a1', '#0d9488', '#4f46e5', '#334155', '#0284c7', '#0f766e', '#1e293b'];
              return {
                ...c,
                itemStyle: {
                  color: c.lowCount > 0 ? '#e11d48' : healthyColors[idx % healthyColors.length]
                }
              };
            })
          }
        ]
      };
    }

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        textStyle: { color: '#f8fafc', fontSize: 11 },
        valueFormatter: (v) => formatInrFull(v)
      },
      grid: { top: 10, right: 16, bottom: 10, left: 10, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { fontSize: 10, formatter: (v) => formatInrCompact(v) }
      },
      yAxis: {
        type: 'category',
        data: cats.map((c) => c.name).reverse(),
        axisLabel: { fontSize: 10 }
      },
      series: [
        {
          name: 'Stock Value',
          type: 'bar',
          barMaxWidth: 18,
          data: [...cats].reverse().map((c) => ({
            value: c.value,
            itemStyle: { color: c.lowCount > 0 ? '#e11d48' : '#0284c7', borderRadius: [0, 4, 4, 0] }
          }))
        }
      ]
    };
  }, [inventory.stock_by_category, stockChartMode]);

  // 6. Product Mix & Top Customers (Recharts)
  const productData = useMemo(
    () =>
      (analytics.top_products || []).map((p) => ({
        name: p.name.length > 26 ? `${p.name.slice(0, 24)}…` : p.name,
        fullName: p.name,
        revenue: Number(p.total_revenue || 0),
        qty: Number(p.total_qty || 0),
        orders: Number(p.order_count || 0)
      })),
    [analytics.top_products]
  );

  const customerData = useMemo(
    () =>
      (analytics.top_customers || []).map((c) => {
        const total = Number(c.total_value || 0);
        const paid = Number(c.paid_amount || 0);
        return {
          name: c.company_name.length > 24 ? `${c.company_name.slice(0, 22)}…` : c.company_name,
          fullName: c.company_name,
          paid,
          due: Math.max(0, total - paid),
          total,
          orders: Number(c.order_count || 0)
        };
      }),
    [analytics.top_customers]
  );

  const leadSourceData = useMemo(
    () =>
      (analytics.leads_by_source || []).map((s) => ({
        source: s.source,
        leads: Number(s.count || 0),
        approved: Number(s.approved_count || 0),
        estValue: Number(s.est_value || 0)
      })),
    [analytics.leads_by_source]
  );

  const courierData = useMemo(
    () =>
      (logistics.by_courier || []).map((c) => ({
        courier: c.courier_name.length > 18 ? `${c.courier_name.slice(0, 16)}…` : c.courier_name,
        delivered: Number(c.delivered || 0),
        active: Number(c.active || 0)
      })),
    [logistics.by_courier]
  );

  const showFinance = activeDomain === 'all' || activeDomain === 'finance';
  const showProduction = activeDomain === 'all' || activeDomain === 'production';
  const showInventory = activeDomain === 'all' || activeDomain === 'inventory';

  return (
    <div className="space-y-4">
      {/* SECTION A: FINANCIAL & COMMERCIAL INTELLIGENCE (Apache ECharts) */}
      {showFinance && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Revenue & Cash Flow Composed Chart (7 cols) */}
          <section className="lg:col-span-7 bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
            <SectionHeader
              icon={BarChart3}
              title="Order Bookings vs Cash Realization Trend"
              subtitle="Click any bar/point to review Purchase Orders & Cash Ledger"
              actionLabel="Payments"
              onAction={() => safeNav('payments')}
            >
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setTrendMode('daily')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    trendMode === 'daily' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setTrendMode('cumulative')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    trendMode === 'cumulative' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cumulative
                </button>
              </div>
              {trendMode === 'daily' && (
                <button
                  type="button"
                  onClick={() => setShowQuoteOverlay((v) => !v)}
                  className={`px-2 py-0.5 rounded border text-[10px] font-medium cursor-pointer ${
                    showQuoteOverlay
                      ? 'bg-sky-50 border-sky-200 text-sky-700'
                      : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  + Quotes Line
                </button>
              )}
            </SectionHeader>

            {(analytics.revenue_trend || []).length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-xs text-slate-400">
                No order or payment trend activity in selected date range.
              </div>
            ) : (
              <EChartWrapper
                option={revenueTimelineOption}
                height={265}
                onChartClick={(params) => {
                  if (String(params.seriesName).includes('Cash')) safeNav('payments');
                  else if (String(params.seriesName).includes('Quotation')) safeNav('quotations');
                  else safeNav('purchase_orders');
                }}
              />
            )}
          </section>

          {/* Collection Mix Donut (5 cols) */}
          <section className="lg:col-span-5 bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
            <SectionHeader
              icon={PieChartIcon}
              title="Collections & Receivable Mix"
              subtitle="Click segments to drill into verified payment receipts"
              actionLabel="Ledger"
              onAction={() => safeNav('payments')}
            >
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setFinanceMixMode('breakdown')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    financeMixMode === 'breakdown' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  Cash Split
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceMixMode('method')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    financeMixMode === 'method' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  By Mode
                </button>
              </div>
            </SectionHeader>

            <EChartWrapper
              option={cashMixOption}
              height={265}
              onChartClick={() => safeNav('payments')}
            />
          </section>
        </div>
      )}

      {/* SECTION B: COMMERCIAL FUNNEL & SHOP FLOOR / QC (ECharts Funnel + Recharts ComposedChart) */}
      {(showFinance || showProduction) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {showFinance && (
            <section className={`${showProduction ? 'lg:col-span-5' : 'lg:col-span-12'} bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs`}>
              <SectionHeader
                icon={Filter}
                title="End-to-End Commercial Funnel"
                subtitle="Click any funnel stage to jump directly to its workflow"
              />
              <EChartWrapper
                option={funnelOption}
                height={255}
                onChartClick={(params) => {
                  const mod = params?.data?.module || 'quotations';
                  safeNav(mod);
                }}
              />
            </section>
          )}

          {showProduction && (
            <section className={`${showFinance ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs`}>
              <SectionHeader
                icon={Hammer}
                title="5-Level Manufacturing WIP & QC Gate Yield"
                subtitle="Click bars to inspect active production lines or QC checkpoints"
                actionLabel={floorMode === 'qc' ? 'QC Gates' : 'Shop Floor'}
                onAction={() => safeNav(floorMode === 'qc' ? 'qc' : 'manufacturing')}
              >
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setFloorMode('qc')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      floorMode === 'qc' ? 'bg-slate-900 text-white' : 'text-slate-600'
                    }`}
                  >
                    QC Yield (L1–L5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFloorMode('wip')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      floorMode === 'wip' ? 'bg-slate-900 text-white' : 'text-slate-600'
                    }`}
                  >
                    Active WIP Floor
                  </button>
                </div>
              </SectionHeader>

              <div className="h-[255px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={levelChartData}
                    margin={{ top: 10, right: 16, left: -10, bottom: 5 }}
                    onClick={() => safeNav(floorMode === 'qc' ? 'qc' : 'manufacturing')}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="level" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: '11px', borderRadius: '8px', borderColor: '#cbd5e1' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {floorMode === 'qc' ? (
                      <>
                        <Bar dataKey="passedUnits" name="Passed Units" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} cursor="pointer" />
                        <Bar dataKey="rejectedUnits" name="Rejected Units" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} cursor="pointer" />
                        <Line type="monotone" dataKey="inspections" name="Gate Checks" stroke="#0f172a" strokeWidth={2} />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="wipUnits" name="Units in Stage" fill="#0284c7" radius={[4, 4, 0, 0]} cursor="pointer" />
                        <Line type="monotone" dataKey="activeWOs" name="Active WOs" stroke="#0f172a" strokeWidth={2.5} />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      )}

      {/* SECTION C: PRODUCT REVENUE MIX & TOP CUSTOMERS */}
      {showFinance && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top Products (Recharts Horizontal Bar) */}
          <section className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
            <SectionHeader
              icon={Package}
              title="Top Products by Order Revenue"
              subtitle="Ranked finished goods revenue & ordered units in selected range"
              actionLabel="Products & BOM"
              onAction={() => safeNav('inventory_products')}
            />
            {productData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">
                No product order items in this date range.
              </div>
            ) : (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={productData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    onClick={() => safeNav('purchase_orders')}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => formatInrCompact(v)} />
                    <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 10, fill: '#334155' }} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                      formatter={(val, name, props) =>
                        name === 'Revenue'
                          ? [`${formatInrFull(val)} (${props.payload.qty} units)`, props.payload.fullName]
                          : [val, name]
                      }
                    />
                    <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} barSize={20} cursor="pointer">
                      {productData.map((_, i) => (
                        <Cell key={i} fill={['#0f172a', '#0284c7', '#0d9488', '#4f46e5'][i % 4]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Top Customers: Paid vs Balance Due (Recharts Stacked Horizontal Bar) */}
          <section className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
            <SectionHeader
              icon={Users}
              title="Top Customers: Collected vs Receivable"
              subtitle="Click customer bar to review Purchase Orders & payment status"
              actionLabel="Sales POs"
              onAction={() => safeNav('purchase_orders')}
            />
            {customerData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">
                No customer orders recorded in this date range.
              </div>
            ) : (
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={customerData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    onClick={() => safeNav('purchase_orders')}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => formatInrCompact(v)} />
                    <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 10, fill: '#334155' }} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                      formatter={(val) => formatInrFull(val)}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="paid" name="Cash Collected" stackId="cust" fill="#10b981" barSize={20} cursor="pointer" />
                    <Bar dataKey="due" name="Balance Receivable" stackId="cust" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION D: WAREHOUSE TREEMAP, LEAD SOURCES & LOGISTICS / RMA */}
      {(showInventory || showProduction || showFinance) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {showInventory && (
            <section className="lg:col-span-5 bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
              <SectionHeader
                icon={Boxes}
                title="Raw Material Stock Valuation"
                subtitle="Rose tiles highlight categories below reorder threshold"
                actionLabel="Warehouse"
                onAction={() => safeNav('inventory_raw_materials')}
              >
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setStockChartMode('treemap')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      stockChartMode === 'treemap' ? 'bg-slate-900 text-white' : 'text-slate-600'
                    }`}
                  >
                    Treemap
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockChartMode('bar')}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      stockChartMode === 'bar' ? 'bg-slate-900 text-white' : 'text-slate-600'
                    }`}
                  >
                    Bars
                  </button>
                </div>
              </SectionHeader>
              <EChartWrapper
                option={warehouseOption}
                height={230}
                onChartClick={() => safeNav('inventory_raw_materials')}
              />
            </section>
          )}

          {showFinance && (
            <section className={`${showInventory ? 'lg:col-span-4' : 'lg:col-span-6'} bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs`}>
              <SectionHeader
                icon={Sparkles}
                title="Lead Source Performance"
                subtitle="Volume & approved leads per intake channel"
                actionLabel="Lead Engine"
                onAction={() => safeNav('lead_engine')}
              />
              {leadSourceData.length === 0 ? (
                <div className="h-[230px] flex items-center justify-center text-xs text-slate-400">
                  No leads recorded in selected range.
                </div>
              ) : (
                <div className="h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={leadSourceData}
                      margin={{ top: 10, right: 10, left: -18, bottom: 5 }}
                      onClick={() => safeNav('leads')}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="source"
                        interval={0}
                        tick={{ fontSize: 9, fill: '#475569' }}
                        tickFormatter={(val) => (String(val).length > 12 ? `${String(val).slice(0, 11)}…` : val)}
                      />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                      <RechartsTooltip
                        contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                        formatter={(val, name, p) =>
                          name === 'Total Leads'
                            ? [`${val} (${formatInrCompact(p.payload.estValue)})`, name]
                            : [val, name]
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="leads" name="Total Leads" fill="#6366f1" radius={[4, 4, 0, 0]} cursor="pointer" />
                      <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[4, 4, 0, 0]} cursor="pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          )}

          {(showInventory || showProduction) && (
            <section className={`${showFinance && showInventory ? 'lg:col-span-3' : 'lg:col-span-6'} bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between`}>
              <div>
                <SectionHeader
                  icon={Truck}
                  title="Courier &amp; RMA"
                  subtitle="Carrier mix &amp; ticket severities"
                  actionLabel="Shipments"
                  onAction={() => safeNav('dispatch')}
                />
                {courierData.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">No dispatches in range.</p>
                ) : (
                  <div className="h-[130px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={courierData}
                        margin={{ top: 5, right: 8, left: -24, bottom: 0 }}
                        onClick={() => safeNav('dispatch')}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="courier"
                          interval={0}
                          tick={{ fontSize: 9, fill: '#64748b' }}
                          tickFormatter={(val) => String(val).split(' ')[0]}
                        />
                        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} allowDecimals={false} />
                        <RechartsTooltip contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
                        <Bar dataKey="delivered" name="Delivered" stackId="d" fill="#10b981" cursor="pointer" />
                        <Bar dataKey="active" name="In Transit" stackId="d" fill="#0284c7" radius={[3, 3, 0, 0]} cursor="pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* RMA Severity Summary Pills */}
              <div className="pt-2.5 mt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">RMA Ticket Severity</span>
                  <button
                    type="button"
                    onClick={() => safeNav('tickets')}
                    className="text-sky-700 font-medium hover:underline cursor-pointer"
                  >
                    Open Desk →
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                  {[
                    { key: 'critical', label: 'Crit', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
                    { key: 'high', label: 'High', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
                    { key: 'medium', label: 'Med', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
                    { key: 'low', label: 'Low', cls: 'bg-slate-100 text-slate-700 border-slate-200' }
                  ].map((sev) => (
                    <button
                      key={sev.key}
                      type="button"
                      onClick={() => safeNav('tickets')}
                      className={`py-1 rounded border font-semibold cursor-pointer hover:opacity-85 ${sev.cls}`}
                    >
                      {customer_service.by_severity?.[sev.key] || 0} {sev.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
