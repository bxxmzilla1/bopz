// Creates (or updates) an email/password user and grants admin access.
// Usage: npm run create-admin -- <email> <password>
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: npm run create-admin -- <email> <password>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || /YOUR-PROJECT|your-/.test(url + key)) {
  console.error("Fill in NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserByEmail(target) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

let user;
const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  const existing = await findUserByEmail(email);
  if (!existing) {
    console.error("Could not create user:", created.error.message);
    process.exit(1);
  }
  const updated = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (updated.error) {
    console.error("User exists but updating the password failed:", updated.error.message);
    process.exit(1);
  }
  user = updated.data.user;
  console.log(`User ${email} already existed; password updated.`);
} else {
  user = created.data.user;
  console.log(`Created user ${email}.`);
}

const { error: adminError } = await supabase.from("admins").upsert({ user_id: user.id }, { onConflict: "user_id" });
if (adminError) {
  console.error("Could not grant admin:", adminError.message);
  console.error("Make sure you ran supabase/schema.sql in the Supabase SQL editor.");
  process.exit(1);
}

console.log(`${email} is now an admin. Sign in at /admin.`);
