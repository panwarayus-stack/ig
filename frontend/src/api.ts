// API client + shared types. All calls are same-origin (/api) — no secrets here.
export interface Project {
  id: string; name: string; created_at: string; updated_at: string;
  source_filename?: string; duration_s?: number; width?: number; height?: number;
  kind?: string; user_prompt?: string; style?: string; aspect_ratio?: string;
  resolution?: string; mode?: string; status: string; error?: string | null;
  export_count?: number; latest_export?: Export | null; source_meta?: Meta;
}
export interface Meta {
  duration_s: number; size_bytes: number; width: number; height: number; fps: number;
  rotation: number; video_codec?: string; audio_codec?: string; has_video: boolean;
  has_audio: boolean; format_name?: string;
}
export interface Job {
  id: string; project_id: string; created_at: string; started_at?: string | null;
  finished_at?: string | null; status: string; stage?: string | null;
  progress?: number | null; error?: string | null; key_slot_used?: number | null;
}
export interface Export {
  id: string; project_id: string; version: number; created_at: string; path: string;
  filename: string; duration_s?: number; width?: number; height?: number;
  size_bytes?: number; label?: string; srt_path?: string | null; thumb_path?: string | null;
}
export interface Review {
  id: number; project_id: string; export_id?: string | null; created_at: string;
  rating?: number | null; feedback?: string | null; positives: string[];
  negatives: string[]; aspects: Record<string, number>;
}
export interface Health {
  status: string; database: { ok: boolean }; ffmpeg: { available: boolean; path: string | null; hw_encoder: string | null };
  gemini: { configured_slots: number[]; any_configured: boolean; model: string; note: string };
  disk: { total_gb: number | null; free_gb: number | null }; remote_mode: boolean;
}
export interface Settings {
  aspect_ratio: string; resolution: string; max_shorts: number; short_min_s: number;
  short_max_s: number; style: string; captions_enabled: boolean; caption_font_size: number;
  caption_color: string; caption_outline_color: string; caption_position: string;
  word_highlight: boolean; audio_normalize: boolean; loudness_target_lufs: number;
  zoom_enabled: boolean; transitions_enabled: boolean; ffmpeg_threads: number;
  prefer_hw_encoder: boolean; upload_max_mb: number; video_max_duration_s: number;
  concurrency: number;
}

async function jget<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`;
    try { const b = await r.json(); detail = typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail ?? detail); } catch { /* ignore */ }
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}

export const api = {
  health: () => jget<Health>("/api/health"),
  geminiStatus: () => jget<any>("/api/gemini/status"),
  settings: () => jget<Settings>("/api/settings"),
  saveSettings: (p: Partial<Settings>) =>
    jget<Settings>("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }),
  projects: () => jget<Project[]>("/api/projects"),
  project: (id: string) => jget<{ project: Project; jobs: Job[]; plan: any; exports: Export[]; reviews: Review[]; thumbnail: string | null }>(`/api/projects/${id}`),
  createProject: (form: FormData) => jget<Project>("/api/projects", { method: "POST", body: form }),
  deleteProject: (id: string) => jget(`/api/projects/${id}`, { method: "DELETE" }),
  renameProject: (id: string, name: string) =>
    jget(`/api/projects/${id}/rename`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
  startEdit: (id: string, p: { user_prompt: string; style: string; mode: string; aspect_ratio?: string; resolution?: string }) =>
    jget<{ job_id: string }>(`/api/projects/${id}/edit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }),
  retry: (id: string) => jget<{ job_id: string }>(`/api/projects/${id}/retry`, { method: "POST" }),
  jobs: () => jget<Job[]>("/api/jobs"),
  job: (id: string) => jget<Job>(`/api/jobs/${id}`),
  cancelJob: (id: string) => jget(`/api/jobs/${id}/cancel`, { method: "POST" }),
  exports: (pid: string) => jget<Export[]>(`/api/projects/${pid}/exports`),
  review: (pid: string, r: object) =>
    jget<{ ok: boolean; learned_preferences: Record<string, number> }>(`/api/projects/${pid}/review`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) }),
  preferences: () => jget<{ profile: Record<string, number>; reviews: Review[] }>("/api/preferences"),
  resetPreferences: () => jget("/api/preferences/reset", { method: "POST" }),
  testRender: () => jget<{ ok: boolean; meta: Meta }>("/api/diagnostics/test-render", { method: "POST" }),
};

export const mediaUrl = (kind: "source" | "export" | "thumb", pid: string, fname: string) =>
  `/api/media/${kind}/${pid}/${encodeURIComponent(fname)}`;
export const downloadUrl = (eid: string) => `/api/exports/${eid}/download`;
export const srtUrl = (eid: string) => `/api/exports/${eid}/srt`;

export function fmtBytes(n?: number | null): string {
  if (!n && n !== 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(2) + " GB";
}
export function fmtDur(s?: number | null): string {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
