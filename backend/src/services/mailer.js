'use strict';
const env = require('../config/env');

let nodemailerTransporter = null;
let testEmailHook = null;

function setTestEmailHook(hook) {
  testEmailHook = hook;
}

function getSmtpTransporter() {
  if (nodemailerTransporter) return nodemailerTransporter;
  if (!env.smtpHost) return null;
  const nodemailer = require('nodemailer');
  const isPort587 = env.smtpPort === 587;
  const isSecure = env.smtpSecure || env.smtpPort === 465;

  nodemailerTransporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: isSecure,
    requireTLS: isPort587,
    auth: env.smtpUser && env.smtpPassword ? {
      user: env.smtpUser,
      pass: env.smtpPassword,
    } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return nodemailerTransporter;
}

function getSenderAddress() {
  if (env.emailProvider === 'smtp' && env.smtpUser) {
    if (!env.emailFrom || env.emailFrom.includes('notifications@focusbridge.app')) {
      return `FocusBridge <${env.smtpUser}>`;
    }
  }
  return env.emailFrom;
}

async function verifySmtpConnection() {
  if (env.emailProvider !== 'smtp') {
    return { configured: false, provider: env.emailProvider, message: 'SMTP provider not active in configuration' };
  }
  const transporter = getSmtpTransporter();
  if (!transporter) {
    return { configured: false, error: 'SMTP transporter configuration failed' };
  }
  try {
    await transporter.verify();
    return {
      configured: true,
      connected: true,
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure || env.smtpPort === 465,
      user: env.smtpUser ? `${env.smtpUser.slice(0, 3)}***@${env.smtpUser.split('@')[1] || ''}` : 'none',
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      host: env.smtpHost,
      port: env.smtpPort,
      errorCode: err.code || 'UNKNOWN',
      errorMessage: err.message,
    };
  }
}

/**
 * Base email sending dispatcher supporting:
 * 1. Resend REST API (via native fetch)
 * 2. SMTP (via Nodemailer)
 * 3. Local/Dev console output
 */
async function sendMail({ to, subject, text, html }) {
  if (testEmailHook) {
    try {
      testEmailHook({ to, subject, text, html });
    } catch {
      // test hook errors ignored
    }
  }

  if (!to) {
    return { delivered: false, error: 'Recipient email address missing' };
  }

  const fromAddress = getSenderAddress();

  // 1. Resend REST API provider
  if (env.emailProvider === 'resend' && env.emailApiKey) {
    try {
      console.log(`[mailer:send] provider=resend to=${to} subject="${subject}"`);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: Array.isArray(to) ? to : [to],
          subject,
          text,
          html: html || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[mailer:resend] API error:', data.message || res.statusText);
        return { delivered: false, error: data.message || 'Resend API error' };
      }
      console.log(`[mailer:success] provider=resend id=${data.id}`);
      return { delivered: true, id: data.id, provider: 'resend' };
    } catch (err) {
      console.error('[mailer:resend] Network error:', err.message);
      return { delivered: false, error: err.message };
    }
  }

  // 2. SMTP provider
  if (env.emailProvider === 'smtp' && env.smtpHost) {
    try {
      console.log(`[mailer:send] provider=smtp host=${env.smtpHost}:${env.smtpPort} to=${to} subject="${subject}"`);
      const transporter = getSmtpTransporter();
      if (!transporter) {
        console.error('[mailer:smtp] Transporter initialization failed');
        return { delivered: false, error: 'SMTP transporter configuration failed' };
      }
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text,
        html: html || undefined,
      });
      console.log(`[mailer:success] provider=smtp messageId=${info.messageId}`);
      return { delivered: true, id: info.messageId, provider: 'smtp' };
    } catch (err) {
      console.error(`[mailer:error] provider=smtp code=${err.code || 'UNKNOWN'} responseCode=${err.responseCode || 'N/A'} message=${err.message}`);
      return { delivered: false, error: err.message };
    }
  }

  // 3. Fallback / Local development & test logging
  if (env.isProd) {
    console.warn(`[mailer] No email provider configured; message to ${to} ("${subject}") was not sent.`);
    return { delivered: false, unconfigured: true };
  }

  console.log(`[mailer:dev] to=${to} subject="${subject}"\n${text}\n`);
  return { delivered: false, dev: true };
}

function buildHtmlWrapper(contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FocusBridge</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F5F0; margin: 0; padding: 24px; color: #2D3748; }
    .card { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .brand { font-size: 20px; font-weight: bold; color: #1E3A2F; margin-bottom: 24px; display: inline-block; }
    .btn { display: inline-block; background-color: #1E3A2F; color: #FFFFFF !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .footer { font-size: 13px; color: #718096; margin-top: 28px; border-top: 1px solid #EDF2F7; padding-top: 16px; line-height: 1.5; }
    p { line-height: 1.6; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">FocusBridge</div>
    ${contentHtml}
    <div class="footer">
      This is an automated security and account notification from FocusBridge.<br>
      © ${new Date().getFullYear()} FocusBridge. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Feature 1: Account Creation Confirmation Email
 */
async function sendWelcomeEmail({ to, firstName }) {
  const name = firstName ? firstName.trim() : 'there';
  const signInLink = `${env.appBaseUrl}/login`;
  const subject = 'Welcome to FocusBridge — Your Account Is Ready';

  const text = `Hi ${name},

Welcome to FocusBridge!

Your account has been successfully created. You can now sign in to your workspace and start managing your tasks, schedules, and progress.

We're glad to have you with us.

Sign in to FocusBridge: ${signInLink}

If you did not create this account, please contact our support team.`;

  const html = buildHtmlWrapper(`
    <p>Hi ${name},</p>
    <p><strong>Welcome to FocusBridge!</strong></p>
    <p>Your account has been successfully created. You can now sign in to your workspace and start managing your tasks, schedules, and progress.</p>
    <p>We're glad to have you with us.</p>
    <p><a href="${signInLink}" class="btn">Sign in to FocusBridge</a></p>
    <p style="font-size: 13px; color: #718096;">If you did not create this account, please contact our support team immediately.</p>
  `);

  return sendMail({ to, subject, text, html });
}

/**
 * Feature 2: Successful Sign-In Notification Email
 */
async function sendSignInNotification({ to, firstName, loginDate = new Date() }) {
  const name = firstName ? firstName.trim() : 'there';
  const formattedDateTime = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(loginDate));

  const subject = 'New Sign-In to Your FocusBridge Account';

  const text = `Hi ${name},

Your FocusBridge account was successfully signed in to.

Date and time: ${formattedDateTime}
Application: FocusBridge

If this was you, no action is required.

If you do not recognize this activity, please reset your password immediately and contact support.`;

  const html = buildHtmlWrapper(`
    <p>Hi ${name},</p>
    <p>Your FocusBridge account was successfully signed in to.</p>
    <div style="background: #F7FAFC; border-left: 4px solid #1E3A2F; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <p style="margin: 4px 0;"><strong>Date and time:</strong> ${formattedDateTime}</p>
      <p style="margin: 4px 0;"><strong>Application:</strong> FocusBridge</p>
    </div>
    <p>If this was you, no action is required.</p>
    <p style="color: #C53030; font-size: 14px;">If you do not recognize this activity, please reset your password immediately and contact support.</p>
  `);

  return sendMail({ to, subject, text, html });
}

/**
 * Feature 3: Password Reset Request Email
 */
async function sendPasswordResetEmail({ to, firstName, resetToken }) {
  const name = firstName ? firstName.trim() : 'there';
  // Formats dedicated reset link pointing to /reset-password?token=TOKEN
  const resetLink = `${env.appBaseUrl}/reset-password?token=${resetToken}`;
  const subject = 'Reset Your FocusBridge Password';

  const text = `Hi ${name},

We received a request to reset your FocusBridge password.

Use the secure link below to create a new password:

${resetLink}

This link expires in 30 minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email.`;

  const html = buildHtmlWrapper(`
    <p>Hi ${name},</p>
    <p>We received a request to reset your FocusBridge password.</p>
    <p>Use the secure button below to create a new password:</p>
    <p><a href="${resetLink}" class="btn">Reset Password</a></p>
    <p style="font-size: 13px; color: #4A5568;">Or paste this link into your browser:<br><span style="word-break: break-all; color: #2B6CB0;">${resetLink}</span></p>
    <p style="font-size: 13px; color: #718096;">This link expires in 30 minutes and can only be used once.</p>
    <p style="font-size: 13px; color: #A0AEC0;">If you did not request a password reset, you can safely ignore this email.</p>
  `);

  return sendMail({ to, subject, text, html });
}

/**
 * Feature 4: Password Changed Confirmation Email
 */
async function sendPasswordChangedEmail({ to, firstName }) {
  const name = firstName ? firstName.trim() : 'there';
  const subject = 'Your FocusBridge Password Has Been Changed';

  const text = `Hi ${name},

Your FocusBridge password has been successfully changed.

If you made this change, no further action is required.

If you did not change your password, please contact support immediately.`;

  const html = buildHtmlWrapper(`
    <p>Hi ${name},</p>
    <p><strong>Your FocusBridge password has been successfully changed.</strong></p>
    <p>If you made this change, no further action is required.</p>
    <p style="color: #C53030; font-size: 14px;">If you did not change your password, please contact support immediately.</p>
  `);

  return sendMail({ to, subject, text, html });
}

module.exports = {
  sendMail,
  sendWelcomeEmail,
  sendSignInNotification,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  verifySmtpConnection,
  setTestEmailHook,
};
