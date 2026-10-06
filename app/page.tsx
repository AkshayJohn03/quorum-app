'use client';

import { useEffect, useRef, useState } from 'react';
import type { DecisionReport } from '@/lib/types';
import { STARTERS } from '@/lib/concepts';

const STAGES = ['Concept', 'Street', 'Verdict'];

interface TraceEvent {
  event: string;
  data: Record<string, unknown>;
}

interface StreetResult {
  id: string;
  name: string;
  domain: string;
}

interface ComparePanelist {
  panelist: string;
  reaction: string;
  receipt: string | null;
  grounded: boolean;
}

export default function Page() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [phase, setPhase] = useState<'form' | 'convening' | 'report'>('form');
  const [idea, setIdea] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [streetResults, setStreetResults] = useState<StreetResult[]>([]);
  const [streetLoading, setStreetLoading] = useState(false);
  const [report, setReport] = useState<DecisionReport | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [comparison, setComparison] = useState<{ grounded: ComparePanelist[]; ungrounded: ComparePanelist[] } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // debounced street search
  useEffect(() => {
    if (step !== 1 || neighborhood.trim().length < 2) { setStreetResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quorum/places?q=${encodeURIComponent(neighborhood)}`);
        const json = await res.json();
        setStreetResults(json.results || []);
      } catch { setStreetResults([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [neighborhood, step]);

  async function convene() {
    if (idea.trim().length < 12 || !neighborhood.trim()) return;
    setPhase('convening');
    setError(null);
    setTrace([]);
    setReport(null);
    setComparison(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/quorum/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: idea, neighborhood }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('no stream');
      const decoder = new TextDecoder();
      let buffer = '';
      const events: TraceEvent[] = [];
      let finalReport: DecisionReport | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            events.push(evt);
            setTrace([...events]);
            if (evt.event === 'verdict') {
              finalReport = {
                idea,
                concept: idea,
                neighborhood,
                verdict: evt.data.verdict,
                fitScore: evt.data.fit,
                groundingRate: evt.data.groundingRate,
                reasons: (evt.data.loves || []).map((l: string) => ({ text: l, receipts: [] })),
                conflicts: [],
                pivot: null,
                gap: evt.data.gap,
                panel: evt.data.statements || [],
                segmentLabel: neighborhood,
                nextInterviews: [],
              };
              setReport(finalReport);
            }
            if (evt.event === 'done') { setPhase('report'); }
            if (evt.event === 'error') { setError(evt.data.message as string); setPhase('form'); return; }
          } catch { /* partial line, wait for more */ }
        }
      }
      setStep(2);
      setPhase('report');

      // fetch comparison
      try {
        const cmpRes = await fetch('/api/quorum/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concept: idea, neighborhood }),
        });
        const cmp = await cmpRes.json();
        setComparison(cmp);
      } catch { /* comparison is optional */ }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'something went wrong');
        setPhase('form');
      }
    }
  }

  function stop() { abortRef.current?.abort(); setPhase('form'); }

  function restart() {
    setReport(null); setIdea(''); setNeighborhood(''); setStreetResults([]);
    setError(null); setTrace([]); setComparison(null); setShowCompare(false);
    setStep(0); setPhase('form');
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

  const vhClass = report?.verdict === 'GO' ? 'vh-go' : report?.verdict === 'PIVOT' ? 'vh-pivot' : 'vh-nogo';
  const canConvene = idea.trim().length >= 12 && neighborhood.trim().length >= 2;

  return (
    <div className="wrap">
      <header className="top">
        <span className="brand">Quorum<span>,</span> a focus group in a box</span>
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
            <p>First-time F&B founders lose the most on one guess: <strong>right concept, wrong street.</strong> Quorum convenes a panel of your neighborhood — every panelist built from a measured taste fingerprint spanning 250M entities across 10 domains, every reaction carrying its receipt.</p>
          </section>

          {step === 0 && (
            <section aria-label="Describe your concept">
              <h2 className="step-head">First — the concept in your head</h2>
              <textarea className="street-input" style={{ minHeight: '84px' }} value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="A listening bar — vinyl on the decks, high-end coffee, no talking past 8pm"
                rows={3} maxLength={400} />
              {idea.trim().length >= 12 && (
                <button type="button" className="go" style={{ marginTop: '0.6rem' }} onClick={() => setStep(1)}>Next — pick a street →</button>
              )}
              <div className="chips" style={{ marginTop: '0.6rem' }}>
                <span className="chips-label">starter ideas:</span>
                {STARTERS.map((st) => (
                  <button key={st} type="button" className="chip" onClick={() => setIdea(st)}>{st.slice(0, 50)}{st.length > 50 ? '…' : ''}</button>
                ))}
              </div>
            </section>
          )}

          {step >= 1 && idea.trim().length >= 12 && (
            <section aria-label="Search for a street">
              <h2 className="step-head">Second — the street. <span className="dim">for your concept</span></h2>
              <input className="street-input" value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Type a neighborhood, city, or area — e.g. Berlin, East Austin, Shoreditch…"
                aria-label="Search for a street" maxLength={200} />
              {streetResults.length > 0 && (
                <div className="street-results">
                  {streetResults.map((r) => (
                    <button key={r.id} type="button" className={`street-result ${r.name === neighborhood ? 'street-result-active' : ''}`}
                      onClick={() => { setNeighborhood(r.name); setStreetResults([]); }}>
                      {r.name}<span className="street-domain">{r.domain}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {step >= 1 && neighborhood.trim().length >= 2 && idea.trim().length >= 12 && (
            <div className="convene-bar">
              <p>Ready: <strong>{idea.slice(0, 80)}{idea.length > 80 ? '…' : ''}</strong> on <strong>{neighborhood}</strong></p>
              <button className="go" onClick={convene}>Convene the panel</button>
              <button className="ghost" onClick={() => { setNeighborhood(''); setStreetResults([]); }}>change street</button>
            </div>
          )}

          <section className="how" aria-label="How the verdict is computed">
            <h2>How the verdict is computed</h2>
            <ol>
              <li><strong>Fingerprint.</strong> The street's audience is measured, not guessed — cross-domain taste correlations from Qloo's graph of 250M entities.</li>
              <li><strong>Grounded panel.</strong> Synthetic locals react strictly through their fingerprint; every sentence carries its receipt. Skeptics and one rejector are convened on purpose.</li>
              <li><strong>Verdict with receipts.</strong> GO, PIVOT (with the concept the data prefers) or NO-GO — plus the unserved gap and the real people to interview next.</li>
            </ol>
            <p className="honest">Quorum produces grounded hypotheses. It cannot predict the future, and it will always name the real humans you should talk to before signing a lease.</p>
          </section>
        </>
      )}

      {phase === 'convening' && (
        <section aria-label="Agent working">
          <div className="trace-panel">
            <div className="trace-header">
              <div className="pulse-dot" />
              <span className="trace-title">Agent running — watch it think</span>
            </div>
            <div className="trace-events">
              {trace.length === 0 && <p className="trace-empty">connecting to Qloo…</p>}
              {trace.map((evt, i) => (
                <div key={i} className={`trace-line trace-${evt.event}`}>
                  <span className="trace-event">{evt.event.replace(/_/g, ' ')}</span>
                  <span className="trace-detail">
                    {evt.event === 'stage' && (evt.data.label as string)}
                    {evt.event === 'searching' && `searching Qloo: "${evt.data.query}" (${(evt.data.filterType as string).replace('urn:entity:', '')})`}
                    {evt.event === 'entity_found' && `found: ${evt.data.name} (${evt.data.domain})`}
                    {evt.event === 'neighborhood' && `street signal: ${evt.data.name} (${evt.data.domain})`}
                    {evt.event === 'domain_scanned' && `${evt.data.label}: ${evt.data.count} results`}
                    {evt.event === 'fingerprint_complete' && `fingerprint complete: ${evt.data.total} receipts`}
                    {evt.event === 'planned' && `${(evt.data.searches as unknown[]).length} searches planned`}
                    {evt.event === 'panelist' && `${evt.data.panelist} (${evt.data.stance}) — ${evt.data.receipt} @ ${evt.data.affinity}`}
                    {evt.event === 'adaptive_probe' && `agent probed: ${evt.data.probe}`}
                    {evt.event === 'verdict' && `verdict: ${evt.data.verdict} — grounding ${Math.round((evt.data.groundingRate as number) * 100)}%`}
                    {evt.event === 'error' && `error: ${evt.data.message}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {phase === 'report' && report && (
        <section aria-label="Verdict dashboard">
          {/* grounding rate hero */}
          <div className="grounding-hero">
            <div className="gh-number">{Math.round((report.groundingRate || 0) * 100)}<span>%</span></div>
            <div className="gh-label">grounding rate<br /><span className="gh-sub">panel claims traceable to Qloo receipts</span></div>
            {report.gap && (
              <div className="gh-gap">
                <strong>Unserved demand:</strong> {report.gap}
              </div>
            )}
          </div>

          <div className="dash">
            <div className="dash-head">
              <div className={`vh-verdict ${vhClass}`}>{report.verdict}</div>
              <div className="vh-body">
                <strong>{report.concept}</strong>
                <span>{report.neighborhood} · fit {Math.round(report.fitScore * 100)}/100 · panel of {report.panel.length}</span>
              </div>
            </div>

            <div className="meter">
              <div><label>concept–street fit</label><div className="bar"><i style={{ width: `${Math.round(report.fitScore * 100)}%` }} /></div><div className="val">{Math.round(report.fitScore * 100)}/100</div></div>
              <div><label>grounding rate</label><div className="bar"><i style={{ width: `${Math.round((report.groundingRate || 0) * 100)}%` }} /></div><div className="val">{Math.round((report.groundingRate || 0) * 100)}%</div></div>
            </div>

            <div className="dash-grid">
              <div className="dash-col">
                <h3>Findings</h3>
                {report.reasons.map((r, i) => (
                  <div className="finding f-pos" key={`p${i}`}><p><span className="f-mark">+</span>{r.text}</p>
                    <div className="f-receipts">receipt: {r.receipts.map((rc, j) => <b key={j}>{rc.entity} ({rc.affinity.toFixed(2)}) </b>)}</div>
                  </div>
                ))}
                {report.conflicts.map((c, i) => (
                  <div className="finding f-neg" key={`n${i}`}><p><span className="f-mark">−</span>{c.text}</p>
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
                    {s.adaptiveProbe && <div className="t-probe">agent probe: {s.adaptiveProbe}</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="strip">
              <div className="cell"><h4>Unserved demand</h4><p>{report.gap || 'No gap surfaced.'}</p></div>
              <div className={`cell ${report.pivot ? 'hl' : ''}`}><h4>{report.pivot ? 'Recommended pivot' : 'Pivot'}</h4><p>{report.pivot ? `${report.pivot.concept} — ${report.pivot.why}` : 'No pivot needed.'}</p></div>
              <div className="cell"><h4>Talk to next</h4><p>{report.nextInterviews.map((n, i) => <span key={i}>{n}{i < report.nextInterviews.length - 1 ? '. ' : ''}</span>)}</p></div>
            </div>

            <div className="after">
              <button className="go" onClick={copyReport}>{copied ? 'copied' : 'Copy report'}</button>
              <button className="markdown" onClick={() => setShowCompare(!showCompare)}>
                {showCompare ? 'Hide comparison' : 'Compare: grounded vs ungrounded'}
              </button>
              <button className="markdown" onClick={restart}>Test another street</button>
            </div>

            {showCompare && comparison && (
              <div className="compare-grid">
                <div className="compare-col compare-grounded">
                  <h4>Grounded panel — with Qloo fingerprints</h4>
                  {comparison.grounded.map((p, i) => (
                    <div className="compare-entry" key={i}>
                      <span className="ce-who">{p.panelist}</span>
                      <p>{p.reaction}</p>
                      {p.receipt && <span className="ce-receipt">{p.receipt}</span>}
                    </div>
                  ))}
                </div>
                <div className="compare-col compare-ungrounded">
                  <h4>Ungrounded panel — no Qloo, just LLM guessing</h4>
                  {comparison.ungrounded.map((p, i) => (
                    <div className="compare-entry" key={i}>
                      <span className="ce-who">{p.panelist}</span>
                      <p>{p.reaction}</p>
                      <span className="ce-receipt">no receipt — the LLM is guessing</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <footer>
        Quorum produces grounded hypotheses — it cannot predict the future, and it will always name
        the real humans to talk to before a lease is signed. Qloo Agentic Hackathon entry ·{' '}
        <a href="https://github.com/AkshayJohn03/Quorum" target="_blank" rel="noopener">github.com/AkshayJohn03/Quorum</a>
      </footer>
    </div>
  );
}
