// src/components/ShareCard.jsx
//
// Section 8b's share card -- 1080x1080 canvas drawn client-side from that
// day's already-recorded stats_daily entry (no network call), shared via
// the Web Share API on mobile or downloaded as a PNG on desktop.
// Opened from Leaderboard's Share button.

import { useEffect, useRef } from 'react';
import { APP_URL, CATEGORY_META, DAILY, SCORING } from '../config.js';
import './ShareCard.css';

const DAILY_MAX_TOTAL = SCORING.MAX_SCORE * DAILY.CATEGORIES.length; // 25,000
const BAR_LABELS = { np: 'NP', wls: 'WLS', tr: 'TR', br: 'BR', ramsar: 'R' };
const BAR_MAX_SCORE = 5000; // spec: "max 480px at score=5000"
const BAR_MAX_WIDTH = 480;
const FONT = "Nunito, 'Segoe UI', sans-serif";

function drawRoundedBar(ctx, x, y, w, h, r, color) {
  if (w <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawCard(canvas, { total, rounds, date, rank }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 1080 * dpr;
  canvas.height = 1080 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#f8f6f1';
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = '#16a34a';
  ctx.font = `700 42px ${FONT}`;
  ctx.fillText('EcoGuesser', 60, 90);

  ctx.fillStyle = '#6b7280';
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText("India's Protected Areas", 60, 130);

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 160);
  ctx.lineTo(1020, 160);
  ctx.stroke();

  ctx.fillStyle = '#111827';
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(`${total.toLocaleString()} / ${DAILY_MAX_TOTAL.toLocaleString()}`, 60, 290);

  ctx.fillStyle = '#6b7280';
  ctx.font = `400 24px ${FONT}`;
  ctx.fillText("TODAY'S SCORE", 60, 330);

  // Bars in DAILY.CATEGORIES round order (NP, WLS, TR, BR, Ramsar).
  const byCategory = Object.fromEntries(rounds.map((r) => [r.cat, r]));
  const barTop = 400;
  const barHeight = 28;
  const barGap = 12;
  const labelW = 70;

  DAILY.CATEGORIES.forEach((cat, i) => {
    const round = byCategory[cat];
    if (!round) return;
    const y = barTop + i * (barHeight + barGap);
    const w = round.skipped ? 0 : Math.min(BAR_MAX_WIDTH, (round.score / BAR_MAX_SCORE) * BAR_MAX_WIDTH);

    ctx.fillStyle = '#111827';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(BAR_LABELS[cat], 60, y + barHeight - 6);

    drawRoundedBar(ctx, 60 + labelW, y, BAR_MAX_WIDTH, barHeight, 4, '#e5e7eb'); // track
    drawRoundedBar(ctx, 60 + labelW, y, w, barHeight, 4, CATEGORY_META[cat].color); // fill

    ctx.fillStyle = '#111827';
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(round.score.toLocaleString(), 60 + labelW + BAR_MAX_WIDTH + 16, y + barHeight - 6);
  });

  const footerY = barTop + DAILY.CATEGORIES.length * (barHeight + barGap) + 50;
  ctx.fillStyle = '#6b7280';
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText(rank != null ? `#${rank} on leaderboard · ${date}` : date, 60, footerY);

  ctx.fillStyle = '#16a34a';
  ctx.fillText(`Play at ${APP_URL}`, 60, footerY + 40);
}

async function shareResult(canvas, date, rank, total) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], `ecoguesser-${date}.png`, { type: 'image/png' });
    const text = rank != null
      ? `My EcoGuesser score today: ${total.toLocaleString()} (#${rank} on the leaderboard)`
      : `My EcoGuesser score today: ${total.toLocaleString()}`;

    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: 'EcoGuesser', text }).catch(() => {
        // user cancelled the share sheet -- no fallback needed, they saw the card
      });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecoguesser-${date}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export default function ShareCard({ total, rounds, date, rank, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCard(canvas, { total, rounds, date, rank });
    // Nunito is loaded site-wide via @fontsource, but canvas text drawn
    // before the specific weight has finished loading silently falls back
    // to a system font -- redraw once document.fonts confirms it's ready.
    document.fonts.ready.then(() => drawCard(canvas, { total, rounds, date, rank }));
  }, [total, rounds, date, rank]);

  return (
    <div className="sc-backdrop" role="presentation" onClick={onClose}>
      <div className="sc-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <canvas ref={canvasRef} className="sc-canvas" />
        <div className="sc-actions">
          <button type="button" className="sc-close-btn" onClick={onClose}>Close</button>
          <button
            type="button"
            className="sc-share-btn"
            onClick={() => shareResult(canvasRef.current, date, rank, total)}
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
