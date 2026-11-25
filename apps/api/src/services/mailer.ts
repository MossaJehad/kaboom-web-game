import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { getEnv } from "../config/env.js";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  token?: string;
  kind: "VERIFY_EMAIL" | "PASSWORD_RESET";
  sentAt: string;
}

const inMemoryDevOutbox: OutboundEmail[] = [];

export function getDevOutbox(): readonly OutboundEmail[] {
  return inMemoryDevOutbox;
}

export function clearDevOutbox(): void {
  inMemoryDevOutbox.length = 0;
}

export async function sendMail(email: Omit<OutboundEmail, "sentAt">): Promise<void> {
  const env = getEnv();
  const record: OutboundEmail = {
    ...email,
    sentAt: new Date().toISOString(),
  };

  if (env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return;
  }

  // Local development & test outbox (no paid third-party email service needed)
  inMemoryDevOutbox.push(record);
  if (inMemoryDevOutbox.length > 100) {
    inMemoryDevOutbox.shift();
  }

  if (env.NODE_ENV === "development") {
    const outboxDir = path.resolve(process.cwd(), "dev-outbox");
    fs.mkdirSync(outboxDir, { recursive: true });
    const file = path.join(outboxDir, "emails.jsonl");
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  }
}
