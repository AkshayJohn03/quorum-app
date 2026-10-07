'use client';

import { useEffect, useRef, useState } from 'react';
import type { DecisionReport } from '@/lib/types';
import { STARTERS } from '@/lib/concepts';

const STAGES = ['Concept', 'Street', 'Verdict'];
const CONVENING_LINES = [
  'building the neighborhood fingerprint from 250M entities',
  'scanning all 10 Qloo domains — brands, places, music, film…',
  'seating panelist 1 — receipt attached',
  'panelist 3 disagrees with the data. probing',
  'scanning for unserved demand',
  'computing the grounding rate',
];

type Step = 0 | 1 | 2;
type Phase = 'form' | 'convening' | 'report';

export default function Page() {
  const [step, setStep] = useState<Step>(0);
  const [phase, setPhase] = useState<Phase>('form');
  const [idea, setIdea] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [report, setReport] = useState<DecisionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conveningLine, setConveningLine] = useState(0);
  const [copied, setCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; domain: string }[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (phase !== 'convening') return;
    const t = setInterval(() => setConveningLine((n) => (n + 1) % CONVENING_LINES.length), 850);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    const q = neighborhood.trim();
    if (q.length < 2) { setSuggestions([]); setActiveIdx(-1); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quorum/places?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = await res.json();
        setSuggestions(Array.isArray(json.results) ? json.results : []);
        setActiveIdx(-1);
      } catch { /* aborted or transient */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [neighborhood]);

  useEffect(() => {
    const el = taRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(56, el.scrollHeight)}px`; }
  }, [idea]);

  async function convene() {
    if (idea.trim().length < 12 || !neighborhood.trim()) return;
    setPhase('convening');
    setError(null);
    try {
      const res = await fetch('/api/quorum/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: idea, neighborhood }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `failed: ${res.status}`);
      setReport(json as DecisionReport);
      setStep(2);
      setPhase('report');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
      setPhase('form');
    }
  }

  function restart() {
    setReport(null); setIdea(''); setNeighborhood('');
    setError(null); setStep(0); setPhase('form');
  }

  async function copyReport() {
    if (!report) return;
    const md = [
      `# Quorum verdict — ${report.verdict}`,
      `**${report.concept} @ ${report.neighborhood}** · fit ${Math.round(report.fitScore * 100)}/100 · grounding ${Math.round(report.groundingRate * 100)}%`,
      '',
      ...report.reasons.map((r) => `+ ${r.text}`),
      ...report.conflicts.map((c) => `- ${c.text}`),
      ...(report.pivot ? [`-> PIVOT: ${report.pivot.concept} — ${report.pivot.why}`] : []),
      ...(report.gap ? [`(i) ${report.gap}`] : []),
      '', 'Next: ' + report.nextInterviews.join(' · '),
    ].join('\n');
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const vhClass = report?.verdict === 'GO' ? 'vh-go' : 'vh-nogo';
  const ready = idea.trim().length >= 12;

  return (
    <div className="wrap">
      <header className="top">
        <span className="brand">Quorum<em>.</em></span>
        <nav className="steps" aria-label="Progress">
          {STAGES.map((s, i) => (
            <span key={s} className={`step ${i === step ? 'step-active' : ''} ${i < step ? 'step-done' : ''}`}>{i + 1} · {s}</span>
          ))}
        </nav>
      </header>

      {phase === 'form' && (
        <>
          <section className="hero">
            <h1>The lease is <em>three years.</em><br />The panel, three minutes.</h1>
            <p>First-time F&amp;B founders lose the most on one guess: <strong>right concept, wrong street.</strong> Quorum convenes a panel of your neighborhood — every panelist built from a measured taste fingerprint spanning 250M entities across 10 domains, every reaction carrying its receipt.</p>
          </section>

          {step === 0 && (
            <section aria-label="Describe your concept">
              <h2 className="step-head">First — the concept in your head</h2>
              <div className="prompt-wrap">
                <div className="prompt-inner">
                  <textarea ref={taRef} value={idea} onChange={(e) => setIdea(e.target.value)}
                    placeholder="Describe the concept in your head — any idea, any audience, any city"
                    rows={2} maxLength={400} aria-label="Describe your concept"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && ready) { e.preventDefault(); setStep(1); } }}
                  />
                  <div className="prompt-footer">
                    <span className="pb-tag">Qloo taste graph · 250M entities</span>
                    <span className="prompt-count">{idea.length}/400</span>
                  </div>
                </div>
              </div>
              {ready && <button type="button" className="go mt-3" onClick={() => setStep(1)}>Next — pick a street →</button>}
              <div className="chips">
                <span className="chips-label">starter ideas:</span>
                {STARTERS.map((st) => (
                  <button key={st} type="button" className="chip" onClick={() => setIdea(st)}>
                    {st.slice(0, 45)}{st.length > 45 ? '…' : ''}
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 1 && ready && (
            <section aria-label="Choose the street">
              <h2 className="step-head">Second — the street you&apos;re signing for</h2>
              <input className="street-input" value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
                  else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === 'Enter') {
                    if (activeIdx >= 0 && suggestions[activeIdx]) { e.preventDefault(); setNeighborhood(suggestions[activeIdx].name); setSuggestions([]); setActiveIdx(-1); }
                  }
                  else if (e.key === 'Escape') { setSuggestions([]); setActiveIdx(-1); }
                }}
                placeholder="Berlin, East Austin, Shoreditch — any street Qloo knows"
                aria-label="street" maxLength={200} autoComplete="off" />
              {suggestions.length > 0 && (
                <div className="street-results" role="listbox" aria-label="Street suggestions">
                  {suggestions.map((s, i) => (
                    <button type="button" role="option" aria-selected={i === activeIdx}
                      className={`street-result ${i === activeIdx ? 'street-result-active' : ''}`}
                      key={`${s.id}-${i}`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => { setNeighborhood(s.name); setSuggestions([]); setActiveIdx(-1); }}>
                      <span>{s.name}</span>
                      <span className="street-domain">{s.domain}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="street-hint">The street is used as a Qloo signal — results are the intersection of your concept&apos;s audience and this location.</p>
              {neighborhood.trim().length >= 2 && (
                <div className="convene-bar">
                  <p>Ready: <strong>{idea.slice(0, 70)}{idea.length > 70 ? '…' : ''}</strong> on <strong>{neighborhood}</strong></p>
                  <button className="go" onClick={convene}>Convene the panel</button>
                  <button className="ghost" onClick={() => setStep(0)}>change concept</button>
                </div>
              )}
            </section>
          )}

          </>
          )}

          {phase === 'report' && report && (
            <section aria-label="Verdict dashboard">
              <div className="dash">
                <div className="dash-head">
                  <div className={`vh-verdict ${vhClass}`}>{report.verdict}</div>
                  <div className="vh-body">
                    <strong>{report.concept}</strong>
                    <span>{report.neighborhood} · fit {Math.round(report.fitScore * 100)}/100 · grounding {Math.round(report.groundingRate * 100)}% · panel of {report.panel.length}</span>
                  </div>
                </div>
                <div className="meter">
                  <div><label>concept–street fit</label><div className="bar"><i style={{ width: `${Math.round(report.fitScore * 100)}%` }} /></div><div className="val">{Math.round(report.fitScore * 100)}/100</div></div>
                  <div><label>panel grounding rate</label><div className="bar"><i style={{ width: `${Math.round(report.groundingRate * 100)}%` }} /></div><div className="val">{Math.round(report.groundingRate * 100)}% receipt-cited</div></div>
                </div>
                <div className="dash-grid">
                  <div className="dash-col">
                    <h3>Findings</h3>
                    {report.reasons.map((r, i) => (
                      <div className="finding f-pos" key={`p${i}`}>
                        <p><span className="f-mark">+</span>{r.text}</p>
                        <div className="f-receipts">receipt: {r.receipts.map((rc, j) => <b key={j}>{rc.entity} ({rc.affinity.toFixed(2)}) </b>)}</div>
                      </div>
                    ))}
                    {report.conflicts.map((c, i) => (
                      <div className="finding f-neg" key={`n${i}`}>
                        <p><span className="f-mark">−</span>{c.text}</p>
                        <div className="f-receipts">receipt: {c.receipts.map((rc, j) => <b key={j}>{rc.entity} ({rc.affinity.toFixed(2)}) </b>)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="dash-col">
                    <h3>Panel transcript</h3>
                    {report.panel.map((s, i) => (
                      <div className={`turn ${s.grounded ? '' : 'ungrounded'}`} key={i}>
                        <div className="t-who"><span>{s.panelist}</span><span className={`t-stance-${s.stance}`}>{s.stance}</span></div>
                        <p>{s.text}</p>
                        <div className="t-receipts">receipts: {s.groundedIn.map((r) => `${r.entity} (${r.affinity.toFixed(2)})`).join(' · ')}{!s.grounded && ' · ungrounded'}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="strip">
                  <div className="cell"><h4>Unserved demand</h4><p>{report.gap || 'No gap surfaced — supply matches taste.'}</p></div>
                  <div className={`cell ${report.pivot ? 'hl' : ''}`}><h4>{report.pivot ? 'Recommended pivot' : 'Pivot'}</h4><p>{report.pivot ? `${report.pivot.concept} — ${report.pivot.why}` : 'No pivot needed.'}</p></div>
                  <div className="cell"><h4>Talk to next</h4><p>{report.nextInterviews.map((n, i) => <span key={i}>{n}{i < report.nextInterviews.length - 1 ? '. ' : ''}</span>)}</p></div>
                </div>
                <div className="after">
                  <button className="go" onClick={copyReport}>{copied ? 'copied' : 'Copy report'}</button>
                  <button className="markdown" onClick={restart}>Test another street</button>
                </div>
              </div>
            </section>
          )}

          {phase === 'convening' && (
            <section className="convening" aria-live="polite">
              <div className="pulse" />
              <p className="convening-line">{CONVENING_LINES[conveningLine]}</p>
            </section>
          )}

          <section className="how" aria-label="How the verdict is computed">
            <h2>How the verdict is computed</h2>
            <ol>
              <li><strong>Fingerprint.</strong> The street&apos;s audience is measured, not guessed — cross-domain taste correlations from Qloo&apos;s graph of 250M entities.</li>
              <li><strong>Grounded panel.</strong> Synthetic locals react strictly through their fingerprint; every sentence carries its receipt. Skeptics and one rejector are convened on purpose.</li>
              <li><strong>Verdict with receipts.</strong> GO or NO-GO — the strongest measured signal to lean toward, the unserved gap, and the real people to interview next.</li>
            </ol>
            <p className="honest">Quorum produces grounded hypotheses. It cannot predict the future, and it will always name the real humans you should talk to before signing a lease.</p>
          </section>

          <footer>
            Quorum produces grounded hypotheses — it cannot predict the future, and it will always name
            the real humans to talk to before a lease is signed. Qloo Agentic Hackathon entry ·{' '}
            <a href="https://github.com/AkshayJohn03/Quorum" target="_blank" rel="noopener">github.com/AkshayJohn03/Quorum</a>
          </footer>
        </div>
      );
}
