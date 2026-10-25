import { useRef, useState } from "react";
import { Export, Review, api, fmtBytes, fmtDur } from "../api";

const NEG_TAGS = ["too_many_zooms", "captions_too_large", "captions_too_slow",
  "cuts_too_aggressive", "music_too_loud", "bad_hook", "wrong_segment", "too_much_dead_air"];
const POS_TAGS = ["good_pacing", "great_captions", "captions_great_bold", "good_zooms",
  "great_clips", "great_hook"];
const TAG_LABELS: Record<string, string> = {
  too_many_zooms: "Too many zooms", captions_too_large: "Captions too large",
  captions_too_slow: "Captions too slow", cuts_too_aggressive: "Cuts too aggressive",
  music_too_loud: "Music too loud", bad_hook: "Bad hook", wrong_segment: "Wrong segment",
  too_much_dead_air: "Too much dead air", good_pacing: "Good pacing",
  great_captions: "Great captions", captions_great_bold: "Bold captions 👍",
  good_zooms: "Good zooms", great_clips: "Great clips", great_hook: "Great hook",
};
const ASPECTS: [string, string][] = [["captions", "Caption quality"], ["pacing", "Pacing"],
  ["selection", "Clip selection"], ["effects", "Zoom & effects"], ["audio", "Audio & music"]];

export function ReviewPanel({ projectId, exports, existingReviews, onSaved }: {
  projectId: string; exports: Export[]; existingReviews: Review[]; onSaved?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [neg, setNeg] = useState<string[]>([]);
  const [pos, setPos] = useState<string[]>([]);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [exportId, setExportId] = useState(exports[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (arr: string[], set: (v: string[]) => void, tag: string) =>
    set(arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag]);

  const submit = async () => {
    if (!rating) { setMsg("Pick a star rating first."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.review(projectId, {
        export_id: exportId || undefined, rating, feedback: text,
        positives: pos, negatives: neg, aspects });
      setMsg(`Saved. Learned ${Object.keys(r.learned_preferences).length} preference signals.`);
      setRating(0); setText(""); setNeg([]); setPos([]); setAspects({});
      onSaved?.();
    } catch (e: any) { setMsg("Error: " + e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Review this result</h2>
      {exports.length > 1 && (
        <>
          <label className="f">For which version?</label>
          <select className="field" value={exportId} onChange={(e) => setExportId(e.target.value)}>
            {exports.map((x) => <option key={x.id} value={x.id}>v{x.version} — {x.label || x.filename}</option>)}
          </select>
        </>
      )}
      <div className="stars" role="radiogroup" aria-label="Overall rating"
           onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} aria-label={`${i} star${i > 1 ? "s" : ""}`}
            className={i <= (hover || rating) ? "on" : ""}
            onMouseEnter={() => setHover(i)} onClick={() => setRating(i)}>★</button>
        ))}
      </div>
      <label className="f">What should change? (quick tags)</label>
      <div className="tagrow">
        {NEG_TAGS.map((t) => (
          <button key={t} className={`tag ${neg.includes(t) ? "sel-bad" : ""}`}
            onClick={() => toggle(neg, setNeg, t)}>{TAG_LABELS[t]}</button>
        ))}
      </div>
      <label className="f">What worked well?</label>
      <div className="tagrow">
        {POS_TAGS.map((t) => (
          <button key={t} className={`tag ${pos.includes(t) ? "sel-good" : ""}`}
            onClick={() => toggle(pos, setPos, t)}>{TAG_LABELS[t]}</button>
        ))}
      </div>
      {ASPECTS.map(([k, label]) => (
        <div key={k} className="row" style={{ marginTop: 8 }}>
          <span className="muted" style={{ flex: "0 0 130px" }}>{label}</span>
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} className={`btn small ${(aspects[k] || 0) === i ? "" : "secondary"}`}
              onClick={() => setAspects({ ...aspects, [k]: i })} aria-label={`${label} ${i}`}>{i}</button>
          ))}
        </div>
      ))}
      <label className="f">Written feedback (optional)</label>
      <textarea className="field" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Keep the bold captions but slow down the cuts near the end." />
      <div style={{ marginTop: 12 }} className="row">
        <button className="btn" disabled={busy} onClick={submit}>
          {busy ? <span className="spinner" /> : "Submit review"}
        </button>
        {msg && <span className="muted">{msg}</span>}
      </div>
      {existingReviews.length > 0 && (
        <>
          <h2>Past feedback</h2>
          <ul className="pill-list">
            {existingReviews.slice(0, 8).map((r) => (
              <li key={r.id}>
                {"★".repeat(r.rating || 0)}{"☆".repeat(5 - (r.rating || 0))}
                {" "}{r.feedback || (r.negatives.concat(r.positives).map((t) => TAG_LABELS[t] || t).join(", ")) || "—"}
                <span className="muted mono"> · {new Date(r.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function VersionHistory({ exports }: { exports: Export[] }) {
  if (!exports.length) return null;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Versions</h2>
      <table className="table">
        <thead><tr><th>v</th><th>Created</th><th>Duration</th><th>Size</th><th /></tr></thead>
        <tbody>
          {exports.map((x) => (
            <tr key={x.id}>
              <td>{x.version}</td>
              <td className="mono">{new Date(x.created_at).toLocaleString()}</td>
              <td>{fmtDur(x.duration_s)}</td>
              <td>{fmtBytes(x.size_bytes)}</td>
              <td>
                <a className="btn small secondary" href={`/api/exports/${x.id}/download`} download>Download</a>
                {x.srt_path && <>{" "}
                  <a className="btn small secondary" href={`/api/exports/${x.id}/srt`} download>SRT</a></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
