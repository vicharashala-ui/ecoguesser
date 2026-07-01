// src/components/FeedbackModal.jsx
//
// Section 9c, built spec-verbatim:
//   - Textarea, 4 rows, max 500 chars, live counter ("123/500") that turns
//     amber >=400 and red >=490.
//   - Send disabled when the textarea is empty (after trim).
//   - States: Idle -> Sending (spinner, both buttons disabled) -> Success
//     (auto-close after 2.5s). No failure state -- mode:'no-cors' gives no
//     readable response either way, so the spec calls for showing success
//     unconditionally rather than guessing at a failure UI with no signal
//     to actually detect one.
//   - Dismiss: backdrop click, Cancel, or Escape -- all three clear the
//     textarea on close (spec's "Clear textarea on close").

import { useState, useEffect, useRef, useId } from 'react';
import { FEEDBACK_FORM_URL, FEEDBACK_ENTRY_ID } from '../config.js';
import { submitFeedback } from '../game/api.js';
import './FeedbackModal.css';

const MAX_CHARS = 500;
const SUCCESS_AUTOCLOSE_MS = 2500;

export default function FeedbackModal({ onClose }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('idle'); // 'idle' | 'sending' | 'success'
  const titleId = useId();
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (phase !== 'success') return;
    const t = setTimeout(onClose, SUCCESS_AUTOCLOSE_MS);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && phase !== 'sending') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, onClose]);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && phase === 'idle';
  const counterClass =
    text.length >= 490 ? 'fm-counter-danger' : text.length >= 400 ? 'fm-counter-warn' : '';

  function handleBackdropClick() {
    if (phase === 'sending') return; // no dismiss mid-send
    onClose();
  }

  async function handleSend() {
    if (!canSend) return;
    setPhase('sending');
    await submitFeedback(FEEDBACK_FORM_URL, FEEDBACK_ENTRY_ID, trimmed);
    setPhase('success');
  }

  return (
    <div className="fm-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        className="fm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'success' ? (
          <div className="fm-success">
            <h2 id={titleId}>Thanks!</h2>
            <p>We read every message.</p>
          </div>
        ) : (
          <>
            <h2 id={titleId}>Send Feedback</h2>
            <textarea
              ref={textareaRef}
              className="fm-textarea"
              rows={4}
              maxLength={MAX_CHARS}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's on your mind?"
              disabled={phase === 'sending'}
            />
            <div className={`fm-counter ${counterClass}`}>{text.length}/{MAX_CHARS}</div>

            <div className="fm-actions">
              <button
                type="button"
                className="fm-cancel-btn"
                onClick={onClose}
                disabled={phase === 'sending'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fm-send-btn"
                onClick={handleSend}
                disabled={!canSend}
              >
                {phase === 'sending' ? <span className="fm-spinner" /> : 'Send Feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
