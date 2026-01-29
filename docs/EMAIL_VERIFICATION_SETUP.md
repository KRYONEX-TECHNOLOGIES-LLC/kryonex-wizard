# Email verification & password reset setup (Supabase)

Confirmation emails and password reset links are sent by **Supabase Auth**. If users never receive them, it’s almost always due to Supabase project configuration, not app code.

## 1. SMTP (required for reliable delivery)

By default Supabase uses its own sender, which can be unreliable or blocked. For production you should use **custom SMTP**.

1. In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Project Settings** → **Auth**.
2. Open **SMTP Settings**.
3. Enable **Custom SMTP** and set:
   - **Sender email** – address that sends the emails (e.g. `noreply@yourdomain.com`).
   - **Sender name** – e.g. your app name.
   - **Host** – your SMTP server (e.g. Gmail, SendGrid, Resend, Mailgun).
   - **Port** – usually 587 (TLS) or 465 (SSL).
   - **Username / Password** – SMTP credentials.

Without custom SMTP, emails may not be delivered or may go to spam.

## 2. Redirect URLs (required for links to work)

Confirmation and password-reset links must redirect to URLs that Supabase allows.

1. In Dashboard → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add:
   - Production: `https://yourdomain.com/login` (and any other paths you use, e.g. `/login?reason=...`).
   - Local: `http://localhost:5173/login` (or your dev port).

If your login URL isn’t listed, the link will open Supabase’s default page instead of your app.

## 3. Confirm email (Auth provider)

1. In Dashboard → **Authentication** → **Providers** → **Email**.
2. Ensure **Confirm email** is enabled if you want users to confirm before signing in.

## In the app

- **Sign up**: `supabase.auth.signUp()` sends the confirmation email (when Confirm email is on). The app uses `emailRedirectTo: origin + '/login'`.
- **Resend**: If the user sees “Email not confirmed”, they can use **Resend confirmation email** on the login page; the app calls `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`.
- **Password reset**: “Forgot Password” uses `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/login' })`. After clicking the link, the user sets a new password on the login page.

If emails still don’t arrive after configuring SMTP and redirect URLs, check the Supabase **Auth** → **Logs** (or your SMTP provider logs) for send errors.
