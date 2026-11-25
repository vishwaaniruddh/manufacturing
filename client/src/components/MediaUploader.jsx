// client/src/components/MediaUploader.jsx
import React, { useState } from 'react';
import { Upload, X, FileText, Film, Image as ImageIcon, Paperclip, ExternalLink, Camera } from 'lucide-react';

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv|3gp)$/i;
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;

function isImageFile(item) {
  return Boolean(item?.type?.startsWith('image/') || item?.mime_type?.startsWith('image/') || IMAGE_EXT_RE.test(item?.name || item?.file_name || ''));
}

function isVideoFile(item) {
  return Boolean(item?.type?.startsWith('video/') || item?.mime_type?.startsWith('video/') || VIDEO_EXT_RE.test(item?.name || item?.file_name || ''));
}

export function MediaUploader({
  files = [],
  onChange,
  label = 'Upload Evidence (Images, Videos, PDFs — Optional)',
  mediaOnly = false,
  compact = false
}) {
  const acceptAttr = mediaOnly
    ? 'image/*,video/*'
    : 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx';

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      onChange([...files, ...selected]);
    }
    e.target.value = '';
  };

  const removeFile = (idx) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  if (compact) {
    return (
      <div className="space-y-1">
        <label className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer text-[10px] font-medium text-slate-700 transition-colors whitespace-nowrap">
          <Camera className="h-3 w-3 text-sky-600 shrink-0" />
          <span>{files.length > 0 ? `+ Proof (${files.length})` : '+ Image / Video'}</span>
          <input
            type="file"
            multiple
            accept={acceptAttr}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1 max-w-[190px]">
            {files.map((f, idx) => {
              const isImg = isImageFile(f);
              const isVid = isVideoFile(f);
              return (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 max-w-[180px]"
                  title={f.name}
                >
                  {isImg ? (
                    <ImageIcon className="h-2.5 w-2.5 text-sky-600 shrink-0" />
                  ) : isVid ? (
                    <Film className="h-2.5 w-2.5 text-purple-600 shrink-0" />
                  ) : (
                    <FileText className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                  )}
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-slate-700">{label}</label>
        <span className="text-[10px] text-slate-400 font-normal">Optional</span>
      </div>
      <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-md bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer transition-colors text-xs text-slate-600">
        <Upload className="h-3.5 w-3.5 text-slate-500" />
        <span>
          {mediaOnly
            ? 'Choose photos or videos (JPG, PNG, MP4, MOV, WebM)...'
            : 'Choose multiple photos, videos, or documents...'}
        </span>
        <input
          type="file"
          multiple
          accept={acceptAttr}
          onChange={handleFileChange}
          className="sr-only"
        />
      </label>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {files.map((f, idx) => {
            const isImg = isImageFile(f);
            const isVid = isVideoFile(f);
            return (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-slate-200 text-[11px] text-slate-700 max-w-[200px]"
              >
                {isImg ? (
                  <ImageIcon className="h-3 w-3 text-sky-600 shrink-0" />
                ) : isVid ? (
                  <Film className="h-3 w-3 text-purple-600 shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-slate-500 shrink-0" />
                )}
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MediaGallery({ attachments = [] }) {
  const [previewItem, setPreviewItem] = useState(null);

  if (!attachments || attachments.length === 0) {
    return <span className="text-[10px] text-slate-400">—</span>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {attachments.map((att) => {
          const isImg = isImageFile(att);
          const isVid = isVideoFile(att);
          return (
            <button
              key={att.id}
              type="button"
              onClick={() => setPreviewItem(att)}
              title={att.doc_label ? `${att.doc_label}: ${att.file_name}` : att.file_name}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-medium text-slate-700 cursor-pointer"
            >
              {isImg ? (
                <ImageIcon className="h-2.5 w-2.5 text-sky-600 shrink-0" />
              ) : isVid ? (
                <Film className="h-2.5 w-2.5 text-purple-600 shrink-0" />
              ) : (
                <Paperclip className="h-2.5 w-2.5 text-slate-500 shrink-0" />
              )}
              {att.doc_label && (
                <span className="px-1 py-0 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-semibold shrink-0">
                  {att.doc_label}
                </span>
              )}
              <span className="max-w-[90px] truncate">{att.file_name}</span>
            </button>
          );
        })}
      </div>

      {previewItem && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-4 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="truncate pr-4">
                <h3 className="text-xs font-semibold text-slate-900 truncate">{previewItem.file_name}</h3>
                <p className="text-[10px] text-slate-400">
                  {previewItem.doc_label ? `${previewItem.doc_label} • ` : ''}
                  {previewItem.mime_type || 'Document'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewItem.file_path}
                  target="_blank"
                  rel="noreferrer"
                  className="h-7 px-2 border border-slate-200 rounded text-[11px] font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="h-7 px-2 bg-slate-900 text-white rounded text-[11px] font-medium cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-50 rounded border border-slate-200 p-2">
              {isImageFile(previewItem) ? (
                <img src={previewItem.file_path} alt={previewItem.file_name} className="max-h-[65vh] object-contain rounded" />
              ) : isVideoFile(previewItem) ? (
                <video src={previewItem.file_path} controls playsInline preload="metadata" className="max-h-[65vh] w-full rounded bg-black" />
              ) : (
                <div className="p-6 text-center space-y-2">
                  <FileText className="h-10 w-10 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-600">{previewItem.file_name}</p>
                  <a
                    href={previewItem.file_path}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium"
                  >
                    Download / View File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
