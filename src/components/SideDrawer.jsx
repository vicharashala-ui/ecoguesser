// src/components/SideDrawer.jsx
//
// Section 9's side drawer: Player Name, Difficulty (Classic only), Category
// + Region/State filters (Classic only), footer links, and an inline
// Feedback box.
//
// This pass:
//   1. Category switched from a wrapped chip row to a vertical list (one
//      row per category), each row showing that category's total site
//      count -- e.g. "National Park  42". Counts are computed once from the
//      full `sites` prop (every state, regardless of the current draft
//      filter selection) so they don't shift around as the player toggles
//      states -- a simple, stable "how many exist in total" number rather
//      than a live "how many would this leave me with" facet count.
//      Difficulty keeps the old chip-row layout on purpose -- it's 3 short
//      mutually-exclusive options, which is what chips are actually good
//      for; the request was specifically about Category's long list.
//   2. Feedback moved from FeedbackButton.jsx + FeedbackModal.jsx (both
//      removed -- delete those two files' four remaining artifacts,
//      FeedbackButton.jsx/.css and FeedbackModal.jsx/.css, they're no
//      longer imported anywhere) into a plain box at the bottom of this
//      drawer. Same textarea/counter/send behavior as the old modal,
//      minus everything that only existed to run a modal: no
//      backdrop/dialog markup, no Escape-key handler, no focus-on-open,
//      no Cancel button. Submitting just clears the box and shows a small
//      inline "Thanks!" line for a few seconds, then reverts.
//   3. Statistics link removed from the footer (per direct request) --
//      Stats is still reachable via BottomNav's own tab, so the drawer
//      link was a pure duplicate route. `onNavigate` now only ever fires
//      for 'howtoplay'/'about'/'privacy', matching InfoModal's variants
//      1:1 -- App.jsx wires it straight to setInfoModalVariant.

import { useState, useEffect } from 'react';
import { LS_KEYS, CATEGORY_META, FEEDBACK_FORM_URL, FEEDBACK_ENTRY_ID } from '../config.js';
import { REGION_STATES } from '../utils/filters.js';
import { submitFeedback } from '../game/api.js';
import './SideDrawer.css';

const REGIONS = Object.keys(REGION_STATES);
const CATEGORIES = Object.keys(CATEGORY_META);
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABELS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

const FEEDBACK_MAX_CHARS = 500;
const FEEDBACK_SUCCESS_MS = 2500;

function toggle(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export default function SideDrawer({
  open,
  onClose,
  sites,
  filters,
  onApplyFilters,
  showClassicFilters,
  difficulty,
  onSetDifficulty,
  onNavigate,
}) {
  const [name, setName] = useState(() => localStorage.getItem(LS_KEYS.NAME) ?? '');
  const [draftCategories, setDraftCategories] = useState(filters.categories);
  const [draftStates, setDraftStates] = useState(filters.states);
  const [expandedRegion, setExpandedRegion] = useState(null);

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackPhase, setFeedbackPhase] = useState('idle'); // 'idle' | 'sending' | 'sent'

  // Draft resets to the last-applied filters every time the drawer opens --
  // closing without Apply must not leave a half-edited draft lingering for
  // next time.
  useEffect(() => {
    if (open) {
      setDraftCategories(filters.categories);
      setDraftStates(filters.states);
    }
  }, [open, filters]);

  // Reverts the "Thanks!" confirmation back to an empty box a couple
  // seconds after sending. This drawer doesn't unmount on close (App.jsx
  // renders it unconditionally; `open` just gates its own early return
  // below), so this timer keeps running even while the drawer is closed
  // and has already reverted by the time it's reopened.
  useEffect(() => {
    if (feedbackPhase !== 'sent') return;
    const t = setTimeout(() => setFeedbackPhase('idle'), FEEDBACK_SUCCESS_MS);
    return () => clearTimeout(t);
  }, [feedbackPhase]);

  const categoryCounts = {};
  for (const cat of CATEGORIES) categoryCounts[cat] = 0;
  for (const s of sites) categoryCounts[s.category] = (categoryCounts[s.category] ?? 0) + 1;

  const matchCount = sites.filter(
    (s) => draftCategories.includes(s.category) && s.state.some((st) => draftStates.includes(st))
  ).length;

  function handleNameChange(e) {
    const value = e.target.value.slice(0, 30);
    setName(value);
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(LS_KEYS.NAME, trimmed);
    else localStorage.removeItem(LS_KEYS.NAME);
  }

  function handleApply() {
    onApplyFilters({ categories: draftCategories, states: draftStates });
    onClose();
  }

  function handleNavigate(dest) {
    onClose();
    onNavigate(dest);
  }

  async function handleSendFeedback() {
    const trimmed = feedbackText.trim();
    if (!trimmed || feedbackPhase === 'sending') return;
    setFeedbackPhase('sending');
    await submitFeedback(FEEDBACK_FORM_URL, FEEDBACK_ENTRY_ID, trimmed);
    setFeedbackText('');
    setFeedbackPhase('sent');
  }

  function regionState(region) {
    const states = REGION_STATES[region];
    const selectedCount = states.filter((s) => draftStates.includes(s)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === states.length) return 'all';
    return 'partial';
  }

  function toggleRegion(region) {
    const states = REGION_STATES[region];
    setDraftStates((prev) =>
      regionState(region) === 'all' ? prev.filter((s) => !states.includes(s)) : [...new Set([...prev, ...states])]
    );
  }

  if (!open) return null;

  const feedbackCounterClass =
    feedbackText.length >= 490 ? 'sd-feedback-counter-danger' : feedbackText.length >= 400 ? 'sd-feedback-counter-warn' : '';

  return (
    <div className="sd-backdrop" role="presentation" onClick={onClose}>
      <div className="sd-drawer" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <div className="sd-section">
          <label className="sd-name-label" htmlFor="sd-name-input">Player Name</label>
          <input
            id="sd-name-input"
            type="text"
            className="sd-name-input"
            value={name}
            onChange={handleNameChange}
            maxLength={30}
            placeholder="Player"
          />
        </div>

        {showClassicFilters && (
          <>
            <hr className="sd-divider" />

            <div className="sd-section">
              <p className="sd-heading">Difficulty</p>
              <div className="sd-chip-row">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`sd-chip${difficulty === level ? ' sd-chip-active' : ''}`}
                    style={difficulty === level ? { background: '#16a34a' } : undefined}
                    onClick={() => onSetDifficulty(level)}
                  >
                    {DIFFICULTY_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>

            <hr className="sd-divider" />

            <div className="sd-section">
              <p className="sd-heading">Category</p>
              <div className="sd-cat-list">
                {CATEGORIES.map((cat) => {
                  const active = draftCategories.includes(cat);
                  const color = CATEGORY_META[cat].color;
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`sd-cat-row${active ? ' sd-cat-row-active' : ''}`}
                      style={active ? { borderColor: color } : undefined}
                      onClick={() => setDraftCategories((prev) => toggle(prev, cat))}
                      aria-pressed={active}
                    >
                      <span className="sd-cat-dot" style={{ background: color }} />
                      <span className="sd-cat-label">{CATEGORY_META[cat].label}</span>
                      <span className="sd-cat-count">{categoryCounts[cat]}</span>
                      {active && <span className="sd-cat-check" style={{ color }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sd-section">
              <p className="sd-heading">Region & State</p>
              {REGIONS.map((region) => {
                const state = regionState(region);
                const isExpanded = expandedRegion === region;
                return (
                  <div key={region} className="sd-region">
                    <div className="sd-region-row">
                      <button
                        type="button"
                        className={`sd-region-check sd-region-check-${state}`}
                        onClick={() => toggleRegion(region)}
                        aria-label={`Toggle all ${region} states`}
                      />
                      <button
                        type="button"
                        className="sd-region-name"
                        onClick={() => setExpandedRegion(isExpanded ? null : region)}
                      >
                        {region} <span className="sd-region-arrow">{isExpanded ? '▾' : '▸'}</span>
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="sd-state-list">
                        {REGION_STATES[region].map((st) => (
                          <label key={st} className="sd-state-item">
                            <input
                              type="checkbox"
                              checked={draftStates.includes(st)}
                              onChange={() => setDraftStates((prev) => toggle(prev, st))}
                            />
                            {st}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="sd-section">
              <p className="sd-count">
                {matchCount === 0 ? 'No sites match these filters' : `Showing ${matchCount} sites`}
              </p>
              <button type="button" className="sd-apply-btn" disabled={matchCount === 0} onClick={handleApply}>
                Apply Filters
              </button>
            </div>
          </>
        )}

        <hr className="sd-divider" />

        <div className="sd-section sd-links">
          <button type="button" className="sd-link" onClick={() => handleNavigate('howtoplay')}>How to Play</button>
          <button type="button" className="sd-link" onClick={() => handleNavigate('about')}>About</button>
          <button type="button" className="sd-link" onClick={() => handleNavigate('privacy')}>Privacy Policy</button>
        </div>

        <hr className="sd-divider" />

        <div className="sd-section">
          <p className="sd-heading">Feedback</p>
          {feedbackPhase === 'sent' ? (
            <p className="sd-feedback-sent">Thanks! We read every message.</p>
          ) : (
            <>
              <textarea
                className="sd-feedback-textarea"
                rows={3}
                maxLength={FEEDBACK_MAX_CHARS}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="What's on your mind?"
                disabled={feedbackPhase === 'sending'}
              />
              <div className="sd-feedback-row">
                <span className={`sd-feedback-counter ${feedbackCounterClass}`}>
                  {feedbackText.length}/{FEEDBACK_MAX_CHARS}
                </span>
                <button
                  type="button"
                  className="sd-feedback-send-btn"
                  disabled={!feedbackText.trim() || feedbackPhase === 'sending'}
                  onClick={handleSendFeedback}
                >
                  {feedbackPhase === 'sending' ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
