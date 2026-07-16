// src/components/SideDrawer.jsx
// Side drawer: Player Name, Difficulty (Classic only), Category +
// Region/State filters (Classic and Blitz), footer links, and an inline
// Feedback box.
//
// Category renders as a vertical list (one row per category) with each
// row's total site count computed once from the full `sites` prop -- a
// stable "how many exist in total" number, not a live facet count that
// shifts as the player toggles states. Difficulty stays a chip row (3
// short mutually-exclusive options suit chips better than a list).
//
// Feedback is a plain box at the bottom of the drawer -- submitting clears
// it and shows a brief inline "Thanks!" line, then reverts -- rather than a
// separate modal.
//
// `onNavigate` only ever fires for 'howtoplay'/'about'/'privacy', matching
// InfoModal's variants 1:1; Stats is reachable via BottomNav's own tab.

import { useState, useEffect, useRef } from 'react';
import { LS_KEYS, CATEGORY_META, FEEDBACK_FORM_URL, FEEDBACK_ENTRY_ID } from '../config.js';
import { REGION_STATES } from '../utils/filters.js';
import { submitFeedback } from '../game/api.js';
import { isSoundEnabled, setSoundEnabled } from '../utils/sound.js';
import './SideDrawer.css';

const REGIONS = Object.keys(REGION_STATES);
const CATEGORIES = Object.keys(CATEGORY_META);
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABELS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

const FEEDBACK_MAX_CHARS = 500;
const FEEDBACK_SUCCESS_MS = 2500;
// Must match the transform/background-color transition duration on
// .sd-backdrop / .sd-drawer in SideDrawer.css, so the drawer stays mounted
// for exactly as long as its close animation takes instead of vanishing
// mid-slide.
const DRAWER_TRANSITION_MS = 300;

function toggle(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export default function SideDrawer({
  open,
  onClose,
  sites,
  filters,
  onApplyFilters,
  showFilters,
  showDifficulty,
  difficulty,
  onSetDifficulty,
  onNavigate,
}) {
  const [name, setName] = useState(() => localStorage.getItem(LS_KEYS.NAME) ?? '');
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [expandedRegion, setExpandedRegion] = useState(null);
  // Each region's state list is measured (not guessed) because some state
  // names wrap to two lines at this drawer width -- a fixed per-row height
  // would be wrong for those.
  const stateListRefs = useRef({});

  // Smooth open/close: stay mounted through the close transition (`mounted`)
  // and flip `entered` a frame after mounting so the CSS transition has a
  // starting state to animate from, instead of the drawer just appearing.
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    setEntered(false);
    const t = setTimeout(() => setMounted(false), DRAWER_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [open]);

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackPhase, setFeedbackPhase] = useState('idle'); // 'idle' | 'sending' | 'sent'

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
    (s) => filters.categories.includes(s.category) && s.state.some((st) => filters.states.includes(st))
  ).length;

  function handleNameChange(e) {
    const value = e.target.value.slice(0, 30);
    setName(value);
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(LS_KEYS.NAME, trimmed);
    else localStorage.removeItem(LS_KEYS.NAME);
  }

  function handleSoundToggle(enabled) {
    setSoundOn(enabled);
    setSoundEnabled(enabled);
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
    const selectedCount = states.filter((s) => filters.states.includes(s)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === states.length) return 'all';
    return 'partial';
  }

  function toggleRegion(region) {
    const states = REGION_STATES[region];
    const nextStates =
      regionState(region) === 'all'
        ? filters.states.filter((s) => !states.includes(s))
        : [...new Set([...filters.states, ...states])];
    onApplyFilters({ categories: filters.categories, states: nextStates });
  }

  if (!mounted) return null;

  const feedbackCounterClass =
    feedbackText.length >= 490 ? 'sd-feedback-counter-danger' : feedbackText.length >= 400 ? 'sd-feedback-counter-warn' : '';

  return (
    <div className={`sd-backdrop${entered ? ' sd-open' : ''}`} role="presentation" onClick={onClose}>
      <div className="sd-drawer" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <div className="sd-banner">
          <div className="sd-banner-name">
            <input
              id="sd-name-input"
              type="text"
              className="sd-banner-name-input"
              value={name}
              onChange={handleNameChange}
              maxLength={30}
              placeholder="Name of Player"
              aria-label="Player Name"
            />
            <svg className="sd-banner-edit-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <button type="button" className="sd-banner-menu" onClick={onClose} aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <hr className="sd-divider" />

        <div className="sd-section">
          <p className="sd-heading">Sound</p>
          <div className="sd-chip-row">
            <button
              type="button"
              className={`sd-chip${soundOn ? ' sd-chip-active' : ''}`}
              style={soundOn ? { background: '#16a34a' } : undefined}
              onClick={() => handleSoundToggle(true)}
              aria-pressed={soundOn}
            >
              On
            </button>
            <button
              type="button"
              className={`sd-chip${!soundOn ? ' sd-chip-active' : ''}`}
              style={!soundOn ? { background: '#16a34a' } : undefined}
              onClick={() => handleSoundToggle(false)}
              aria-pressed={!soundOn}
            >
              Off
            </button>
          </div>
        </div>

        {showFilters && (
          <>
            {showDifficulty && (
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
              </>
            )}

            <hr className="sd-divider" />

            <div className="sd-section">
              <p className="sd-heading">Category</p>
              <div className="sd-cat-list">
                {CATEGORIES.map((cat) => {
                  const active = filters.categories.includes(cat);
                  const color = CATEGORY_META[cat].color;
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`sd-cat-row${active ? ' sd-cat-row-active' : ''}`}
                      style={active ? { borderColor: color } : undefined}
                      onClick={() => onApplyFilters({ categories: toggle(filters.categories, cat), states: filters.states })}
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
                        {region}{' '}
                        <span className={`sd-region-arrow${isExpanded ? ' sd-region-arrow-open' : ''}`}>▸</span>
                      </button>
                    </div>
                    <div
                      className="sd-state-collapse"
                      style={{
                        maxHeight: isExpanded ? `${stateListRefs.current[region]?.scrollHeight ?? 0}px` : '0px',
                      }}
                    >
                      <div className="sd-state-list" ref={(el) => (stateListRefs.current[region] = el)}>
                        {REGION_STATES[region].map((st) => (
                          <label key={st} className="sd-state-item">
                            <input
                              type="checkbox"
                              className="sd-state-checkbox-input"
                              checked={filters.states.includes(st)}
                              onChange={() => onApplyFilters({ categories: filters.categories, states: toggle(filters.states, st) })}
                            />
                            <span className="sd-state-checkbox">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 12.5l5 5L20 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            {st}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sd-section">
              <p className={`sd-count${matchCount === 0 ? ' sd-count-empty' : ''}`}>
                {matchCount === 0 ? 'No sites match those filters' : `Showing ${matchCount}/${sites.length} sites`}
              </p>
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
