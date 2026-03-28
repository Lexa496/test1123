/**
 * Настройки: подставьте URL проекта Supabase и anon key (Settings → API).
 * Таблица по умолчанию — demo_events (см. README.md).
 */
const CONFIG = {
  supabaseUrl: "https://unwodgqmmtvtgvtvqfts.supabase.co",
  supabaseAnonKey: "sb_publishable_ThQtD3xhueLZfA5wpdejKQ_FMvCl5kR",
  tableName: "demo_events",
  vercelApiUrl: "/api/submit",
};

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const logEl = document.getElementById("log");
const form = document.getElementById("data-form");

function log(message, data) {
  const line =
    typeof data !== "undefined"
      ? `${message}\n${JSON.stringify(data, null, 2)}`
      : String(message);
  logEl.textContent = `${new Date().toISOString()}\n${line}\n\n${logEl.textContent}`.slice(
    0,
    8000
  );
}

function setBusy(busy) {
  form.querySelectorAll('button[type="submit"]').forEach((b) => {
    b.disabled = busy;
  });
}

function readPayload(formEl) {
  const fd = new FormData(formEl);
  const ticket_number = String(fd.get("ticket_number") || "").trim();
  const delayRaw = fd.get("delay_amount");
  const delay_amount =
    delayRaw === "" || delayRaw === null ? NaN : Number(String(delayRaw).replace(",", "."));
  if (!ticket_number) {
    throw new Error("Укажите номер билета");
  }
  if (!Number.isFinite(delay_amount) || delay_amount < 0) {
    throw new Error("Укажите неотрицательную сумму задержек");
  }
  return { ticket_number, delay_amount };
}

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

async function insertViaSupabase(payload) {
  const row = {
    ticket_number: payload.ticket_number,
    delay_amount: payload.delay_amount,
  };
  const { data, error } = await supabase.from(CONFIG.tableName).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function postToVercelApi(payload) {
  const url =
    CONFIG.vercelApiUrl.startsWith("http") || CONFIG.vercelApiUrl.startsWith("//")
      ? CONFIG.vercelApiUrl
      : new URL(CONFIG.vercelApiUrl, window.location.origin).href;

  const body = {
    ticket_number: payload.ticket_number,
    delay_amount: payload.delay_amount,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const err = new Error(`Vercel API ${res.status}`);
    err.detail = parsed;
    throw err;
  }
  return parsed;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const action = e.submitter?.getAttribute("value") || "vercel";
  setBusy(true);
  try {
    const payload = readPayload(form);
    if (action === "supabase") {
      const data = await insertViaSupabase(payload);
      log("Supabase OK", data);
    } else if (action === "vercel") {
      const data = await postToVercelApi(payload);
      log("API OK", data);
    } else if (action === "both") {
      const api = await postToVercelApi(payload);
      log("Шаг 1: API", api);
      const row = await insertViaSupabase(payload);
      log("Шаг 2: Supabase", row);
    }
  } catch (err) {
    log("Ошибка", { message: err.message, detail: err.detail ?? err });
  } finally {
    setBusy(false);
  }
});
