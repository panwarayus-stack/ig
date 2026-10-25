import { useEffect, useRef, useState } from "react";
import { Job, api } from "../api";

/** Live job progress via SSE with polling fallback. Real stage labels + percent. */
export function useJobProgress(jobId?: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    let es: EventSource | null = null;
    let poll: number | undefined;
    let stopped = false;

    const finishPolling = () => {
      poll = window.setInterval(async () => {
        try {
          const j = await api.job(jobId);
          setJob(j);
          if (["done", "failed", "cancelled"].includes(j.status)) {
            clearInterval(poll); poll = undefined;
          }
        } catch { /* transient */ }
      }, 2000);
    };

    (async () => {
      try { setJob(await api.job(jobId)); } catch { /* ignore */ }
      if (stopped) return;
      try {
        es = new EventSource(`/api/jobs/${jobId}/events`);
        es.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            setJob((prev) => ({ ...(prev || { id: jobId, project_id: "", created_at: "", status: "running" }),
              status: d.status ?? prev?.status ?? "running", stage: d.stage ?? prev?.stage,
              progress: d.progress ?? prev?.progress, error: d.error ?? prev?.error } as Job));
            if (["done", "failed", "cancelled"].includes(d.status)) es?.close();
          } catch { /* keepalive lines ignored */ }
        };
        es.onerror = () => {
          es?.close(); es = null;
          if (!poll && !stopped) finishPolling();   // SSE unavailable -> poll
        };
      } catch {
        finishPolling();
      }
    })();

    return () => {
      stopped = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [jobId]);
  return job;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)}
         aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.min(100, Math.max(0, value * 100)).toFixed(1)}%` }} />
    </div>
  );
}

export function JobProgress({ jobId, onDone }: { jobId?: string | null; onDone?: (j: Job) => void }) {
  const job = useJobProgress(jobId);
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (job && ["done", "failed", "cancelled"].includes(job.status) && notified.current !== job.id) {
      notified.current = job.id;
      onDone?.(job);
    }
  }, [job, onDone]);
  if (!job) return <span className="muted"><span className="spinner" /> loading job…</span>;
  const active = ["queued", "running"].includes(job.status);
  return (
    <div aria-live="polite">
      <div className="row" style={{ alignItems: "center", marginBottom: 8 }}>
        <span className={`badge ${job.status}`}>{job.status}</span>
        <span className="muted">{job.stage || (job.status === "queued" ? "waiting in queue" : "")}</span>
        <span style={{ marginLeft: "auto" }} className="mono">
          {Math.round((job.progress || 0) * 100)}%
        </span>
      </div>
      <ProgressBar value={job.progress || 0} />
      {job.error && <div className="err" style={{ marginTop: 10 }}>{job.error}</div>}
      {active && job.id && (
        <button className="btn danger small" style={{ marginTop: 10 }}
          onClick={async () => { try { await api.cancelJob(job.id); } catch (e: any) { alert(e.message); } }}>
          Cancel job
        </button>
      )}
    </div>
  );
}
