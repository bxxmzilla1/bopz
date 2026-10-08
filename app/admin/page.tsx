"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, VIDEO_BUCKET } from "@/lib/supabase";
import { formatCount } from "@/lib/device";
import { COUNTRY_CODES, countryFlag, countryName } from "@/lib/countries";
import { captureThumbnail, thumbPathFor, uploadThumbnail } from "@/lib/thumbnail";

type AdminVideo = {
  id: string;
  title: string | null;
  description: string | null;
  storage_path: string;
  likes_count: number;
  created_at: string;
  link_url: string | null;
  link_label: string | null;
  thumb_path?: string | null;
  url?: string;
  thumb_url?: string;
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

const MAX_HEARTS = 2_000_000_000;

/** Parses the hearts input; returns null if it isn't a whole number in range. */
function parseHearts(input: string): number | null {
  const raw = input.trim().replace(/[,\s]/g, "");
  if (raw === "") return 0;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_HEARTS ? n : null;
}

function HeartsField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      {label}
      <input type="number" inputMode="numeric" min={0} max={MAX_HEARTS} step={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
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

type Section = "overview" | "notify" | "upload" | "library" | "history" | "devices" | "countries";

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
    id: "upload",
    label: "Upload video",
    title: "Upload video",
    subtitle: "New videos go straight to the top of the feed.",
    icon: <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  },
  {
    id: "library",
    label: "All videos",
    title: "All videos",
    subtitle: "Preview, edit, or remove any video.",
    icon: <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />,
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
    label: "Device locations",
    title: "Device locations",
    subtitle: "IP address and location of every phone with notifications on.",
    icon: <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  },
  {
    id: "countries",
    label: "Allowed countries",
    title: "Allowed countries",
    subtitle: "Choose which countries can open Bopz.",
    icon: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />,
  },
];

type ResetTarget = "devices" | "history" | "clicks";

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
  const [clickCount, setClickCount] = useState<number | null>(null);
  const [resetting, setResetting] = useState<ResetTarget[]>([]);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as Section;
    if (SECTIONS.some((s) => s.id === fromHash)) setSection(fromHash);
  }, []);

  function go(next: Section) {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
  }

  const refreshCounts = useCallback(async () => {
    const supabase = getSupabase();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [all, active, clicks] = await Promise.all([
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).gte("updated_at", weekAgo),
      supabase.from("link_clicks").select("id", { count: "exact", head: true }),
    ]);
    if (all.count !== null) setSubscriberCount(all.count);
    if (active.count !== null) setActiveCount(active.count);
    if (clicks.count !== null) setClickCount(clicks.count);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshCounts();
    }, 10_000);
    window.addEventListener("focus", refreshCounts);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshCounts);
    };
  }, [refreshCounts]);

  const refreshLogs = useCallback(async () => {
    const { data } = await getSupabase()
      .from("notifications")
      .select("id,title,body,sent_count,failed_count,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data ?? []) as NotificationLog[]);
  }, []);

  const refreshVideos = useCallback(async () => {
    const supabase = getSupabase();
    // "*" keeps this working whether or not newer columns (like thumb_path) exist yet.
    const { data } = await supabase.from("videos").select("*").order("created_at", { ascending: false }).limit(1000);
    const rows = (data ?? []) as AdminVideo[];

    // Signing only creates links; nothing is downloaded until a thumbnail or preview is shown.
    const sign = async (paths: string[]) => {
      const out: (string | undefined)[] = [];
      for (let i = 0; i < paths.length; i += 100) {
        const { data: signed } = await supabase.storage
          .from(VIDEO_BUCKET)
          .createSignedUrls(paths.slice(i, i + 100), 60 * 60 * 2);
        paths.slice(i, i + 100).forEach((_, j) => out.push(signed?.[j]?.signedUrl ?? undefined));
      }
      return out;
    };
    const withThumb = rows.filter((r) => r.thumb_path);
    const [videoUrls, thumbUrls] = await Promise.all([
      sign(rows.map((r) => r.storage_path)),
      sign(withThumb.map((r) => r.thumb_path!)),
    ]);
    rows.forEach((r, i) => (r.url = videoUrls[i]));
    withThumb.forEach((r, i) => (r.thumb_url = thumbUrls[i]));
    setVideos(rows);
  }, []);

  useEffect(() => {
    refreshVideos();
    refreshLogs();
    refreshCounts();
  }, [refreshVideos, refreshLogs, refreshCounts]);

  async function reset(targets: ResetTarget[]) {
    setResetting(targets);
    try {
      const { data } = await getSupabase().auth.getSession();
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? session.access_token}`,
        },
        body: JSON.stringify({ targets }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reset failed");
      await Promise.all([refreshCounts(), refreshLogs()]);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setResetting([]);
    }
  }

  const current = SECTIONS.find((s) => s.id === section)!;
  const badges: Partial<Record<Section, number | null>> = {
    library: videos.length,
    history: logs.length,
    devices: subscriberCount,
  };
  const isResetting = (t: ResetTarget) => resetting.includes(t);

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
          <div>
            <h1>{current.title}</h1>
            <p>{current.subtitle}</p>
          </div>
          {section === "overview" && (
            <button
              className="btn danger"
              onClick={() => reset(["devices", "history", "clicks"])}
              disabled={resetting.length > 0}
            >
              {resetting.length === 3 ? "Resetting…" : "Reset all"}
            </button>
          )}
        </header>

        {section === "overview" && (
          <>
            <div className="stat-grid">
              <StatCard label="Videos" value={videos.length} />
              <StatCard
                label="Push devices"
                value={subscriberCount ?? "–"}
                hint={activeCount !== null ? `${activeCount} opened the app this week` : undefined}
                onReset={() => reset(["devices"])}
                resetting={isResetting("devices")}
              />
              <StatCard
                label="Notifications sent"
                value={logs.length}
                onReset={() => reset(["history"])}
                resetting={isResetting("history")}
              />
              <StatCard
                label="Link Clicks"
                value={clickCount ?? "–"}
                onReset={() => reset(["clicks"])}
                resetting={isResetting("clicks")}
              />
            </div>

            <div className="quick-grid">
              <button className="quick" onClick={() => go("notify")}>
                <b>Send a notification</b>
                <span>Reach every phone with Bopz installed.</span>
              </button>
              <button className="quick" onClick={() => go("upload")}>
                <b>Upload a video</b>
                <span>It goes straight to the top of the feed.</span>
              </button>
            </div>
          </>
        )}

        {section === "notify" && <SendNotification session={session} onSent={refreshLogs} />}

        {section === "upload" && <UploadVideo onUploaded={refreshVideos} />}

        {section === "library" && <VideoLibrary videos={videos} onChanged={refreshVideos} />}

        {section === "devices" && <DeviceLocations />}

        {section === "countries" && <AllowedCountries />}

        {section === "history" && (
          <section className="panel">
            <div className="panel-head">
              <h2>{logs.length} sent</h2>
              <button
                className="btn danger"
                onClick={() => reset(["history"])}
                disabled={isResetting("history") || logs.length === 0}
              >
                {isResetting("history") ? "Resetting…" : "Reset history"}
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
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  onReset,
  resetting,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  onReset?: () => void;
  resetting?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <div className="label">{label}</div>
        {onReset && (
          <button className="stat-reset" onClick={onReset} disabled={resetting}>
            {resetting ? "Resetting…" : "Reset"}
          </button>
        )}
      </div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

type DeviceRow = {
  id: string;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
};

function deviceName(ua: string | null): string {
  if (!ua) return "Unknown";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Other";
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function DeviceLocations() {
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase()
      .from("push_subscriptions")
      .select("id,ip,city,region,country,user_agent,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) {
      setError(
        /column/i.test(error.message)
          ? "The database isn't set up to store locations yet. Run the device location SQL in Supabase."
          : error.message
      );
      setRows([]);
      return;
    }
    setError(null);
    setRows((data ?? []) as DeviceRow[]);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (rows === null) {
    return (
      <section className="panel">
        <p className="empty">Loading…</p>
      </section>
    );
  }

  const byCountry = new Map<string, number>();
  rows.forEach((r) => byCountry.set(r.country ?? "", (byCountry.get(r.country ?? "") ?? 0) + 1));
  const summary = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      {error && <p className="status err" style={{ marginTop: 0 }}>{error}</p>}

      {summary.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>By country</h2>
          </div>
          <div className="country-list">
            {summary.map(([code, count]) => (
              <span key={code || "unknown"} className="country-chip">
                {code ? `${countryFlag(code)} ${countryName(code)}` : "Location pending"}
                <b>{count}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>{rows.length} devices</h2>
          <span className="muted">Updates every 10 seconds</span>
        </div>
        {rows.length === 0 ? (
          <p className="empty">No devices yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>IP address</th>
                  <th>Device</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.country ? (
                        <>
                          <span className="flag">{countryFlag(r.country)}</span>
                          {[r.city, r.region].filter(Boolean).join(", ") || countryName(r.country)}
                          <div className="sub-cell">{countryName(r.country)}</div>
                        </>
                      ) : (
                        <span className="muted">Pending until the app is opened</span>
                      )}
                    </td>
                    <td className="mono">{r.ip ?? "–"}</td>
                    <td>{deviceName(r.user_agent)}</td>
                    <td title={new Date(r.updated_at).toLocaleString()}>{timeAgo(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AllowedCountries() {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pick, setPick] = useState("");
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().from("allowed_countries").select("code");
    if (error) {
      setError(
        /allowed_countries/i.test(error.message)
          ? "The database isn't set up for country rules yet. Run the allowed countries SQL in Supabase."
          : error.message
      );
      setCodes([]);
      return;
    }
    setError(null);
    setCodes((data ?? []).map((r) => r.code as string));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/admin/whereami")
      .then((r) => r.json())
      .then((j) => setMine(j.country ?? null))
      .catch(() => {});
  }, [load]);

  async function add(code: string) {
    if (!code) return;
    setBusy(true);
    const { error } = await getSupabase().from("allowed_countries").insert({ code });
    if (error && error.code !== "23505") setError(error.message);
    setPick("");
    await load();
    setBusy(false);
  }

  async function remove(code: string) {
    setBusy(true);
    const { error } = await getSupabase().from("allowed_countries").delete().eq("code", code);
    if (error) setError(error.message);
    await load();
    setBusy(false);
  }

  if (codes === null) {
    return (
      <section className="panel">
        <p className="empty">Loading…</p>
      </section>
    );
  }

  const sorted = [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const options = COUNTRY_CODES.filter((c) => !codes.includes(c)).sort((a, b) =>
    countryName(a).localeCompare(countryName(b))
  );

  return (
    <>
      {error && <p className="status err" style={{ marginTop: 0 }}>{error}</p>}

      <section className="panel">
        <div className="panel-head">
          <h2>{codes.length === 0 ? "Open to everyone" : `${codes.length} allowed ${codes.length === 1 ? "country" : "countries"}`}</h2>
        </div>
        <p className="sub">
          {codes.length === 0
            ? "Anyone in any country can open Bopz. Add a country to allow only the countries on this list."
            : "Only visitors in these countries can open Bopz. Everyone else sees a “Not available in your country” page. The admin dashboard always works."}
        </p>

        {mine && codes.length > 0 && !codes.includes(mine) && (
          <p className="warn">
            You&apos;re in {countryFlag(mine)} {countryName(mine)}, which isn&apos;t on the list, so you can&apos;t open the
            app from here.
          </p>
        )}

        <div className="add-row">
          <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy}>
            <option value="">Choose a country…</option>
            {options.map((c) => (
              <option key={c} value={c}>
                {countryFlag(c)} {countryName(c)}
              </option>
            ))}
          </select>
          <button className="btn accent" onClick={() => add(pick)} disabled={busy || !pick}>
            Add
          </button>
          {mine && !codes.includes(mine) && (
            <button className="btn" onClick={() => add(mine)} disabled={busy}>
              Add my country ({countryFlag(mine)} {countryName(mine)})
            </button>
          )}
        </div>

        {sorted.length > 0 && (
          <div className="country-list" style={{ marginTop: 18 }}>
            {sorted.map((c) => (
              <span key={c} className="country-chip">
                {countryFlag(c)} {countryName(c)}
                <button onClick={() => remove(c)} disabled={busy} aria-label={`Remove ${countryName(c)}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
    </>
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
  const [hearts, setHearts] = useState("0");
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
    const likesCount = parseHearts(hearts);
    if (likesCount === null) {
      setStatus({ kind: "err", text: "Hearts must be a whole number of 0 or more." });
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

      // The thumbnail comes from the local file, so it costs no extra download.
      setStatus({ kind: "info", text: "Creating thumbnail…" });
      const localUrl = URL.createObjectURL(file);
      const thumb = await captureThumbnail(localUrl);
      URL.revokeObjectURL(localUrl);
      const thumbPath = thumbPathFor(path);
      const hasThumb = !!thumb && (await uploadThumbnail(thumbPath, thumb));

      const row: Record<string, string | number | null> = {
        storage_path: path,
        title: title.trim() || null,
        description: description.trim() || null,
        link_url: button.link_url,
        link_label: button.link_label,
        likes_count: likesCount,
      };
      let { error: insertError } = await supabase
        .from("videos")
        .insert(hasThumb ? { ...row, thumb_path: thumbPath } : row);
      if (insertError && hasThumb && /thumb_path/.test(insertError.message)) {
        ({ error: insertError } = await supabase.from("videos").insert(row));
      }
      if (insertError) {
        await supabase.storage.from(VIDEO_BUCKET).remove(hasThumb ? [path, thumbPath] : [path]);
        throw insertError;
      }

      setStatus({ kind: "ok", text: "Uploaded! It's now at the top of the feed." });
      setFile(null);
      setTitle("");
      setDescription("");
      setLinkUrl("");
      setLinkLabel("");
      setHearts("0");
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
      <HeartsField label="Starting hearts" value={hearts} onChange={setHearts} />
      <button className="btn accent" type="submit" disabled={busy || !file}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {status && <p className={`status ${status.kind === "info" ? "" : status.kind}`}>{status.text}</p>}
    </form>
  );
}

const PER_PAGE = 16;

function VideoLibrary({ videos, onChanged }: { videos: AdminVideo[]; onChanged: () => void }) {
  const [page, setPage] = useState(0);
  const [previewing, setPreviewing] = useState<AdminVideo | null>(null);
  const [editing, setEditing] = useState<AdminVideo | null>(null);
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});
  const attempted = useRef<Set<string>>(new Set());
  const backfillBlocked = useRef(false);

  const pages = Math.max(1, Math.ceil(videos.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const shown = videos.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  // Videos uploaded before thumbnails existed get one made once, one at a time,
  // and saved so they never need the video downloaded for the grid again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const v of shown) {
        if (cancelled || backfillBlocked.current) return;
        if (v.thumb_url || !v.url || attempted.current.has(v.id)) continue;
        attempted.current.add(v.id);

        const blob = await captureThumbnail(v.url, { crossOrigin: true });
        if (!blob || cancelled) continue;
        const path = thumbPathFor(v.storage_path);
        if (!(await uploadThumbnail(path, blob))) continue;
        const { error } = await getSupabase().from("videos").update({ thumb_path: path }).eq("id", v.id);
        if (error) backfillBlocked.current = true;
        const objectUrl = URL.createObjectURL(blob);
        setLocalThumbs((t) => ({ ...t, [v.id]: objectUrl }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, videos]);

  if (videos.length === 0) {
    return (
      <section className="panel">
        <p className="empty">No videos uploaded yet.</p>
      </section>
    );
  }

  return (
    <>
      <div className="vgrid">
        {shown.map((v) => (
          <VideoTile
            key={v.id}
            video={v}
            thumbUrl={v.thumb_url ?? localThumbs[v.id]}
            onPreview={() => setPreviewing(v)}
            onEdit={() => setEditing(v)}
            onDeleted={onChanged}
          />
        ))}
      </div>

      {pages > 1 && (
        <div className="pager">
          <button className="btn" onClick={() => setPage(current - 1)} disabled={current === 0}>
            Previous
          </button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} className={`btn page${i === current ? " on" : ""}`} onClick={() => setPage(i)}>
              {i + 1}
            </button>
          ))}
          <button className="btn" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
            Next
          </button>
        </div>
      )}

        {previewing && (
        <Modal onClose={() => setPreviewing(null)}>
          <video
            className="preview-video"
            src={previewing.url}
            poster={previewing.thumb_url ?? localThumbs[previewing.id]}
            controls
            autoPlay
            playsInline
          />
          <div className="modal-caption">{previewing.title || "Untitled"}</div>
        </Modal>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} wide>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Edit video</h2>
          <EditVideo
            video={editing}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function VideoTile({
  video,
  thumbUrl,
  onPreview,
  onEdit,
  onDeleted,
}: {
  video: AdminVideo;
  thumbUrl?: string;
  onPreview: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const supabase = getSupabase();
    const { error } = await supabase.from("videos").delete().eq("id", video.id);
    if (error) {
      alert(error.message);
      setBusy(false);
      return;
    }
    await supabase.storage
      .from(VIDEO_BUCKET)
      .remove(video.thumb_path ? [video.storage_path, video.thumb_path] : [video.storage_path]);
    onDeleted();
  }

  return (
    <div className="vtile">
      <button className="vthumb" onClick={onPreview} aria-label="Preview">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="vpending">
            <span className="spinner" />
          </span>
        )}
        <span className="vplay">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
          </svg>
        </span>
        <span className="vhearts">♥ {formatCount(video.likes_count)}</span>
      </button>
      <div className="vbody">
        <div className="vtitle">{video.title || "Untitled"}</div>
        <div className="vmeta">{new Date(video.created_at).toLocaleDateString()}</div>
        {video.link_url && (
          <div className="vmeta" title={video.link_url}>
            Button: {video.link_label}
          </div>
        )}
      </div>
      <div className="vactions">
        <button className="btn" onClick={onPreview}>
          Preview
        </button>
        <button className="btn" onClick={onEdit}>
          Edit
        </button>
        <button className="btn danger" onClick={remove} disabled={busy}>
          {busy ? "…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function EditVideo({ video, onSaved }: { video: AdminVideo; onSaved: () => void }) {
  const [title, setTitle] = useState(video.title ?? "");
  const [description, setDescription] = useState(video.description ?? "");
  const [linkUrl, setLinkUrl] = useState(video.link_url ?? "");
  const [linkLabel, setLinkLabel] = useState(video.link_label ?? "");
  const [hearts, setHearts] = useState(String(video.likes_count));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const button = validateButton(linkUrl, linkLabel);
    if ("error" in button) {
      setStatus({ kind: "err", text: button.error });
      return;
    }
    const likesCount = parseHearts(hearts);
    if (likesCount === null) {
      setStatus({ kind: "err", text: "Hearts must be a whole number of 0 or more." });
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
        likes_count: likesCount,
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
      <HeartsField label="Hearts" value={hearts} onChange={setHearts} />
      <button className="btn accent" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </form>
  );
}
