# Supabase Auth – Production (verify email + password reset)

For **email verification** and **password reset** to work in production, configure Supabase as follows.

## 1. Redirect URLs

In **Supabase Dashboard** → your project → **Authentication** → **URL Configuration**:

- **Site URL**: Your production app URL (e.g. `https://yourapp.com`).
- **Redirect URLs**: Add every URL where users can land after clicking email links:
  - `https://yourapp.com/login` (confirm email + password reset)
  - `http://localhost:5173/login` (if you test locally)

Without these, Supabase will block redirects and users will see “Invalid redirect URL” or links won’t work.

## 2. SMTP (so emails are actually sent)

Supabase’s built-in email is limited and often doesn’t deliver in production. Use your own SMTP:

1. **Supabase Dashboard** → **Project Settings** (gear) → **Auth**.
2. Under **SMTP Settings**, enable **Custom SMTP**.
3. Fill in your provider (e.g. Resend, SendGrid, Gmail, Postmark):
   - **Sender email**: e.g. `noreply@yourdomain.com`
   - **Sender name**: e.g. `Your App`
   - **Host, port, user, password**: from your SMTP provider

After saving, **confirm email** and **password reset** emails will be sent through your SMTP.

## 3. Confirm email (optional but recommended)

In **Authentication** → **Providers** → **Email**:

- **Confirm email**: ON so new signups must click the link in the email before they can sign in.
- With SMTP configured (step 2), that email will be sent and deliver reliably.

## 4. App behavior (already implemented)

- **Sign up**: User gets “Check your email to confirm your account.” After they click the link they land on `/login` and can sign in.
- **Forgot password**: User enters email, gets “Check your email for the reset link.” They click the link, land on `/login`, and see **Set new password** (new password + confirm). After submitting, password is updated and they’re signed in.
