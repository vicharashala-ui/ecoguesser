// src/components/NamePromptModal.jsx
//
// Section 9's "Name your score" modal -- shown once, on first-ever
// DAILY_SUMMARY entry (LS_KEYS.NAME empty). Two exits only, both terminal:
// Save & Submit (persists the name; it flows into the POST) or Skip (POST
// goes out as 'Player', nothing written to localStorage) -- no backdrop or
// Escape dismiss, since the spec gives this modal exactly those two named
// actions and neither is "cancel and stay."

import { useState, useId } from 'react';
import './NamePromptModal.css';

export default function NamePromptModal({ onSave, onSkip }) {
  const [name, setName] = useState('');
  const titleId = useId();
  const canSave = name.trim().length > 0;

  return (
    <div className="npm-backdrop" role="presentation">
      <div className="npm-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Name your score</h2>
        <p>Set a name to appear on the leaderboard.</p>
        <input
          type="text"
          className="npm-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          autoFocus
          placeholder="Your name"
        />
        <div className="npm-actions">
          <button type="button" className="npm-skip-btn" onClick={onSkip}>
            Skip
          </button>
          <button
            type="button"
            className="npm-save-btn"
            disabled={!canSave}
            onClick={() => onSave(name.trim())}
          >
            Save & Submit
          </button>
        </div>
      </div>
    </div>
  );
}
