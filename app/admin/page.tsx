"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";
import { formatCount } from "@/lib/device";

type AdminVideo = {
  id: string;
  title: string | null;
  description: string | null;
  storage_path: string;
  likes_count: number;
  created_at: string;
  url?: string;
};

type NotificationLog = {
  id: string;
  title: string;
  body: string | null;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

type Status = { kind: "ok" | "err" | "info"; text: string } | null;

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || session.user.is_anonymous) {
      setIsAdmin(null);
      return;
    }
    getSupabase()
      .from("admins")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  if (!ready) {
    return (
      <main className="screen">
        <div className="spinner" />
      </main>
    );
  }

  if (!session || session.user.is_anonymous) return <Login />;

  if (isAdmin === null) {
    return (
      <main className="screen">
        <div className="spinner" />
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="screen">
        <h1>Not an admin</h1>
        <p className="lead">{session.user.email} doesn&apos;t have admin access.</p>
        <button className="btn" onClick={() => getSupabase().auth.signOut()}>
          Sign out
        </button>
      </main>
    );
  }

  return <Dashboard session={session} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <main className="screen">
      <form className="login" onSubmit={submit}>
        <h1>Admin</h1>
        <p className="lead" style={{ margin: "0 auto 24px" }}>
          Sign in to manage videos and notifications.
        </p>
        <label className="field">
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="btn-primary" type="submit" disabled={busy} style={{ width: "100%", minWidth: 0 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    const [vids, notifs, subs] = await Promise.all([
      supabase
        .from("videos")
        .select("id,title,description,storage_path,likes_count,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("notifications")
        .select("id,title,body,sent_count,failed_count,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    ]);

    const rows = (vids.data ?? []) as AdminVideo[];
    if (rows.length) {
      const { data: signed } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrls(
        rows.map((r) => r.storage_path),
        60 * 60
      );
      rows.forEach((r, i) => (r.url = signed?.[i]?.signedUrl ?? undefined));
    }
    setVideos(rows);
    setLogs((notifs.data ?? []) as NotificationLog[]);
    setSubscriberCount(subs.count ?? 0);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalLikes = videos.reduce((sum, v) => sum + v.likes_count, 0);

  return (
    <main className="admin">
      <header>
        <h1>Bopz Admin</h1>
        <button className="btn" onClick={() => getSupabase().auth.signOut()}>
          Sign out
        </button>
      </header>

      <div className="stats">
        <div className="stat">
          <b>{videos.length}</b>
          <span>Videos</span>
        </div>
        <div className="stat">
          <b>{formatCount(totalLikes)}</b>
          <span>Hearts</span>
        </div>
        <div className="stat">
          <b>{subscriberCount ?? "–"}</b>
          <span>Push devices</span>
        </div>
      </div>

      <SendNotification session={session} onSent={refresh} />
      <UploadVideo onUploaded={refresh} />

      <section className="panel">
        <h2>Videos</h2>
        <p className="sub">Newest first. Deleting removes the file and all of its hearts.</p>
        {videos.length === 0 ? (
          <p className="status">No videos uploaded yet.</p>
        ) : (
          <ul className="list">
            {videos.map((v) => (
              <VideoRow key={v.id} video={v} onDeleted={refresh} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Sent notifications</h2>
        {logs.length === 0 ? (
          <p className="status">Nothing sent yet.</p>
        ) : (
          <ul className="list">
            {logs.map((n) => (
              <li key={n.id}>
                <div className="grow">
                  <div className="title">{n.title || n.body}</div>
                  <div className="meta">
                    {new Date(n.created_at).toLocaleString()} · {n.sent_count} delivered
                    {n.failed_count ? ` · ${n.failed_count} failed` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SendNotification({ session, onSent }: { session: Session; onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!confirm(`Send "${title.trim() || body.trim()}" to every subscribed device?`)) return;
    setBusy(true);
    setStatus({ kind: "info", text: "Sending…" });
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token ?? session.access_token;
      const res = await fetch("/api/admin/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, body, url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send");
      setStatus({
        kind: "ok",
        text: `Delivered to ${json.sent} of ${json.total} devices${json.removed ? ` (${json.removed} expired removed)` : ""}.`,
      });
      setTitle("");
      setBody("");
      onSent();
    } catch (err) {
      setStatus({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Send notification</h2>
      <p className="sub">Pops up on every device that installed the app and allowed notifications.</p>
      <label className="field">
        Title (optional)
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        Message
        <textarea value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="field">
        Open path when tapped
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/" />
      </label>
      <button className="btn accent" type="submit" disabled={busy || (!title.trim() && !body.trim())}>
        {busy ? "Sending…" : "Send to all"}
      </button>
      {status && <p className={`status ${status.kind === "info" ? "" : status.kind}`}>{status.text}</p>}
    </form>
  );
}

function UploadVideo({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [inputKey, setInputKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setStatus({ kind: "info", text: `Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB…` });

    const supabase = getSupabase();
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const path = `${crypto.randomUUID()}.${ext}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(path, file, { contentType: file.type || "video/mp4", cacheControl: "31536000", upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("videos").insert({
        storage_path: path,
        title: title.trim() || null,
        description: description.trim() || null,
      });
      if (insertError) {
        await supabase.storage.from(VIDEO_BUCKET).remove([path]);
        throw insertError;
      }

      setStatus({ kind: "ok", text: "Uploaded! It's now at the top of the feed." });
      setFile(null);
      setTitle("");
      setDescription("");
      setInputKey((k) => k + 1);
      onUploaded();
    } catch (err) {
      setStatus({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Upload video</h2>
      <p className="sub">Vertical MP4 (H.264) plays best on every phone.</p>
      <label className="field">
        Video file
        <input
          key={inputKey}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </label>
      <label className="field">
        Title (optional)
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        Description (optional)
        <textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <button className="btn accent" type="submit" disabled={busy || !file}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {status && <p className={`status ${status.kind === "info" ? "" : status.kind}`}>{status.text}</p>}
    </form>
  );
}

function VideoRow({ video, onDeleted }: { video: AdminVideo; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete "${video.title || "this video"}"? This can't be undone.`)) return;
    setBusy(true);
    const supabase = getSupabase();
    const { error } = await supabase.from("videos").delete().eq("id", video.id);
    if (error) {
      alert(error.message);
      setBusy(false);
      return;
    }
    await supabase.storage.from(VIDEO_BUCKET).remove([video.storage_path]);
    onDeleted();
  }

  return (
    <li>
      {video.url ? (
        <video className="thumb" src={`${video.url}#t=0.5`} muted playsInline preload="metadata" />
      ) : (
        <div className="thumb" />
      )}
      <div className="grow">
        <div className="title">{video.title || "Untitled"}</div>
        <div className="meta">
          {formatCount(video.likes_count)} hearts · {new Date(video.created_at).toLocaleDateString()}
        </div>
      </div>
      <button className="btn danger" onClick={remove} disabled={busy}>
        {busy ? "…" : "Delete"}
      </button>
    </li>
  );
}
