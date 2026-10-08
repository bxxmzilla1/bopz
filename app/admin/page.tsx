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
  link_url: string | null;
  link_label: string | null;
  url?: string;
};

function normalizeLink(input: string): string | null {
  const raw = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

function validateButton(
  linkUrl: string,
  linkLabel: string
): { link_url: string | null; link_label: string | null } | { error: string } {
  const label = linkLabel.trim();
  if (!linkUrl.trim()) {
    return label ? { error: "Enter the link the button should open." } : { link_url: null, link_label: null };
  }
  const link = normalizeLink(linkUrl);
  if (!link) return { error: "That button link isn't a valid web address." };
  if (!label) return { error: "Enter the button text people will see." };
  return { link_url: link, link_label: label };
}

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

type Section = "overview" | "notify" | "videos" | "history" | "devices";

const SECTIONS: { id: Section; label: string; title: string; subtitle: string; icon: React.ReactNode }[] = [
  {
    id: "overview",
    label: "Overview",
    title: "Overview",
    subtitle: "How Bopz is doing at a glance.",
    icon: <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z" />,
  },
  {
    id: "notify",
    label: "Send notification",
    title: "Send notification",
    subtitle: "Pops up on every phone that installed the app.",
    icon: <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 0 0 4 0" />,
  },
  {
    id: "videos",
    label: "Video posts",
    title: "Video posts",
    subtitle: "Upload, edit, and remove videos in the feed.",
    icon: <path d="M4 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm12 5 5-3v10l-5-3" />,
  },
  {
    id: "history",
    label: "Notification history",
    title: "Notification history",
    subtitle: "Everything you've sent and how many phones got it.",
    icon: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />,
  },
  {
    id: "devices",
    label: "Push devices",
    title: "Push devices",
    subtitle: "Phones that installed Bopz and allowed notifications.",
    icon: <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h2" />,
  },
];

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [section, setSection] = useState<Section>("overview");
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [resetting, setResetting] = useState<"devices" | "history" | null>(null);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as Section;
    if (SECTIONS.some((s) => s.id === fromHash)) setSection(fromHash);
  }, []);

  function go(next: Section) {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
  }

  const refreshDevices = useCallback(async () => {
    const supabase = getSupabase();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [all, active] = await Promise.all([
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).gte("updated_at", weekAgo),
    ]);
    if (all.count !== null) setSubscriberCount(all.count);
    if (active.count !== null) setActiveCount(active.count);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshDevices();
    }, 10_000);
    window.addEventListener("focus", refreshDevices);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshDevices);
    };
  }, [refreshDevices]);

  const refreshLogs = useCallback(async () => {
    const { data } = await getSupabase()
      .from("notifications")
      .select("id,title,body,sent_count,failed_count,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data ?? []) as NotificationLog[]);
  }, []);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    const [vids] = await Promise.all([
      supabase
        .from("videos")
        .select("id,title,description,storage_path,likes_count,created_at,link_url,link_label")
        .order("created_at", { ascending: false })
        .limit(200),
      refreshLogs(),
      refreshDevices(),
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
  }, [refreshDevices, refreshLogs]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function adminPost(path: string) {
    const { data } = await getSupabase().auth.getSession();
    const res = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token ?? session.access_token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Request failed");
    return json;
  }

  async function resetDevices() {
    if (
      !confirm(
        "Reset push devices to 0?\n\nEach device is added back automatically the next time its owner opens the app. Until then, it won't receive notifications."
      )
    )
      return;
    setResetting("devices");
    try {
      await adminPost("/api/admin/reset-devices");
      await refreshDevices();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setResetting(null);
    }
  }

  async function resetHistory() {
    if (!confirm("Delete all notification history? This can't be undone.")) return;
    setResetting("history");
    try {
      await adminPost("/api/admin/reset-history");
      await refreshLogs();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setResetting(null);
    }
  }

  const totalLikes = videos.reduce((sum, v) => sum + v.likes_count, 0);
  const current = SECTIONS.find((s) => s.id === section)!;
  const topVideos = [...videos].sort((a, b) => b.likes_count - a.likes_count).slice(0, 5);
  const badges: Partial<Record<Section, number | null>> = {
    videos: videos.length,
    history: logs.length,
    devices: subscriberCount,
  };

  return (
    <div className="dash">
      <aside className="side">
        <div className="side-brand">
          <img src="/icons/96" alt="" />
          <span>Bopz</span>
          <small>Admin</small>
        </div>
        <nav>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`nav-item${section === s.id ? " active" : ""}`}
              onClick={() => go(s.id)}
            >
              <NavIcon>{s.icon}</NavIcon>
              <span>{s.label}</span>
              {badges[s.id] != null && <span className="nav-badge">{badges[s.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">{session.user.email}</div>
          <button className="nav-item" onClick={() => getSupabase().auth.signOut()}>
            <NavIcon>
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
            </NavIcon>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="page-head">
          <h1>{current.title}</h1>
          <p>{current.subtitle}</p>
        </header>

        {section === "overview" && (
          <>
            <div className="stat-grid">
              <StatCard label="Videos" value={videos.length} />
              <StatCard label="Hearts" value={formatCount(totalLikes)} />
              <StatCard
                label="Push devices"
                value={subscriberCount ?? "–"}
                hint={activeCount !== null ? `${activeCount} opened the app this week` : undefined}
              />
              <StatCard label="Notifications sent" value={logs.length} />
            </div>

            <div className="quick-grid">
              <button className="quick" onClick={() => go("notify")}>
                <b>Send a notification</b>
                <span>Reach every phone with Bopz installed.</span>
              </button>
              <button className="quick" onClick={() => go("videos")}>
                <b>Upload a video</b>
                <span>It goes straight to the top of the feed.</span>
              </button>
            </div>

            <section className="panel">
              <div className="panel-head">
                <h2>Top videos</h2>
                <button className="btn ghost" onClick={() => go("videos")}>
                  View all
                </button>
              </div>
              {topVideos.length === 0 ? (
                <p className="empty">No videos yet.</p>
              ) : (
                <ul className="list">
                  {topVideos.map((v) => (
                    <li key={v.id}>
                      {v.url ? (
                        <video className="thumb sm" src={`${v.url}#t=0.5`} muted playsInline preload="metadata" />
                      ) : (
                        <div className="thumb sm" />
                      )}
                      <div className="grow">
                        <div className="title">{v.title || "Untitled"}</div>
                        <div className="meta">{new Date(v.created_at).toLocaleDateString()}</div>
                      </div>
                      <span className="chip">♥ {formatCount(v.likes_count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {section === "notify" && <SendNotification session={session} onSent={refreshLogs} />}

        {section === "videos" && (
          <>
            <UploadVideo onUploaded={refresh} />
            <section className="panel">
              <div className="panel-head">
                <h2>Library</h2>
                <span className="muted">{videos.length} videos</span>
              </div>
              {videos.length === 0 ? (
                <p className="empty">No videos uploaded yet.</p>
              ) : (
                <ul className="list">
                  {videos.map((v) => (
                    <VideoRow key={v.id} video={v} onChanged={refresh} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {section === "history" && (
          <section className="panel">
            <div className="panel-head">
              <h2>{logs.length} sent</h2>
              <button
                className="btn danger"
                onClick={resetHistory}
                disabled={resetting === "history" || logs.length === 0}
              >
                {resetting === "history" ? "Resetting…" : "Reset history"}
              </button>
            </div>
            {logs.length === 0 ? (
              <p className="empty">Nothing sent yet.</p>
            ) : (
              <ul className="list">
                {logs.map((n) => (
                  <li key={n.id}>
                    <div className="grow">
                      <div className="title">{n.title || n.body}</div>
                      {n.title && n.body && <div className="meta">{n.body}</div>}
                      <div className="meta">{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                    <span className="chip">{n.sent_count} delivered</span>
                    {n.failed_count > 0 && <span className="chip bad">{n.failed_count} failed</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {section === "devices" && (
          <>
            <div className="stat-grid">
              <StatCard label="Push devices" value={subscriberCount ?? "–"} hint="Updates every 10 seconds" />
              <StatCard label="Opened the app this week" value={activeCount ?? "–"} />
            </div>
            <section className="panel">
              <div className="panel-head">
                <h2>Reset count</h2>
                <button className="btn danger" onClick={resetDevices} disabled={resetting === "devices"}>
                  {resetting === "devices" ? "Resetting…" : "Reset to 0"}
                </button>
              </div>
              <p className="sub" style={{ margin: 0 }}>
                Starts the count from zero. Each phone is added back the moment its owner opens Bopz from the home
                screen, so phones that deleted the app never come back. Until a phone is added back, it won&apos;t
                receive notifications.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
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

  // Mirrors the server: a message without a title is sent as the title.
  const previewTitle = title.trim() || body.trim();
  const previewBody = title.trim() ? body.trim() : "";

  return (
    <div className="two-col">
      <form className="panel" onSubmit={submit}>
        <label className="field">
          Title (optional)
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          Message
          <textarea value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="field">
          Open page when tapped
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/" />
        </label>
        <button className="btn accent" type="submit" disabled={busy || (!title.trim() && !body.trim())}>
          {busy ? "Sending…" : "Send to all"}
        </button>
        {status && <p className={`status ${status.kind === "info" ? "" : status.kind}`}>{status.text}</p>}
      </form>

      <div className="panel">
        <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Preview
        </div>
        <div className="preview-screen">
          <div className="preview-note">
            <img src="/icons/96" alt="" />
            <div className="grow">
              <div className="preview-top">
                <b>{previewTitle || "Your message"}</b>
                <span>now</span>
              </div>
              <div className="preview-from">from Bopz</div>
              {previewBody && <div className="preview-body">{previewBody}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadVideo({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [inputKey, setInputKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    const button = validateButton(linkUrl, linkLabel);
    if ("error" in button) {
      setStatus({ kind: "err", text: button.error });
      return;
    }

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
        link_url: button.link_url,
        link_label: button.link_label,
      });
      if (insertError) {
        await supabase.storage.from(VIDEO_BUCKET).remove([path]);
        throw insertError;
      }

      setStatus({ kind: "ok", text: "Uploaded! It's now at the top of the feed." });
      setFile(null);
      setTitle("");
      setDescription("");
      setLinkUrl("");
      setLinkLabel("");
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
      <label className="field">
        Button link (optional)
        <input
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
      </label>
      <label className="field">
        Button text
        <input
          placeholder="e.g. Shop now"
          value={linkLabel}
          maxLength={40}
          onChange={(e) => setLinkLabel(e.target.value)}
        />
      </label>
      <button className="btn accent" type="submit" disabled={busy || !file}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {status && <p className={`status ${status.kind === "info" ? "" : status.kind}`}>{status.text}</p>}
    </form>
  );
}

function VideoRow({ video, onChanged }: { video: AdminVideo; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

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
    onChanged();
  }

  return (
    <li style={{ flexWrap: "wrap" }}>
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
        {video.link_url && (
          <div className="meta">
            Button: “{video.link_label}” →{" "}
            <a href={video.link_url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              {video.link_url}
            </a>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={() => setEditing((v) => !v)} disabled={busy}>
          {editing ? "Close" : "Edit"}
        </button>
        <button className="btn danger" onClick={remove} disabled={busy}>
          {busy ? "…" : "Delete"}
        </button>
      </div>
      {editing && (
        <EditVideo
          video={video}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </li>
  );
}

function EditVideo({ video, onSaved }: { video: AdminVideo; onSaved: () => void }) {
  const [title, setTitle] = useState(video.title ?? "");
  const [description, setDescription] = useState(video.description ?? "");
  const [linkUrl, setLinkUrl] = useState(video.link_url ?? "");
  const [linkLabel, setLinkLabel] = useState(video.link_label ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const button = validateButton(linkUrl, linkLabel);
    if ("error" in button) {
      setStatus({ kind: "err", text: button.error });
      return;
    }

    setBusy(true);
    setStatus(null);
    const { error } = await getSupabase()
      .from("videos")
      .update({
        title: title.trim() || null,
        description: description.trim() || null,
        link_url: button.link_url,
        link_label: button.link_label,
      })
      .eq("id", video.id);
    setBusy(false);
    if (error) {
      setStatus({ kind: "err", text: error.message });
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={save} style={{ width: "100%", paddingTop: 12 }}>
      <label className="field">
        Title
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        Description
        <textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        Button link (leave empty for no button)
        <input
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
      </label>
      <label className="field">
        Button text
        <input
          placeholder="e.g. Shop now"
          value={linkLabel}
          maxLength={40}
          onChange={(e) => setLinkLabel(e.target.value)}
        />
      </label>
      <button className="btn accent" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </form>
  );
}
