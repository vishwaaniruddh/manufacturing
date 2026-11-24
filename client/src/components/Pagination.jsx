// client/src/components/Pagination.jsx
import React, { useState } from 'react';

export function usePagination(items = [], pageSize = 10) {
  const [currentPage, setCurrentPage] = useState(1);
  const safeItems = Array.isArray(items) ? items : [];
  const totalItems = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedItems = safeItems.slice(startIndex, startIndex + pageSize);

  return {
    currentPage: safePage,
    setCurrentPage,
    totalPages,
    totalItems,
    pageSize,
    startIndex,
    paginatedItems
  };
}

function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Universal format: 1 2 3 ... n-2 n-1 n (with currentPage included if in middle)
  if (currentPage <= 3 || currentPage >= totalPages - 2) {
    return [1, 2, 3, '...', totalPages - 2, totalPages - 1, totalPages];
  }

  if (currentPage === 4) {
    return [1, 2, 3, 4, '...', totalPages - 2, totalPages - 1, totalPages];
  }

  if (currentPage === totalPages - 3) {
    return [1, 2, 3, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 2, 3, '...', currentPage, '...', totalPages - 2, totalPages - 1, totalPages];
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 10,
  onPageChange
}) {
  if (!totalItems || totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  const pages = getPageNumbers(currentPage, totalPages);

  const btnBase =
    'h-7 px-2 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none';

  return (
    <nav
      aria-label="Table pagination"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 border-t border-slate-200/80 bg-slate-50/50 text-xs"
    >
      <div className="text-[11px] text-slate-500">
        Showing <span className="font-semibold text-slate-800">{startItem}</span>–
        <span className="font-semibold text-slate-800">{endItem}</span> of{' '}
        <span className="font-semibold text-slate-800">{totalItems}</span> records
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className={`${btnBase} bg-white border-slate-200 text-slate-700 hover:bg-slate-100`}
        >
          First
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`${btnBase} bg-white border-slate-200 text-slate-700 hover:bg-slate-100`}
        >
          Prev
        </button>

        {pages.map((p, idx) =>
          p === '...' ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1.5 text-[11px] text-slate-400 select-none"
              aria-hidden="true"
            >
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === currentPage ? 'page' : undefined}
              className={`h-7 min-w-[1.75rem] px-2 rounded-md border text-[11px] font-medium transition-colors ${
                p === currentPage
                  ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={`${btnBase} bg-white border-slate-200 text-slate-700 hover:bg-slate-100`}
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className={`${btnBase} bg-white border-slate-200 text-slate-700 hover:bg-slate-100`}
        >
          Last
        </button>
      </div>
    </nav>
  );
}
