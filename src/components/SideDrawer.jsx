// src/components/SideDrawer.jsx
//
// Section 9's side drawer. Scope for this pass: Player Name (wired to
// LS_KEYS.NAME) and the Category + Region/State filter tree (wired to
// App.jsx's lifted `classicFilters` state, which ClassicMap.jsx now takes
// as a prop instead of its old hardcoded DEFAULT_FILTERS).
//
// Deliberately NOT wired yet: the Difficulty buttons. Difficulty lives
// behind `setDifficulty` inside useMapState(mapRef, 'classic'), which is
// instantiated inside ClassicMap.jsx itself (tied to classicMapRef) -- this
// drawer renders at the App.jsx level, above both map screens, so reaching
// it needs the same "report a setter up via callback prop" pattern
// DailyMap.jsx uses for onRoundStateChange. Not done in this pass; the
// buttons below are static/disabled rather than half-wired to something
// that silently no-ops.
//
// Footer links (Statistics/How to Play/About/Privacy) are disabled +
// title="Coming soon", same pattern as BottomNav's Stats tab and
// BottomCard's Play Trivia -- none of those destination screens/content
// exist yet, and Privacy Policy specifically isn't something to fabricate
// text for without real content to put there.

import { useState, useEffect } from 'react';
import { LS_KEYS, CATEGORY_META } from '../config.js';
import { REGION_STATES } from '../utils/filters.js';
import './SideDrawer.css';

const REGIONS = Object.keys(REGION_STATES);
const CATEGORIES = Object.keys(CATEGORY_META);

function toggle(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export default function SideDrawer({ open, onClose, sites, filters, onApplyFilters, showClassicFilters }) {
  const [name, setName] = useState(() => localStorage.getItem(LS_KEYS.NAME) ?? '');
  const [draftCategories, setDraftCategories] = useState(filters.categories);
  const [draftStates, setDraftStates] = useState(filters.states);
  const [expandedRegion, setExpandedRegion] = useState(null);

  // Draft resets to the last-applied filters every time the drawer opens --
  // closing without Apply must not leave a half-edited draft lingering for
  // next time.
  useEffect(() => {
    if (open) {
      setDraftCategories(filters.categories);
      setDraftStates(filters.states);
    }
  }, [open, filters]);

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
              <p className="sd-heading">Category</p>
              <div className="sd-chip-row">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`sd-chip${draftCategories.includes(cat) ? ' sd-chip-active' : ''}`}
                    style={draftCategories.includes(cat) ? { background: CATEGORY_META[cat].color } : undefined}
                    onClick={() => setDraftCategories((prev) => toggle(prev, cat))}
                  >
                    {CATEGORY_META[cat].label}
                  </button>
                ))}
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
          <button type="button" className="sd-link" disabled title="Coming soon">Statistics</button>
          <button type="button" className="sd-link" disabled title="Coming soon">How to Play</button>
          <button type="button" className="sd-link" disabled title="Coming soon">About</button>
          <button type="button" className="sd-link" disabled title="Coming soon">Privacy Policy</button>
        </div>
      </div>
    </div>
  );
}
