import { useEffect, useState } from "react";

type ConsentState = {
  essential: true;
  analytics: boolean;
  preferences: boolean;
  updatedAt: string;
};

const CONSENT_KEY = "vistabalayan_cookie_consent_v1";

const readConsent = (): ConsentState | null => {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<ConsentState>;
    if (typeof parsed.analytics !== "boolean" || typeof parsed.preferences !== "boolean") return null;
    return { essential: true, analytics: parsed.analytics, preferences: parsed.preferences, updatedAt: parsed.updatedAt || "" };
  } catch {
    return null;
  }
};

export default function CookieConsent() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [preferences, setPreferences] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    setConsent(existing);
    if (existing) {
      setAnalytics(existing.analytics);
      setPreferences(existing.preferences);
    }
  }, []);

  const save = (nextAnalytics: boolean, nextPreferences: boolean) => {
    const next: ConsentState = {
      essential: true,
      analytics: nextAnalytics,
      preferences: nextPreferences,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(next));
    setConsent(next);
    setShowPreferences(false);
  };

  if (showPreferences) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" role="presentation">
        <section className="w-full max-w-lg rounded-3xl bg-[#E0E5EC] p-6 text-[#193364] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6C9772]">Privacy controls</p>
              <h2 id="cookie-preferences-title" className="mt-2 text-2xl font-semibold">Manage cookie preferences</h2>
            </div>
            <button type="button" onClick={() => setShowPreferences(false)} className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-white/60" aria-label="Close cookie preferences">Close</button>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">Essential storage is always enabled because it supports security, consent choices, and basic site operation. Optional categories are currently not used for advertising.</p>
          <div className="mt-5 space-y-3">
            <label className="flex items-start gap-3 rounded-2xl bg-white/60 p-4">
              <input type="checkbox" checked disabled className="mt-1" />
              <span><strong className="block">Essential</strong><span className="text-sm text-slate-600">Required for core functionality and remembering your consent choice.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-white/60 p-4">
              <input type="checkbox" checked={preferences} onChange={(event) => setPreferences(event.target.checked)} className="mt-1" />
              <span><strong className="block">Preferences</strong><span className="text-sm text-slate-600">Allows optional convenience settings, when enabled by the site.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-white/60 p-4">
              <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} className="mt-1" />
              <span><strong className="block">Analytics</strong><span className="text-sm text-slate-600">Optional measurement tools. No third-party analytics tool is currently identified in this build.</span></span>
            </label>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => save(false, false)} className="rounded-2xl px-4 py-3 text-sm font-semibold text-[#193364] hover:bg-white/60">Reject optional</button>
            <button type="button" onClick={() => save(analytics, preferences)} className="rounded-2xl bg-[#193364] px-4 py-3 text-sm font-semibold text-white">Save preferences</button>
          </div>
        </section>
      </div>
    );
  }

  if (!consent) {
    return (
      <aside className="fixed inset-x-0 bottom-0 z-[90] border-t border-slate-300 bg-[#E0E5EC]/95 p-4 text-[#193364] shadow-[0_-8px_24px_rgba(15,23,42,0.15)] backdrop-blur" role="region" aria-label="Cookie consent">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <h2 className="font-semibold">Privacy choices</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">We use essential browser storage for site operation and consent management. Optional categories are not used for advertising. Read our <a className="font-semibold underline" href="/cookie-policy">Cookie Policy</a> and <a className="font-semibold underline" href="/privacy-policy">Privacy Policy</a>.</p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[19rem] sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" onClick={() => save(false, false)} className="rounded-2xl border border-[#193364] px-4 py-3 text-sm font-semibold">Reject optional</button>
            <button type="button" onClick={() => setShowPreferences(true)} className="rounded-2xl border border-[#193364] px-4 py-3 text-sm font-semibold">Manage preferences</button>
            <button type="button" onClick={() => save(true, true)} className="rounded-2xl bg-[#193364] px-4 py-3 text-sm font-semibold text-white">Accept all</button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <button type="button" onClick={() => setShowPreferences(true)} className="fixed bottom-4 left-4 z-[80] rounded-full border border-slate-300 bg-[#E0E5EC] px-3 py-2 text-xs font-semibold text-[#193364] shadow-lg" aria-label="Open cookie preferences">
      Cookie settings
    </button>
  );
}
