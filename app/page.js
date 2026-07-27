'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { ADOBE_CATEGORIES, DEFAULT_CATEGORY_ID } from '../lib/adobe-categories';

const MAX_TITLE_CHARS = 70;
const MAX_KEYWORDS = 49;
const CONCURRENCY = 1; // Groq's free/dev tier TPM limit is easy to blow through with
// vision requests running in parallel — keep this serialized unless you're on a higher tier.
const REQUEST_SPACING_MS = 1500; // small gap between requests to smooth out token usage

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `item_${Date.now()}_${idCounter}`;
}

function keywordCount(str) {
  if (!str) return 0;
  return str.split(',').map((k) => k.trim()).filter(Boolean).length;
}

// Resize + re-encode client-side before sending. Cuts payload size (Vercel's function
// body limit is ~4.5MB), speeds up the request, and reduces vision-model token cost.
function compressImage(file, maxDim = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [customInstructions, setCustomInstructions] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const fileInputRef = useRef(null);
  const customInstructionsRef = useRef('');
  customInstructionsRef.current = customInstructions;

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === 'done' || i.status === 'needs-review').length;
    const processing = items.filter((i) => i.status === 'processing').length;
    const needsReview = items.filter((i) => i.status === 'needs-review').length;
    return { total, done, processing, needsReview };
  }, [items]);

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: nextId(),
        file,
        previewUrl: URL.createObjectURL(file),
        filename: file.name,
        status: 'pending',
        title: '',
        keywords: '',
        categoryId: DEFAULT_CATEGORY_ID,
        error: '',
      })),
    ]);
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return [];
    });
  }, []);

  const processItem = useCallback(
    async (id, file) => {
      updateItem(id, { status: 'processing', error: '' });
      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const base64 = await compressImage(file);
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64,
              customInstructions: customInstructionsRef.current,
              filename: file.name,
            }),
          });
          const data = await res.json();

          if (res.status === 429 && data.retryable) {
            if (attempt >= maxAttempts) {
              updateItem(id, {
                status: 'error',
                error: 'Still rate-limited after retries. Wait a bit, then click Regenerate.',
              });
              return;
            }
            updateItem(id, { error: `Rate limited — waiting ${Math.ceil(data.retryAfterSeconds)}s before retry…` });
            await sleep((data.retryAfterSeconds || 5) * 1000 + 500);
            continue;
          }

          if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed');

          updateItem(id, {
            status: data.isFallback ? 'needs-review' : 'done',
            title: data.title,
            keywords: data.keywords,
            categoryId: data.categoryId || DEFAULT_CATEGORY_ID,
            error: data.isFallback ? data.reason || 'AI generation failed, showing a generic placeholder.' : '',
          });
          return;
        } catch (err) {
          if (attempt >= maxAttempts) {
            updateItem(id, { status: 'error', error: err.message || 'Failed to generate' });
            return;
          }
          await sleep(700);
        }
      }
    },
    [updateItem]
  );

  const regenerate = useCallback(
    (id) => {
      const item = items.find((i) => i.id === id);
      if (item) processItem(id, item.file);
    },
    [items, processItem]
  );

  const generateAll = useCallback(async () => {
    const queue = items.filter((i) => i.status === 'pending' || i.status === 'error').map((i) => i.id);
    if (queue.length === 0) return;
    setIsRunning(true);

    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const myIndex = cursor;
        cursor += 1;
        const id = queue[myIndex];
        const item = items.find((i) => i.id === id);
        if (item) await processItem(id, item.file);
        if (cursor < queue.length) await sleep(REQUEST_SPACING_MS);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setIsRunning(false);
  }, [items, processItem]);

  const downloadCSV = useCallback(() => {
    const rows = items
      .filter((i) => i.status === 'done' || i.status === 'needs-review')
      .map((i) => ({
        Filename: i.filename,
        Title: i.title,
        Keywords: i.keywords,
        Category: i.categoryId,
        Releases: '',
      }));
    if (rows.length === 0) return;
    const csv = Papa.unparse(rows, { columns: ['Filename', 'Title', 'Keywords', 'Category', 'Releases'] });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'adobe_stock_metadata.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [items]);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  return (
    <div className="page">
      <header className="header">
        <span className="eyebrow">ARSHIO · INTERNAL TOOL</span>
        <h1>Adobe Stock Metadata Generator</h1>
        <p className="subtitle">
          AI-drafted titles, keywords, and categories — sanitized to Adobe Stock&apos;s exact CSV rules before you
          export.
        </p>
      </header>

      <section className="card">
        <label className="fieldLabel" htmlFor="context">
          Batch context <span>(optional — applied to every image in this batch)</span>
        </label>
        <textarea
          id="context"
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="e.g. 1930s vintage rubber-hose cartoon style, Halloween icon set"
        />
      </section>

      <section
        className={`dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 16V4M12 4L7 9M12 4L17 9M4 16V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V16"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p>
          <strong>Drop images here</strong> or click to browse
        </p>
        {items.length > 0 && <span className="fileChip">{items.length} file(s) added</span>}
      </section>

      {items.length > 0 && (
        <div className="toolbar">
          <button
            className="btnPrimary"
            onClick={generateAll}
            disabled={isRunning || items.every((i) => i.status === 'done' || i.status === 'needs-review' || i.status === 'processing')}
          >
            {isRunning ? `Generating… (${stats.done}/${stats.total})` : 'Generate metadata'}
          </button>
          <button className="btnGhost" onClick={clearAll} disabled={isRunning}>
            Clear all
          </button>
          {stats.needsReview > 0 && (
            <span className="needsReviewNote">⚠ {stats.needsReview} need review</span>
          )}
        </div>
      )}

      {isRunning && (
        <div className="progressTrack">
          <div className="progressFill" style={{ width: `${(stats.done / Math.max(stats.total, 1)) * 100}%` }} />
        </div>
      )}

      <div className="itemGrid">
        {items.map((item) => {
          const kwCount = keywordCount(item.keywords);
          const titleTooLong = item.title.length > MAX_TITLE_CHARS;
          const hasComma = item.title.includes(',');
          const kwOver = kwCount > MAX_KEYWORDS;

          return (
            <div key={item.id} className={`itemCard status-${item.status}`}>
              <img src={item.previewUrl} alt="" className="thumb" />

              <div className="itemBody">
                <div className="itemTopRow">
                  <span className="filename" title={item.filename}>
                    {item.filename}
                  </span>
                  <StatusBadge status={item.status} />
                </div>

                {item.status === 'pending' && <p className="hint">Waiting to generate…</p>}
                {item.status === 'processing' && <p className="hint">{item.error || 'Analyzing image…'}</p>}
                {item.status === 'error' && <p className="hintError">{item.error || 'Something went wrong.'}</p>}
                {item.status === 'needs-review' && item.error && <p className="hintError">{item.error}</p>}

                {(item.status === 'done' || item.status === 'needs-review' || item.status === 'error') && (
                  <>
                    <div className="fieldRow">
                      <label>
                        Title <span className={titleTooLong || hasComma ? 'countWarn' : 'count'}>
                          {item.title.length}/{MAX_TITLE_CHARS}
                          {hasComma ? ' · remove commas' : ''}
                        </span>
                      </label>
                      <textarea
                        value={item.title}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="fieldRow">
                      <label>
                        Keywords <span className={kwOver ? 'countWarn' : 'count'}>{kwCount}/{MAX_KEYWORDS}</span>
                      </label>
                      <textarea
                        value={item.keywords}
                        onChange={(e) => updateItem(item.id, { keywords: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div className="fieldRow">
                      <label>Category</label>
                      <select
                        value={item.categoryId}
                        onChange={(e) => updateItem(item.id, { categoryId: Number(e.target.value) })}
                      >
                        {ADOBE_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.id}. {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="itemActions">
                  {item.status !== 'pending' && item.status !== 'processing' && (
                    <button className="btnIcon" onClick={() => regenerate(item.id)} title="Regenerate">
                      ↻ Regenerate
                    </button>
                  )}
                  <button className="btnIcon danger" onClick={() => removeItem(item.id)} title="Remove">
                    ✕ Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {stats.done > 0 && (
        <div className="downloadBar">
          <span>
            {stats.done} of {stats.total} ready to export
          </span>
          <button className="btnPrimary" onClick={downloadCSV}>
            ↓ Download Adobe Stock CSV
          </button>
        </div>
      )}

      <style jsx>{`
        .page {
          max-width: 980px;
          margin: 0 auto;
          padding: 48px 20px 120px;
        }
        .header {
          margin-bottom: 32px;
        }
        .eyebrow {
          display: inline-block;
          font-size: 12px;
          letter-spacing: 0.14em;
          color: var(--cyber-mint);
          font-weight: 600;
          margin-bottom: 10px;
        }
        h1 {
          font-size: clamp(28px, 4vw, 40px);
          color: var(--white);
          line-height: 1.15;
        }
        .subtitle {
          color: var(--muted-teal);
          margin-top: 10px;
          max-width: 60ch;
          line-height: 1.5;
        }
        .card {
          background: var(--deep-black);
          border: 1px solid rgba(30, 45, 69, 0.6);
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 16px;
        }
        .fieldLabel {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--white);
          margin-bottom: 8px;
        }
        .fieldLabel span {
          font-weight: 400;
          color: var(--muted-teal);
        }
        textarea,
        select {
          width: 100%;
          background: var(--arshio-black);
          border: 1px solid rgba(30, 45, 69, 0.8);
          border-radius: 8px;
          color: var(--white);
          padding: 10px 12px;
          font-size: 14px;
          resize: vertical;
          transition: border-color 0.15s ease;
        }
        textarea:focus,
        select:focus {
          border-color: var(--cyber-mint);
        }
        #context {
          height: 70px;
        }
        .dropzone {
          border: 1.5px dashed var(--arshio-navy);
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          background: var(--deep-black);
          transition: border-color 0.15s ease, background 0.15s ease;
          margin-bottom: 20px;
        }
        .dropzone:hover,
        .dropzone.dragging {
          border-color: var(--cyber-mint);
          background: rgba(0, 229, 176, 0.04);
        }
        .dropzone svg {
          color: var(--cyber-mint);
          margin-bottom: 8px;
        }
        .dropzone p {
          color: var(--muted-teal);
          margin: 0;
        }
        .dropzone strong {
          color: var(--white);
        }
        .fileChip {
          display: inline-block;
          margin-top: 12px;
          background: var(--mint-tint);
          color: var(--arshio-black);
          font-weight: 600;
          font-size: 13px;
          padding: 4px 12px;
          border-radius: 999px;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .btnPrimary {
          background: var(--cyber-mint);
          color: var(--arshio-black);
          border: none;
          font-weight: 700;
          padding: 12px 22px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.15s ease;
        }
        .btnPrimary:hover:not(:disabled) {
          background: var(--mint-dark);
        }
        .btnPrimary:disabled {
          background: var(--muted-teal);
          color: var(--arshio-black);
          cursor: not-allowed;
          opacity: 0.6;
        }
        .btnGhost {
          background: transparent;
          border: 1px solid var(--muted-teal);
          color: var(--muted-teal);
          padding: 11px 18px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
        }
        .btnGhost:hover:not(:disabled) {
          border-color: var(--white);
          color: var(--white);
        }
        .needsReviewNote {
          color: var(--mint-tint);
          font-size: 13px;
        }
        .progressTrack {
          height: 4px;
          background: var(--deep-black);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .progressFill {
          height: 100%;
          background: linear-gradient(90deg, var(--mint-dark), var(--cyber-mint));
          transition: width 0.3s ease;
        }
        .itemGrid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .itemCard {
          display: flex;
          gap: 16px;
          background: var(--deep-black);
          border: 1px solid rgba(30, 45, 69, 0.6);
          border-radius: 12px;
          padding: 16px;
        }
        .itemCard.status-needs-review {
          border-style: dashed;
          border-color: var(--mint-tint);
        }
        .thumb {
          width: 76px;
          height: 76px;
          object-fit: cover;
          border-radius: 8px;
          flex-shrink: 0;
          background: var(--arshio-black);
        }
        .itemBody {
          flex: 1;
          min-width: 0;
        }
        .itemTopRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .filename {
          font-size: 12px;
          color: var(--muted-teal);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hint {
          color: var(--muted-teal);
          font-size: 13px;
          margin: 4px 0;
        }
        .hintError {
          color: var(--mint-tint);
          font-size: 13px;
          margin: 4px 0;
        }
        .fieldRow {
          margin-top: 10px;
        }
        .fieldRow label {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--muted-teal);
          margin-bottom: 4px;
        }
        .count {
          color: var(--muted-teal);
        }
        .countWarn {
          color: var(--cyber-mint);
          font-weight: 600;
        }
        .itemActions {
          display: flex;
          gap: 10px;
          margin-top: 12px;
        }
        .btnIcon {
          background: transparent;
          border: 1px solid rgba(90, 120, 112, 0.5);
          color: var(--muted-teal);
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btnIcon:hover {
          border-color: var(--cyber-mint);
          color: var(--cyber-mint);
        }
        .btnIcon.danger:hover {
          border-color: #ff6b6b;
          color: #ff6b6b;
        }
        .downloadBar {
          position: sticky;
          bottom: 16px;
          margin-top: 24px;
          background: var(--arshio-navy);
          border-radius: 12px;
          padding: 14px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .downloadBar span {
          color: var(--white);
          font-size: 14px;
        }
        @media (max-width: 600px) {
          .itemCard {
            flex-direction: column;
          }
          .thumb {
            width: 100%;
            height: 140px;
          }
          .downloadBar {
            flex-direction: column;
            gap: 10px;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending', bg: 'transparent', color: 'var(--muted-teal)', border: '1px solid var(--muted-teal)' },
    processing: { label: 'Processing…', bg: 'transparent', color: 'var(--cyber-mint)', border: '1px solid var(--cyber-mint)' },
    done: { label: 'Ready', bg: 'var(--mint-tint)', color: 'var(--arshio-black)', border: 'none' },
    'needs-review': { label: 'Needs review', bg: 'transparent', color: 'var(--mint-tint)', border: '1px dashed var(--mint-tint)' },
    error: { label: 'Failed', bg: 'transparent', color: '#ff8080', border: '1px solid #ff8080' },
  };
  const s = map[status] || map.pending;
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: '999px',
        background: s.bg,
        color: s.color,
        border: s.border,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}
