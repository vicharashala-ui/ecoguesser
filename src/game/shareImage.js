// src/game/shareImage.js
//
// Replaces the old canvas-drawn ShareCard: instead of redrawing a separate
// 1080x1080 summary from scratch, this rasterizes whatever live DOM node
// it's given (the actual rendered DailyRecap card) into a PNG, then shares
// it via the Web Share API on mobile or downloads it on desktop -- same
// share/download fallback shareResult() in ShareCard.jsx used, just fed a
// captured node image instead of a canvas.

import { toBlob } from 'html-to-image';

/**
 * @param {HTMLElement} node - the DOM node to rasterize (e.g. the DailyRecap
 *   card's root element via a ref).
 * @param {{ filename: string, shareTitle?: string, shareText?: string }} opts
 */
export async function shareNodeAsImage(node, { filename, shareTitle, shareText }) {
  if (!node) return;

  // Nunito is loaded site-wide via @fontsource, but a capture fired before
  // the specific weight has finished loading would silently fall back to a
  // system font -- wait for it, same guard ShareCard.jsx used for its canvas.
  await document.fonts.ready;

  const blob = await toBlob(node, {
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    cacheBust: true,
    // Without this, the area outside the card's rounded corners is
    // transparent -- most share sheets/viewers render transparent PNG
    // regions as black instead of the app's actual page background.
    backgroundColor: '#f8f6f1',
  });
  if (!blob) return;

  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
    } catch {
      // user cancelled the share sheet -- no fallback needed, they saw the image
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
