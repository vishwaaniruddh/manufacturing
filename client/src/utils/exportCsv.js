// client/src/utils/exportCsv.js

export function exportToCsv(filename, columns, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    alert('No filtered records to export.');
    return;
  }

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['#', ...columns.map((c) => c.header)];
  const lines = [headers.map(escapeCell).join(',')];

  rows.forEach((row, idx) => {
    const cells = [
      idx + 1,
      ...columns.map((col) => {
        const raw = typeof col.accessor === 'function' ? col.accessor(row, idx) : row[col.accessor];
        return escapeCell(raw);
      })
    ];
    lines.push(cells.join(','));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().split('T')[0];
  link.href = url;
  link.setAttribute('download', `${filename}_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
