/**
 * Настройки: подставьте URL проекта Supabase и anon key (Settings → API).
 * Таблица по умолчанию — demo_events (см. README.md).
 */
const CONFIG = {
  supabaseUrl: "https://unwodgqmmtvtgvtvqfts.supabase.co",
  supabaseAnonKey: "sb_publishable_ThQtD3xhueLZfA5wpdejKQ_FMvCl5kR",
  tableName: "demo_events",
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

async function insertRow(payload) {
  const row = {
    ticket_number: payload.ticket_number,
    delay_amount: payload.delay_amount,
  };
  const { data, error } = await supabase.from(CONFIG.tableName).insert(row).select().single();
  if (error) throw error;
  return data;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setBusy(true);
  try {
    const payload = readPayload(form);
    const data = await insertRow(payload);
    log("Записано в Supabase", data);
  } catch (err) {
    log("Ошибка", { message: err.message, detail: err.detail ?? err });
  } finally {
    setBusy(false);
  }
});
