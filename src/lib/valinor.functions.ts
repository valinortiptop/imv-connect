import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  sendEmail,
  openaiChat,
  getValinorUsage,
} from "./valinor-proxy.server";

/** Enviar email transaccional vía Resend (cuenta de Valinor). */
export const sendEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: z.string().min(3),
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string().min(1).max(255),
        html: z.string().optional(),
        text: z.string().optional(),
        reply_to: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return sendEmail(data);
  });

/** Chat completion (OpenAI por Valinor). */
export const aiChatFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        model: z.string().default("gpt-4o-mini"),
        messages: z.array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string().min(1),
          }),
        ).min(1).max(50),
        temperature: z.number().min(0).max(2).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return openaiChat(data);
  });

/** Reporte de uso de APIs (lo lee desde Valinor). */
export const getUsageReportFn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    return getValinorUsage(data);
  });
