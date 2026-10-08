# Bopz

A TikTok-style video PWA. Visitors must add the app to their home screen, then tap one button to create an anonymous account before they can swipe through videos and heart them. There are no creators: a single admin uploads videos and sends push notifications to everyone who installed the app.

- **Next.js** (App Router), deployed on **Vercel**
- **Supabase**: anonymous auth, Postgres (videos, hearts, push subscriptions), and a private Storage bucket for video files
- **Web Push** (VAPID) for admin notifications. Works on Android and on iOS 16.4+ when the app is opened from the home screen.

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the tables, security policies, like counter, and the private `videos` storage bucket.
3. Go to **Authentication → Sign In / Providers** and turn on **Allow anonymous sign-ins**.
4. Create your admin account in **Authentication → Users → Add user → Create new user** (email + password, check "Auto confirm").
5. Make that user an admin. In the SQL editor run:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

6. (Optional) Raise the upload size limit in **Storage → Settings** if your videos are larger than the default.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon / publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role / secret key). Server only. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Run `npm run vapid` |
| `VAPID_PRIVATE_KEY` | Run `npm run vapid` |
| `VAPID_SUBJECT` | `mailto:` with your email |

Generate the VAPID keys once and keep them. If you change them later, every existing subscriber has to re-subscribe.

## 3. Run locally

```bash
npm install
npm run dev
```

- `http://localhost:3000` is the visitor app. In dev mode the "add to home screen" requirement is skipped so you can test in a normal tab.
- `http://localhost:3000/admin` is the admin dashboard.

## 4. Push to GitHub

```bash
git remote add origin https://github.com/<you>/bopz.git
git push -u origin main
```

## 5. Deploy on Vercel

1. In Vercel, click **Add New → Project** and import the GitHub repo. The framework is detected as Next.js automatically.
2. Under **Environment Variables**, add all six variables from step 2.
3. Click **Deploy**.
4. In Supabase → **Authentication → URL Configuration**, set the **Site URL** to your Vercel domain.

## How it works

**Visitors**

1. Opening the site in a browser shows only install instructions: the Share → Add to Home Screen steps on iOS, or a one-tap install button on Android/Chrome.
2. Launching from the home screen shows a single **Start Watching** button. It asks for notification permission and creates an anonymous Supabase account.
3. The feed is a full-screen vertical swiper. Tap to unmute or pause, double-tap or press the heart to like, and scroll to load more.

**Admin** (`/admin`, use a regular browser)

- Upload videos (stored in the private `videos` bucket). Visitors only get short-lived signed URLs.
- Delete videos and see the heart count for each one.
- Send a notification with a title, a message, and an optional in-app path to open when it's tapped. It goes to every subscribed device, and expired subscriptions are cleaned up automatically.

## Notes

- **iOS:** push notifications require iOS 16.4+ and only work when the app is launched from the home screen. Home-screen apps on iOS have storage separate from Safari, so the anonymous account lives inside the installed app.
- **Uploads** go straight from the admin's browser to Supabase Storage, so Vercel's request size limit doesn't apply. Vertical H.264 MP4 plays most reliably on every device.
- The standalone check is enforced in the UI. Database access requires a signed-in session, and storage access requires signed URLs.
