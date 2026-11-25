// client/src/utils/dateRange.js

const pad2 = (n) => String(n).padStart(2, '0');

function toLocalIsoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function getTodayPlainDateStr() {
  if (typeof globalThis.Temporal !== 'undefined') {
    return globalThis.Temporal.Now.plainDateISO().toString();
  }
  return toLocalIsoDate(new Date());
}

export function computePresetDates(preset) {
  if (preset === 'all') {
    return { from: '', to: '' };
  }

  // Prefer Temporal.PlainDate to avoid UTC timezone drift on calendar dates
  if (typeof globalThis.Temporal !== 'undefined') {
    const today = globalThis.Temporal.Now.plainDateISO();
    const todayStr = today.toString();

    switch (preset) {
      case 'today':
        return { from: todayStr, to: todayStr };
      case '7d':
        return { from: today.subtract({ days: 6 }).toString(), to: todayStr };
      case '30d':
        return { from: today.subtract({ days: 29 }).toString(), to: todayStr };
      case 'month':
        return { from: today.with({ day: 1 }).toString(), to: todayStr };
      case 'last_month': {
        const thisMonthFirst = today.with({ day: 1 });
        const lastMonthEnd = thisMonthFirst.subtract({ days: 1 });
        const lastMonthStart = lastMonthEnd.with({ day: 1 });
        return { from: lastMonthStart.toString(), to: lastMonthEnd.toString() };
      }
      case 'quarter': {
        const qStartMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
        return { from: today.with({ month: qStartMonth, day: 1 }).toString(), to: todayStr };
      }
      case 'year':
        return { from: today.with({ month: 1, day: 1 }).toString(), to: todayStr };
      default:
        return { from: '', to: '' };
    }
  }

  // Fallback using explicit local calendar parts (never toISOString UTC)
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const todayStr = toLocalIsoDate(now);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case '7d':
      return { from: toLocalIsoDate(new Date(y, m, d - 6)), to: todayStr };
    case '30d':
      return { from: toLocalIsoDate(new Date(y, m, d - 29)), to: todayStr };
    case 'month':
      return { from: toLocalIsoDate(new Date(y, m, 1)), to: todayStr };
    case 'last_month':
      return {
        from: toLocalIsoDate(new Date(y, m - 1, 1)),
        to: toLocalIsoDate(new Date(y, m, 0))
      };
    case 'quarter': {
      const qMonth = Math.floor(m / 3) * 3;
      return { from: toLocalIsoDate(new Date(y, qMonth, 1)), to: todayStr };
    }
    case 'year':
      return { from: toLocalIsoDate(new Date(y, 0, 1)), to: todayStr };
    default:
      return { from: '', to: '' };
  }
}

export function formatReadableDate(isoDate) {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate));
  if (!match) return String(isoDate);
  const [, y, m, d] = match;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[Number(m) - 1] || m} ${y}`;
}

export function formatInrCompact(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (Math.abs(num) >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (Math.abs(num) >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
}

export function formatInrFull(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
