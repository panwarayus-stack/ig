import { useCallback, useEffect, useRef, useState } from "react";
import {
  Export, Health, Job, Project, Settings, api, downloadUrl, fmtBytes, fmtDur,
  mediaUrl, srtUrl,
} from "./api";
import { JobProgress, ProgressBar, useJobProgress } from "./components/JobProgress";
import { ReviewPanel, VersionHistory } from "./components/Review";

type View =
  | { page: "dashboard" } | { page: "new" } | { page: "projects" }
  | { page: "queue" } | { page: "history" } | { page: "preferences" }
  | { page: "settings" } | { page: "project"; id: string };

const NAV: [View["page"], string][] = [
  ["dashboard", "Dashboard"], ["new", "New edit"], ["projects", "Projects"],
  ["queue", "Processing queue"], ["history", "Review history"],
  ["preferences", "Preferences"], ["settings", "Settings & diagnostics"],
];

export default function App() {
  const [view, setView] = useState<View>({ page: "dashboard" });
  const [health, setHealth] = useState<Health | null>(null);
  const go = (v: View) => setView(v);

  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, [view]);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="logo">Auto<em>Viral</em> Shorts</div>
        {NAV.map(([p, label]) => (
          <button key={p} className={`navbtn ${view.page === p ? "active" : ""}`}
            onClick={() => go({ page: p } as View)}>{label}</button>
        ))}
        <div style={{ marginTop: "auto" }} className="muted mono">
          {health ? (
            <>ffmpeg {health.ffmpeg.available ? "✓" : "✗"} · gemini slots{" "}
            {health.gemini.configured_slots.length}/3</>
          ) : <span style={{ color: "var(--danger)" }}>backend offline</span>}
        </div>
      </nav>
      <main className="main">
        {view.page === "dashboard" && <Dashboard go={go} health={health} />}
        {view.page === "new" && <NewEdit go={go} health={health} />}
        {view.page === "projects" && <Projects go={go} />}
        {view.page === "queue" && <Queue go={go} />}
        {view.page === "history" && <History go={go} />}
        {view.page === "preferences" && <Preferences />}
        {view.page === "settings" && <SettingsPage health={health} refreshHealth={() => api.health().then(setHealth)} />}
        {view.page === "project" && <ProjectDetail id={view.id} go={go} />}
      </main>
    </div>
  );
}

/* ------------------------------- Dashboard ------------------------------ */
function Dashboard({ go, health }: { go: (v: View) => void; health: Health | null }) {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { api.projects().then(setProjects).catch(() => {}); }, []);
  const done = projects.filter((p) => p.status === "done");
  const active = projects.filter((p) => ["queued", "running", "analyzing", "rendering"].includes(p.status));
  if (!health) return <><h1>Dashboard</h1><div className="err">Cannot reach the backend. Start it with <code>python run.py</code>.</div></>;
  return (
    <>
      <h1>Dashboard</h1>
      <p className="sub">Upload → describe (optional) → process → review → download.</p>
      {!health.gemini.any_configured && (
        <div className="warnbox">No Gemini API keys configured — AI analysis is disabled.
          Add keys to <code>.env</code> (see Settings). Local heuristic edits still work.</div>}
      {!health.ffmpeg.available && (
        <div className="err">FFmpeg not found on PATH — rendering cannot run. Install instructions in Settings.</div>}
      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        <div className="card stat"><div className="num">{projects.length}</div><div className="lbl">projects</div></div>
        <div className="card stat"><div className="num">{done.length}</div><div className="lbl">completed</div></div>
        <div className="card stat"><div className="num">{active.length}</div><div className="lbl">processing now</div></div>
        <div className="card stat"><div className="num">{fmtBytes(health.disk.free_gb != null ? health.disk.free_gb * 1e9 : 0)}</div><div className="lbl">disk free</div></div>
      </div>
      <div className="row" style={{ maxWidth: 460 }}>
        <button className="btn" onClick={() => go({ page: "new" })}>⬆ Upload a video & start</button>
      </div>
      <h2>Recent projects</h2>
      {projects.length === 0 ? (
        <div className="empty"><div className="big">🎬</div>No projects yet.<br />
          Upload your first video to get started.</div>
      ) : (
        <div className="grid cols-3">
          {projects.slice(0, 9).map((p) => <ProjectCard key={p.id} p={p} go={go} />)}
        </div>)}
      <h2>Completed exports</h2>
      {done.length === 0 ? <p className="muted">Nothing finished yet.</p> : (
        <table className="table"><thead><tr><th>Project</th><th>Duration</th><th>Created</th><th /></tr></thead>
          <tbody>{done.slice(0, 8).map((p) => (
            <tr key={p.id}>
              <td><a href="#" onClick={(e) => { e.preventDefault(); go({ page: "project", id: p.id }); }}>{p.name}</a></td>
              <td>{fmtDur(p.latest_export?.duration_s ?? p.duration_s)}</td>
              <td className="mono">{new Date(p.updated_at).toLocaleString()}</td>
              <td>{p.latest_export && <a className="btn small secondary" href={downloadUrl(p.latest_export.id)} download>Download</a>}</td>
            </tr>))}</tbody></table>)}
    </>
  );
}

function ProjectCard({ p, go }: { p: Project; go: (v: View) => void }) {
  const thumbName = (p.latest_export?.thumb_path || "").split(/[\\/]/).pop() || "source.jpg";
  return (
    <div className="card hover" style={{ cursor: "pointer" }} onClick={() => go({ page: "project", id: p.id })}>
      <img className="thumb" alt="" loading="lazy"
        src={mediaUrl("thumb", p.id, thumbName)}
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
      <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
        <strong style={{ flex: 2 }}>{p.name}</strong>
        <span className={`badge ${p.status}`} style={{ flex: 0 }}>{p.status}</span>
      </div>
      <div className="muted mono">{fmtDur(p.duration_s)} · {p.width}×{p.height} · {p.mode === "enhance" ? "enhance" : "extract"}
        {p.export_count ? ` · ${p.export_count} export${p.export_count > 1 ? "s" : ""}` : ""}</div>
    </div>
  );
}

/* -------------------------------- New edit ------------------------------ */
function NewEdit({ go, health }: { go: (v: View) => void; health: Health | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("auto");
  const [mode, setMode] = useState("auto");
  const [aspect, setAspect] = useState("9:16");
  const [res, setRes] = useState("1080p");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f?: File | null) => { if (f) { setFile(f); setErr(null); } };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const start = async () => {
    if (!file) { setErr("Choose a video file first."); return; }
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("user_prompt", prompt);
      form.append("style", style);
      form.append("mode", mode);
      form.append("aspect_ratio", aspect);
      form.append("resolution", res);
      const proj = await api.createProject(form);
      setPid(proj.id);
      const r = await api.startEdit(proj.id, { user_prompt: prompt, style, mode, aspect_ratio: aspect, resolution: res });
      setJobId(r.job_id);
    } catch (e: any) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1>New edit</h1>
      <p className="sub">Long videos are cut into distinct Shorts automatically; existing vertical Shorts are enhanced in place.</p>
      <div className={`dropzone ${over ? "over" : ""}`} role="button" tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <input ref={inputRef} type="file" hidden accept="video/*,.mkv,.avi,.mov,.mp4,.webm,.m4v,.flv,.wmv,.ts,.mpg"
          onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <div>
              <strong>{file.name}</strong><br />
              {fmtBytes(file.size)} · click or drop to replace
            </div>
          ) : (<div><strong>Drag & drop a video here</strong><br />or click to browse<br />
            <span className="mono">MP4 · MOV · MKV · WebM · AVI … (validated by ffprobe)</span></div>)}
      </div>
      {file && !health?.ffmpeg.available && <div className="err">FFmpeg missing — uploads will be rejected.</div>}

      <label className="f">Describe what you want (optional — leave blank for fully automatic editing)</label>
      <textarea className="field" value={prompt} onChange={(e) => setPrompt(e.target.value)}
        placeholder={"e.g. Make this gaming clip funny and fast-paced. Start with the funniest moment, use large bold captions, zoom into reactions, remove boring pauses, keep the original game audio clear."} />
      <div className="row">
        <div>
          <label className="f">Editing style</label>
          <select className="field" value={style} onChange={(e) => setStyle(e.target.value)}>
            {["auto", "clean_podcast", "fast_cut_commentary", "gaming_energy", "storytime",
              "educational_explainer", "cinematic", "funny_reaction", "viral_general"]
              .map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="f">Mode</label>
          <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">auto-detect</option>
            <option value="extract">long video → shorts (extract)</option>
            <option value="enhance">short → enhanced short</option>
          </select>
        </div>
        <div>
          <label className="f">Aspect</label>
          <select className="field" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option>9:16</option><option>1:1</option><option>16:9</option>
          </select>
        </div>
        <div>
          <label className="f">Resolution</label>
          <select className="field" value={res} onChange={(e) => setRes(e.target.value)}>
            <option value="1080p">1080×1920</option><option value="720p">720×1280</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <button className="btn" onClick={start} disabled={busy || !!jobId}>
          {busy ? <><span className="spinner" /> uploading…</> : jobId ? "processing…" : "✨ Start processing"}
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {jobId && pid && (
        <div className="card" style={{ marginTop: 16 }}>
          <JobProgress jobId={jobId} onDone={(j) => { if (j.status === "done") go({ page: "project", id: pid }); }} />
          <div style={{ marginTop: 10 }}>
            <button className="btn small secondary" onClick={() => go({ page: "project", id: pid })}>Open project</button>
          </div>
        </div>)}
    </>
  );
}

/* ------------------------------- Projects ------------------------------- */
function Projects({ go }: { go: (v: View) => void }) {
  const [list, setList] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const load = useCallback(() => api.projects().then(setList).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const filtered = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1>Projects</h1>
      <input className="field" style={{ maxWidth: 380, marginBottom: 16 }} placeholder="Search…"
        value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
      {filtered.length === 0 ? <div className="empty"><div className="big">📁</div>No projects match.</div> : (
        <div className="grid cols-3">{filtered.map((p) => <ProjectCard key={p.id} p={p} go={go} />)}</div>)}
    </>
  );
}

/* -------------------------------- Queue ---------------------------------- */
function Queue({ go }: { go: (v: View) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const load = () => api.jobs().then(setJobs).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);
  const cancel = async (id: string) => { try { await api.cancelJob(id); } catch (e: any) { alert(e.message); } load(); };
  return (
    <>
      <h1>Processing queue</h1>
      <p className="sub">One heavy render runs at a time (configurable). Jobs persist across restarts.</p>
      {jobs.length === 0 ? <div className="empty"><div className="big">🕐</div>Queue is empty.</div> : (
        <table className="table">
          <thead><tr><th>Project</th><th>Status</th><th>Stage</th><th>Progress</th><th>Key slot</th><th /></tr></thead>
          <tbody>{jobs.slice(0, 40).map((j) => (
            <tr key={j.id}>
              <td><a href="#" onClick={(e) => { e.preventDefault(); go({ page: "project", id: j.project_id }); }}>{j.project_id.slice(0, 8)}</a></td>
              <td><span className={`badge ${j.status}`}>{j.status}</span></td>
              <td className="muted">{j.stage || ""}{j.error ? ` — ${j.error.slice(0, 80)}` : ""}</td>
              <td style={{ minWidth: 120 }}><ProgressBar value={j.progress || 0} /></td>
              <td className="mono">{j.key_slot_used != null ? `#${j.key_slot_used + 1}` : "—"}</td>
              <td>{["queued", "running"].includes(j.status) &&
                <button className="btn small danger" onClick={() => cancel(j.id)}>Cancel</button>}</td>
            </tr>))}</tbody>
        </table>)}
    </>
  );
}

/* ------------------------------ History ---------------------------------- */
function History({ go }: { go: (v: View) => void }) {
  const [data, setData] = useState<{ profile: Record<string, number>; reviews: any[] } | null>(null);
  useEffect(() => { api.preferences().then(setData).catch(() => {}); }, []);
  if (!data) return <p><span className="spinner" /></p>;
  return (
    <>
      <h1>Review history</h1>
      {data.reviews.length === 0 ? <div className="empty"><div className="big">⭐</div>No reviews yet — rate a finished render to build your personal style profile.</div> : (
        <table className="table">
          <thead><tr><th>Date</th><th>Rating</th><th>Feedback</th><th>Tags</th><th /></tr></thead>
          <tbody>{data.reviews.map((r) => (
            <tr key={r.id}>
              <td className="mono">{new Date(r.created_at).toLocaleDateString()}</td>
              <td>{"★".repeat(r.rating || 0)}</td>
              <td>{r.feedback || "—"}</td>
              <td className="muted">{[...(r.positives || []), ...(-(r.negatives || []) as any)].join(", ") || ""}
                {(r.negatives || []).map((t: string) => `-${t}`).join(" ")}</td>
              <td><button className="btn small secondary" onClick={() => go({ page: "project", id: r.project_id })}>open</button></td>
            </tr>))}</tbody>
        </table>)}
    </>
  );
}

/* ----------------------------- Preferences ------------------------------- */
function Preferences() {
  const [data, setData] = useState<{ profile: Record<string, number>; reviews: any[] } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => api.preferences().then(setData).catch(() => {});
  useEffect(load, []);
  if (!data) return <p><span className="spinner" /></p>;
  const entries = Object.entries(data.profile);
  return (
    <>
      <h1>Learned preferences</h1>
      <p className="sub">Derived from your feedback (recency-weighted, transparent numbers). This adapts prompts and editing decisions — the model itself is not retrained. Your current explicit instructions always win.</p>
      {entries.length === 0 ? <div className="empty"><div className="big">🧠</div>Nothing learned yet. Submit reviews after renders to train your profile.</div> : (
        <div className="card"><table className="table">
          <thead><tr><th>Signal</th><th>Weight</th><th /></tr></thead>
          <tbody>{entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, v]) => (
            <tr key={k}><td className="mono">{k}</td>
              <td>{v > 0 ? "+" : ""}{v.toFixed(2)} <span className="progress" style={{ display: "inline-block", width: 120, verticalAlign: "middle" }}>
                <div style={{ width: `${Math.abs(v) * 100}%` }} /></span></td>
              <td className="muted">{v > 0.15 ? "more of this" : v < -0.15 ? "less of this" : "neutral"}</td></tr>
          ))}</tbody></table></div>)}
      <div style={{ marginTop: 16 }}>
        <button className="btn danger" onClick={async () => {
          if (confirm("Reset all learned preferences? Reviews are kept but stop influencing edits until you re-enable learning by reviewing again.")) {
            await api.resetPreferences(); load(); setMsg("Preferences reset.");
          }}}>Reset learned preferences</button>
        <span className="muted"> {msg}</span>
      </div>
    </>
  );
}

/* --------------------------- Settings & diagnostics ---------------------- */
function SettingsPage({ health, refreshHealth }: { health: Health | null; refreshHealth: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [gs, setGs] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [testOut, setTestOut] = useState<string>("");
  useEffect(() => {
    api.settings().then(setS).catch(() => {});
    api.geminiStatus().then(setGs).catch(() => {});
  }, []);
  if (!s) return <p><span className="spinner" /> loading settings…</p>;
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const save = async () => {
    try { await api.saveSettings(s); setMsg("Saved ✓"); refreshHealth(); }
    catch (e: any) { setMsg("Error: " + e.message); }
  };
  const testRender = async () => {
    setTestOut("running real FFmpeg test render…");
    try { const r = await api.testRender(); setTestOut(`OK — ${r.meta.duration_s}s ${r.meta.width}×${r.meta.height}, audio=${r.meta.has_audio ? "yes" : "no"}, verified decodable.`); }
    catch (e: any) { setTestOut("FAILED: " + e.message); }
  };
  return (
    <>
      <h1>Settings & diagnostics</h1>
      <div className="grid cols-2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Output defaults</h2>
          <div className="row">
            <div><label className="f">Aspect ratio</label>
              <select className="field" value={s.aspect_ratio} onChange={(e) => set({ aspect_ratio: e.target.value })}>
                <option>9:16</option><option>1:1</option><option>16:9</option></select></div>
            <div><label className="f">Resolution</label>
              <select className="field" value={s.resolution} onChange={(e) => set({ resolution: e.target.value })}>
                <option value="1080p">1080p</option><option value="720p">720p</option></select></div>
            <div><label className="f">Max shorts per long video</label>
              <input className="field" type="number" min={1} max={6} value={s.max_shorts}
                onChange={(e) => set({ max_shorts: +e.target.value })} /></div>
          </div>
          <div className="row">
            <div><label className="f">Short length min (s)</label>
              <input className="field" type="number" value={s.short_min_s} onChange={(e) => set({ short_min_s: +e.target.value })} /></div>
            <div><label className="f">Short length max (s)</label>
              <input className="field" type="number" value={s.short_max_s} onChange={(e) => set({ short_max_s: +e.target.value })} /></div>
          </div>
          <h2>Captions</h2>
          <label className="row" style={{ flex: "0 0 auto" }}>
            <input type="checkbox" checked={s.captions_enabled} onChange={(e) => set({ captions_enabled: e.target.checked })} style={{ flex: 0 }} />
            <span className="muted">Burn in captions when available</span></label>
          <div className="row">
            <div><label className="f">Font size (9–22)</label>
              <input className="field" type="number" value={s.caption_font_size} onChange={(e) => set({ caption_font_size: +e.target.value })} /></div>
            <div><label className="f">Color</label>
              <input className="field" type="color" value={s.caption_color} onChange={(e) => set({ caption_color: e.target.value })} style={{ height: 42 }} /></div>
            <div><label className="f">Outline</label>
              <input className="field" type="color" value={s.caption_outline_color} onChange={(e) => set({ caption_outline_color: e.target.value })} style={{ height: 42 }} /></div>
            <div><label className="f">Position</label>
              <select className="field" value={s.caption_position} onChange={(e) => set({ caption_position: e.target.value })}>
                <option>bottom</option><option>middle</option><option>top</option></select></div>
          </div>
          <h2>Effects & audio</h2>
          <div className="row">
            <label className="row" style={{ flex: "0 0 auto" }}><input type="checkbox" style={{ flex: 0 }} checked={s.zoom_enabled} onChange={(e) => set({ zoom_enabled: e.target.checked })} /><span className="muted">Zoom events</span></label>
            <label className="row" style={{ flex: "0 0 auto" }}><input type="checkbox" style={{ flex: 0 }} checked={s.transitions_enabled} onChange={(e) => set({ transitions_enabled: e.target.checked })} /><span className="muted">Fades between cuts</span></label>
            <label className="row" style={{ flex: "0 0 auto" }}><input type="checkbox" style={{ flex: 0 }} checked={s.audio_normalize} onChange={(e) => set({ audio_normalize: e.target.checked })} /><span className="muted">Loudness normalize</span></label>
            <label className="row" style={{ flex: "0 0 auto" }}><input type="checkbox" style={{ flex: 0 }} checked={s.word_highlight} onChange={(e) => set({ word_highlight: e.target.checked })} /><span className="muted">Word highlight (karaoke)</span></label>
          </div>
          <h2>Performance</h2>
          <div className="row">
            <div><label className="f">FFmpeg threads (0=auto)</label>
              <input className="field" type="number" value={s.ffmpeg_threads} onChange={(e) => set({ ffmpeg_threads: +e.target.value })} /></div>
            <div><label className="f">Concurrent jobs (1 recommended)</label>
              <input className="field" type="number" min={1} max={2} value={s.concurrency} onChange={(e) => set({ concurrency: +e.target.value })} /></div>
            <div><label className="f">Upload limit (MB)</label>
              <input className="field" type="number" value={s.upload_max_mb} onChange={(e) => set({ upload_max_mb: +e.target.value })} /></div>
            <label className="row" style={{ flex: "0 0 auto", alignSelf: "end" }}><input type="checkbox" style={{ flex: 0 }} checked={s.prefer_hw_encoder} onChange={(e) => set({ prefer_hw_encoder: e.target.checked })} /><span className="muted">Prefer HW encoder</span></label>
          </div>
          <div style={{ marginTop: 16 }} className="row">
            <button className="btn" onClick={save}>Save settings</button>
            <span className="muted">{msg}</span>
          </div>
        </div>
        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Diagnostics</h2>
            <table className="table">
              <tbody>
                <tr><td>Backend</td><td className="mono">{health ? "up ✓" : "down ✗"}</td></tr>
                <tr><td>Database</td><td className="mono">{health?.database.ok ? "ok ✓" : "FAIL"}</td></tr>
                <tr><td>FFmpeg</td><td className="mono">{health?.ffmpeg.available ? health.ffmpeg.path : "NOT FOUND ✗"}</td></tr>
                <tr><td>HW encoder detected</td><td className="mono">{health?.ffmpeg.hw_encoder || "none (software libx264)"}</td></tr>
                <tr><td>Disk free</td><td className="mono">{health?.disk.free_gb ?? "?"} GB</td></tr>
                <tr><td>Gemini model</td><td className="mono">{health?.gemini.model}</td></tr>
                <tr><td>Remote mode</td><td className="mono">{health?.remote_mode ? "ON (token required)" : "off (local only)"}</td></tr>
              </tbody>
            </table>
            <button className="btn secondary small" style={{ marginTop: 10 }} onClick={testRender}>Run FFmpeg test render</button>
            {testOut && <div className={testOut.startsWith("OK") ? "badge ok" : "err"} style={{ marginTop: 10, display: "block", padding: 10 }}>{testOut}</div>}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>Gemini key slots (sanitized)</h2>
            {gs ? (
              <table className="table"><thead><tr><th>Slot</th><th>Configured</th><th>State</th><th>OK/Fail</th></tr></thead>
                <tbody>{gs.slots.map((sl: any) => (
                  <tr key={sl.slot}>
                    <td>#{sl.slot}</td>
                    <td>{sl.configured ? "✓" : "—"}</td>
                    <td>{sl.cooling_down ? <span className="badge queued">cooldown {sl.cooldown_remaining_s}s</span> :
                      sl.last_error_kind ? <span className="badge failed">{sl.last_error_kind}</span> :
                      <span className="badge ok">ready</span>}</td>
                    <td className="mono">{sl.successes}/{sl.failures}</td>
                  </tr>))}</tbody></table>
            ) : <span className="muted">unreachable</span>}
            <p className="muted" style={{ fontSize: ".8rem" }}>Keys live only in <code>.env</code> on the server. Quota may be shared across keys of one Google project. Never log or expose keys.</p>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>Installing FFmpeg</h2>
            <ul className="pill-list">
              <li><b>Windows:</b> <span className="mono">winget install Gyan.FFmpeg</span> (restart shell; verify: <span className="mono">ffmpeg -version</span>)</li>
              <li><b>macOS:</b> <span className="mono">brew install ffmpeg</span></li>
              <li><b>Debian/Ubuntu:</b> <span className="mono">sudo apt install ffmpeg</span></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

/* ----------------------------- Project detail ---------------------------- */
function ProjectDetail({ id, go }: { id: string; go: (v: View) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.project>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"output" | "original">("output");
  const [prompt, setPrompt] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const load = useCallback(() => {
    api.project(id).then((d) => { setData(d); setPrompt(d.project.user_prompt || ""); })
      .catch((e) => setErr(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (err) return <div className="err">{err}</div>;
  if (!data) return <p><span className="spinner" /> loading project…</p>;
  const { project: p, jobs, plan, exports, reviews, thumbnail } = data;
  const latestJob = jobs[0];
  const activeJob = jobs.find((j) => ["queued", "running"].includes(j.status));
  const meta = p.source_meta as any;
  const outExport = exports[0];

  const startNewVersion = async () => {
    try { const r = await api.startEdit(id, { user_prompt: prompt, style: p.style || "auto", mode: p.mode || "auto" }); void r; load(); }
    catch (e: any) { setErr(e.message); }
  };
  const retry = async () => { try { await api.retry(id); load(); } catch (e: any) { setErr(e.message); } };
  const del = async () => {
    if (!confirm(`Delete "${p.name}" and ALL its files (source + exports)? This cannot be undone.`)) return;
    await api.deleteProject(id); go({ page: "projects" });
  };

  return (
    <>
      <div className="row" style={{ alignItems: "center" }}>
        <h1 style={{ flex: 2 }}>
          {renaming ? (
            <span>
              <input className="field" style={{ maxWidth: 300 }} value={nameInput} autoFocus
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={async (e) => { if (e.key === "Enter") { await api.renameProject(id, nameInput); setRenaming(false); load(); } }} />
              <button className="btn small" style={{ marginLeft: 8 }} onClick={async () => { await api.renameProject(id, nameInput); setRenaming(false); load(); }}>Save</button>
            </span>
          ) : (
            <>{p.name}{" "}
              <button className="btn small secondary" onClick={() => { setRenaming(true); setNameInput(p.name); }}>rename</button></>
          )}
        </h1>
        <span className={`badge ${p.status}`} style={{ flex: 0 }}>{p.status}</span>
        <button className="btn small secondary" style={{ flex: 0 }} onClick={() => go({ page: "projects" })}>← back</button>
      </div>
      <p className="sub mono">{p.kind === "short" ? "existing Short → enhance mode" : "long video → extract mode"} · {fmtDur(p.duration_s)} · {p.width}×{p.height}
        {" · "}{meta?.video_codec || "?"}/{meta?.audio_codec || "no-audio"} · {fmtBytes(meta?.size_bytes)}</p>
      {err && <div className="err">{err}</div>}
      {p.error && p.status === "failed" && <div className="err">{p.error}</div>}

      {activeJob && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Processing</h2>
          <JobProgress jobId={activeJob.id} onDone={load} />
        </div>)}

      <div className="grid cols-2">
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <button className={`btn small ${tab === "output" ? "" : "secondary"}`} onClick={() => setTab("output")}>Final output</button>
            <button className={`btn small ${tab === "original" ? "" : "secondary"}`} onClick={() => setTab("original")}>Original</button>
          </div>
          {tab === "output" ? (outExport ? (
            <>
              <video className="preview" controls playsInline preload="metadata"
                src={mediaUrl("export", id, outExport.filename)} key={outExport.id} />
              <div className="row" style={{ marginTop: 10 }}>
                <a className="btn small" href={downloadUrl(outExport.id)} download>⬇ Download MP4</a>
                {outExport.srt_path && <a className="btn small secondary" href={srtUrl(outExport.id)} download>⬇ SRT subtitles</a>}
                <span className="muted mono">{fmtDur(outExport.duration_s)} · {outExport.width}×{outExport.height} · {fmtBytes(outExport.size_bytes)}</span>
              </div>
            </>
          ) : <p className="muted">No export yet{p.status === "draft" ? " — start an edit below." : "."}</p>) : (
            <video className="preview" controls playsInline preload="metadata"
              src={mediaUrl("source", id, p.source_filename || "")} />)}
          <h2>Instructions & AI plan</h2>
          <label className="f">Natural-language direction for the next version</label>
          <textarea className="field" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe changes… or leave as-is" />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={startNewVersion} disabled={!!activeJob}>▶ Process new version</button>
            {["failed", "cancelled", "done"].includes(p.status) && !activeJob && (
              <button className="btn secondary" onClick={retry} disabled={!!activeJob}>↻ Retry last job</button>)}
            <button className="btn danger" onClick={del} style={{ marginLeft: "auto" }}>Delete project</button>
          </div>
          {plan && (
            <>
              <h2>Last validated edit plan <span className="muted mono" style={{ fontSize: ".75rem" }}>{plan.notes}</span></h2>
              <ul className="pill-list">
                <li><b>objective:</b> {plan.plan_json.objective || "—"}</li>
                <li><b>style:</b> {plan.plan_json.style} · <b>confidence:</b> {plan.plan_json.confidence}</li>
                {(plan.plan_json.segments || []).slice(0, 8).map((s: any, i: number) => (
                  <li key={i} className="mono">[{s.start_s.toFixed(1)}s → {s.end_s.toFixed(1)}s] ({s.kind}) {s.reason?.slice(0, 90)}</li>
                ))}
                <li>{(plan.plan_json.captions || []).length} caption cues · {(plan.plan_json.zooms || []).length} zooms</li>
                {(plan.plan_json.uncertainty_notes || []).map((n: string, i: number) => (
                  <li key={i} className="muted">⚠ {n}</li>))}
              </ul>
            </>)}
        </div>
        <div>
          {p.status === "done" && <ReviewPanel projectId={id} exports={exports} existingReviews={reviews} onSaved={load} />}
          <VersionHistory exports={exports} />
          <div className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>Job history</h2>
            <table className="table"><thead><tr><th>When</th><th>Status</th><th>Stage</th><th>Key</th></tr></thead>
              <tbody>{jobs.slice(0, 10).map((j) => (
                <tr key={j.id}>
                  <td className="mono">{new Date(j.created_at).toLocaleTimeString()}</td>
                  <td><span className={`badge ${j.status}`}>{j.status}</span></td>
                  <td className="muted" title={j.error || ""}>{(j.stage || "").slice(0, 46)}</td>
                  <td className="mono">{j.key_slot_used != null ? `#${j.key_slot_used + 1}` : "—"}</td>
                </tr>))}</tbody></table>
          </div>
        </div>
      </div>
    </>
  );
}
