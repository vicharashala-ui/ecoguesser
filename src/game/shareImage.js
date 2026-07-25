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
 * @param {{ filename: string, shareTitle?: string, shareText?: string, shareUrl?: string }} opts
 */
export async function shareNodeAsImage(node, { filename, shareTitle, shareText, shareUrl }) {
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
    // Must exactly match .dr-card's own `background: #fffdf6` (Daily
    // RecapCss), not just approximate it: html-to-image's apply-style.js
    // sets this same color as an inline `background-color` directly on
    // the captured node -- not only on the canvas area outside the
    // rounded corners -- silently overriding .dr-card's real background
    // for its entire interior. An approximate value here (previously
    // '#f8f6f1', a near-white a couple RGB steps off) left interior and
    // border both wrong, just too close to notice; the dark green tried
    // after that made the mismatch obvious, painting the whole card
    // instead of only the intended corner cutouts. Using the exact value
    // makes that inline override a no-op, so the interior renders
    // identically to the live on-screen card.
    backgroundColor: '#fffdf6',
    // The live card is visually scaled down via CSS `transform: scale()` to
    // fit narrow phone screens (DailyRecap.jsx's useCardScale), but html-to-
    // image sizes the capture canvas off the node's untransformed
    // clientWidth/clientHeight -- always the full CARD_DESIGN_WIDTH box,
    // regardless of the live scale. Left as-is, the shrunk content only
    // fills the top-left corner of that full-size box, leaving the
    // scaled-away area as blank canvas (filled with backgroundColor above).
    // Overriding `transform` on the CLONE (this only touches html-to-image's
    // internal copy, never the live on-screen node) removes the shrink, so
    // the capture always renders the card at its full native size -- also
    // sharper than exporting the shrunk-down version would have been.
    style: { transform: 'none' },
  });
  if (!blob) return;

  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: shareTitle, text: shareText, url: shareUrl });
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
