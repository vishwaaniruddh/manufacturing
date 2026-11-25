// client/src/components/LinkedPOBadges.jsx
import React from 'react';

export default function LinkedPOBadges({
  pos = [],
  fallbackPos = [],
  onViewPO,
  emptyLabel = 'No POs'
}) {
  const hasDirect = pos.length > 0;
  const hasFallback = !hasDirect && fallbackPos.length > 0;

  if (!hasDirect && !hasFallback) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
        {emptyLabel}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      {hasDirect ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {pos.length} {pos.length === 1 ? 'PO Created' : 'POs Created'}
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
          0 on Quote • {fallbackPos.length} on Lead
        </span>
      )}

      <div className="flex flex-wrap gap-1 max-w-[190px]">
        {(hasDirect ? pos : fallbackPos).map((po) => (
          <button
            key={po.id}
            type="button"
            onClick={() => onViewPO && onViewPO(po.id)}
            title={`Open ${po.po_number} (${po.customer_po_reference} • ₹${Number(po.total_amount).toLocaleString()} • ${po.status})`}
            className="px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-900 border border-sky-200 transition-colors cursor-pointer"
          >
            {po.po_number}
          </button>
        ))}
      </div>
    </div>
  );
}
