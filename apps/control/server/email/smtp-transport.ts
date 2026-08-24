import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SmtpConnectionSettings {
  host: string;
  password: string;
  port: number;
  secure: boolean;
  username: string;
}

export function createSmtpTransport(smtp: SmtpConnectionSettings): Transporter {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.username
      ? {
          auth: {
            user: smtp.username,
            pass: smtp.password,
          },
        }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export async function verifySmtpConnection(
  smtp: SmtpConnectionSettings,
): Promise<void> {
  await createSmtpTransport(smtp).verify();
}
