'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function PracticeLabPage() {
  const [clickCount, setClickCount] = useState(0);
  const [doubleClickStatus, setDoubleClickStatus] = useState('Not double-clicked yet');
  const [dropdownResult, setDropdownResult] = useState('');
  const [checkboxes, setCheckboxes] = useState({ 1: false, 2: false, 3: false });
  const [showDynamic, setShowDynamic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');

  const loadData = () => {
    setLoaded(false);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setLoaded(true);
    }, 2500);
  };

  return (
    <div data-testid="practice-lab-page" className="space-y-6">
      <h1 className="text-2xl font-semibold">Automation Practice Lab</h1>
      <p className="text-sm text-slate-500">A sandbox of interactive widgets for practicing Playwright/Selenium automation.</p>

      <section data-testid="section-mouse" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-medium">Mouse Interactions</h2>
        <div className="flex flex-wrap items-center gap-4">
          <button
            data-testid="click-me-btn"
            onClick={() => setClickCount((c) => c + 1)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Click me
          </button>
          <span data-testid="click-count-display" className="text-sm text-slate-700">
            Clicks: {clickCount}
          </span>

          <button
            data-testid="double-click-btn"
            onDoubleClick={() => setDoubleClickStatus('Double-clicked!')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Double-click me
          </button>
          <span data-testid="double-click-status" className="text-sm text-slate-700">
            {doubleClickStatus}
          </span>

          <div
            data-testid="hover-box"
            className="rounded-md border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
          >
            Hover over me
          </div>
        </div>
      </section>

      <section data-testid="section-forms" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-medium">Forms &amp; Inputs</h2>
        <div className="flex flex-wrap items-center gap-6">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Dropdown</span>
            <select
              data-testid="practice-dropdown"
              value={dropdownResult}
              onChange={(e) => setDropdownResult(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select an option</option>
              <option value="apple">Apple</option>
              <option value="banana">Banana</option>
              <option value="cherry">Cherry</option>
              <option value="date">Date</option>
            </select>
          </label>
          <span data-testid="dropdown-result" className="text-sm text-slate-700">
            Selected: {dropdownResult || 'none'}
          </span>

          <div className="flex items-center gap-4">
            {([1, 2, 3] as const).map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  data-testid={`checkbox-${n}`}
                  checked={checkboxes[n]}
                  onChange={(e) => setCheckboxes((prev) => ({ ...prev, [n]: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Option {n}
              </label>
            ))}
          </div>
        </div>
      </section>

      <section data-testid="section-dynamic" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-medium">Dynamic Elements &amp; Waits</h2>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <button
              data-testid="toggle-dynamic-btn"
              onClick={() => setShowDynamic((v) => !v)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Toggle element
            </button>
            {showDynamic && (
              <div data-testid="dynamic-target-box" className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-300">
                I appeared!
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              data-testid="load-data-btn"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              {loading && <Loader2 data-testid="loading-spinner" className="h-4 w-4 animate-spin" />}
              Load data
            </button>
            {loaded && (
              <span data-testid="success-loaded-msg" className="text-sm font-medium text-emerald-700">
                Data loaded successfully!
              </span>
            )}
          </div>
        </div>
      </section>

      <section data-testid="section-text" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-3 font-medium">Text Input &amp; Mirroring</h2>
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="text"
            data-testid="practice-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type something..."
            className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span data-testid="text-output-mirror" className="text-sm text-slate-700">
            {text}
          </span>
        </div>
      </section>
    </div>
  );
}
