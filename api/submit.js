/**
 * Vercel Serverless: POST /api/submit
 * В проекте Vercel задайте переменные:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (только на сервере, не в браузере)
 */
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on Vercel",
    });
  }

  const supabase = createClient(url, key);
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") {
    body = {};
  }

  const ticket_number =
    typeof body.ticket_number === "string" ? body.ticket_number.trim() : "";
  const delay_amount =
    body.delay_amount === undefined || body.delay_amount === null
      ? NaN
      : Number(body.delay_amount);

  if (!ticket_number) {
    return res.status(400).json({ error: "ticket_number обязателен" });
  }
  if (!Number.isFinite(delay_amount) || delay_amount < 0) {
    return res.status(400).json({ error: "delay_amount должно быть неотрицательным числом" });
  }

  const row = {
    ticket_number,
    delay_amount,
  };

  const { data, error } = await supabase.from("demo_events").insert(row).select().single();

  if (error) {
    return res.status(400).json({ error: error.message, details: error });
  }

  return res.status(200).json({ ok: true, row: data });
};
