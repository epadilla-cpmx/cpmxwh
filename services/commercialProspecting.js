const { google } = require("googleapis");
const crypto = require("crypto");
const { sendMessage } = require("./evolution");
const { isWithinSendingHours } = require("./schedule");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  },
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/cloud-tasks"
  ]
});

const QUEUE = process.env.COMMERCIAL_QUEUE || "commercial-sender";
const QUEUE_LOCATION = process.env.SENDER_QUEUE_LOCATION || process.env.CLOUD_TASKS_LOCATION;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const INSTANCE = process.env.COMMERCIAL_EVOLUTION_INSTANCE || "Erick2";
const TASK_KEY = process.env.COMMERCIAL_TASK_KEY;
const MIN_DELAY_MS = 55 * 1000;
const MAX_DELAY_MS = 65 * 1000;
const MAX_BATCH_SIZE = 35;
const MIN_TYPING_DELAY_MS = 9000;
const MAX_TYPING_DELAY_MS = 15000;
const TZ = "America/Monterrey";

function randomDelayMs() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}
function randomTypingDelayMs() {
  return Math.floor(Math.random() * (MAX_TYPING_DELAY_MS - MIN_TYPING_DELAY_MS + 1)) + MIN_TYPING_DELAY_MS;
}
function localHour() {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}
function localMinute() {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, minute: "2-digit" }).format(new Date()));
}
function getSheetsClient() { return google.sheets({ version: "v4", auth }); }
function getQueueClient() { return auth.getClient(); }

function validateConfig() {
  const missing = [];
  if (!process.env.GOOGLE_CLIENT_EMAIL) missing.push("GOOGLE_CLIENT_EMAIL");
  if (!process.env.GOOGLE_PRIVATE_KEY) missing.push("GOOGLE_PRIVATE_KEY");
  if (!PROJECT_ID) missing.push("GOOGLE_CLOUD_PROJECT");
  if (!QUEUE_LOCATION) missing.push("SENDER_QUEUE_LOCATION");
  if (!CLOUD_RUN_URL) missing.push("CLOUD_RUN_URL");
  if (!SERVICE_ACCOUNT_EMAIL) missing.push("GOOGLE_CLIENT_EMAIL");
  if (!process.env.EVOLUTION_URL) missing.push("EVOLUTION_URL");
  if (!process.env.EVOLUTION_API_KEY) missing.push("EVOLUTION_API_KEY");
  if (!TASK_KEY) missing.push("COMMERCIAL_TASK_KEY");
  if (missing.length) throw new Error("Faltan variables de entorno: " + [...new Set(missing)].join(", "));
}

function validateSheetData(data) {
  if (!data || typeof data.spreadsheetId !== "string" || !data.spreadsheetId.trim()) {
    const error = new Error("Falta spreadsheetId."); error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  if (!/^[a-zA-Z0-9 _-]+$/.test(String(data.sheetName || "").trim())) {
    const error = new Error("Nombre de pestaña inválido."); error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  if (!Array.isArray(data.contacts) || data.contacts.length === 0) {
    const error = new Error("Selecciona al menos un contacto."); error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  if (data.contacts.length > MAX_BATCH_SIZE) {
    const error = new Error("El lote máximo es de 35 contactos."); error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  const seenRows = new Set();
  for (const c of data.contacts) {
    const rowNumber = Number(c.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || !String(c.company || "").trim() || !String(c.phone || "").trim()) {
      const error = new Error("Cada contacto requiere fila, empresa y teléfono. El nombre del contacto es opcional."); error.statusCode = 400; error.publicMessage = error.message; throw error;
    }
    if (seenRows.has(rowNumber)) {
      const error = new Error("La fila " + rowNumber + " aparece más de una vez."); error.statusCode = 400; error.publicMessage = error.message; throw error;
    }
    seenRows.add(rowNumber);
  }
}

function escapedSheet(sheetName) { return "'" + sheetName.replace(/'/g, "''") + "'"; }

async function ensureTrackingColumns(spreadsheetId, sheetName) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId, range: escapedSheet(sheetName) + "!A1:J1"
  });
  const headers = response.data.values?.[0] || [];
  for (const [index, title] of [[8, "Fecha primer mensaje"], [9, "Estado de envío"], [10, "Error de envío"]]) {
    if (!headers[index - 1]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: escapedSheet(sheetName) + "!" + String.fromCharCode(64 + index) + "1",
        valueInputOption: "RAW",
        requestBody: { values: [[title]] }
      });
    }
  }
}

async function updateTracking(spreadsheetId, sheetName, rowNumber, values) {
  const sheets = getSheetsClient();
  const range = escapedSheet(sheetName);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: range + "!H" + rowNumber, values: [[values.date || ""]] },
        { range: range + "!I" + rowNumber, values: [[values.status || ""]] },
        { range: range + "!J" + rowNumber, values: [[values.error || ""]] }
      ]
    }
  });
}

async function enqueueCommercialProspects(data) {
  validateConfig();
  validateSheetData(data);

  const hour = localHour();
  const minute = localMinute();
  const remainingMinutes = (20 - hour) * 60 - minute;
  if (!isWithinSendingHours() || remainingMinutes < data.contacts.length * 5) {
    const error = new Error("Inicia el lote entre las 08:00 y las 20:00 de Monterrey y con tiempo suficiente para terminarlo.");
    error.statusCode = 400; error.publicMessage = error.message; throw error;
  }

  await ensureTrackingColumns(data.spreadsheetId, data.sheetName);
  const sheets = getSheetsClient();
  const client = await getQueueClient();
  const queuePath = `projects/${PROJECT_ID}/locations/${QUEUE_LOCATION}/queues/${QUEUE}`;
  // Validar todas las filas antes de crear la primera tarea para evitar lotes parciales por estados existentes.
  for (const contact of data.contacts) {
    const rowNumber = Number(contact.rowNumber);
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId: data.spreadsheetId,
      range: escapedSheet(data.sheetName) + "!I" + rowNumber + ":I" + rowNumber
    });
    const status = String(current.data.values?.[0]?.[0] || "").trim().toUpperCase();
    if (["EN COLA", "ENVIANDO", "ENVIADO"].includes(status) || status.startsWith("ERROR: VERIFICAR")) {
      throw Object.assign(new Error("La fila " + rowNumber + " ya está procesada o en cola."), {
        statusCode: 409, publicMessage: "La fila " + rowNumber + " ya está procesada o en cola."
      });
    }
  }

  const tasks = [];
  let cumulativeDelayMs = 1000;

  for (const contact of data.contacts) {
    const rowNumber = Number(contact.rowNumber);
    if (tasks.length > 0) cumulativeDelayMs += randomDelayMs();
    const scheduledAt = new Date(Date.now() + cumulativeDelayMs);
    const payload = {
      taskId: crypto.randomUUID(),
      spreadsheetId: data.spreadsheetId,
      sheetName: data.sheetName,
      rowNumber,
      company: String(contact.company).trim(),
      contact: String(contact.contact).trim(),
      phone: String(contact.phone).trim(),
      instance: INSTANCE,
      messageTemplate: String(contact.contact || "").trim() ? "Hola! buenos días disculpa es {contact} de {company}? le escribe Erick Padilla de Coparmex NL" : "Hola! buenos días disculpa es {company}? le escribe Erick Padilla de Coparmex NL"
    };
    const task = {
      httpRequest: {
        httpMethod: "POST",
        url: CLOUD_RUN_URL.replace(/\/$/, "") + "/internal/commercial-send",
        headers: {
          "Content-Type": "application/json",
          "x-commercial-task-key": TASK_KEY
        },
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
        oidcToken: { serviceAccountEmail: SERVICE_ACCOUNT_EMAIL, audience: CLOUD_RUN_URL }
      },
      scheduleTime: scheduledAt.toISOString()
    };
    await client.request({
      url: `https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`,
      method: "POST",
      data: { task }
    });
    await updateTracking(data.spreadsheetId, data.sheetName, rowNumber, { status: "EN COLA", error: "" });
    tasks.push({ rowNumber, scheduledAt: scheduledAt.toISOString() });
  }

  return { queued: tasks.length, instance: INSTANCE, queue: QUEUE, note: "Mensajes puestos en cola de forma gradual." };
}

async function processCommercialTask(payload) {
  const { spreadsheetId, sheetName, rowNumber, company, contact, phone, instance, messageTemplate, taskId } = payload;
  if (!spreadsheetId || !sheetName || !rowNumber || !company || !phone || !instance || !taskId) {
    throw new Error("Payload de tarea comercial incompleto.");
  }
  const sheets = getSheetsClient();
  const range = escapedSheet(sheetName);
  const statusResponse = await sheets.spreadsheets.values.get({
    spreadsheetId, range: range + "!I" + rowNumber + ":I" + rowNumber
  });
  const currentStatus = String(statusResponse.data.values?.[0]?.[0] || "").trim().toUpperCase();
  if (["ENVIADO", "ENVIANDO"].includes(currentStatus) || currentStatus.startsWith("ERROR: VERIFICAR")) {
    return { skipped: true, reason: "already_processed", rowNumber };
  }

  if (!isWithinSendingHours()) {
    await updateTracking(spreadsheetId, sheetName, rowNumber, {
      status: "PENDIENTE: FUERA DE HORARIO", error: "Reprogramar este envío manualmente."
    });
    return { skipped: true, reason: "outside_sending_hours", rowNumber };
  }

  await updateTracking(spreadsheetId, sheetName, rowNumber, { status: "ENVIANDO", error: "" });
  const message = String(messageTemplate)
    .replaceAll("{contact}", String(contact || "").trim())
    .replaceAll("{company}", company);

  try {
    const result = await sendMessage(instance, phone, message, {
      presence: "composing",
      delayMs: randomTypingDelayMs()
    });
    if (!result?.sent) {
      await updateTracking(spreadsheetId, sheetName, rowNumber, {
        status: "ERROR", error: result?.reason || "Evolution no confirmó el envío."
      });
      return { sent: false, rowNumber, reason: result?.reason || "send_failed" };
    }
    const sentAt = new Date().toISOString();
    await updateTracking(spreadsheetId, sheetName, rowNumber, { date: sentAt, status: "ENVIADO", error: "" });
    return { sent: true, rowNumber, sentAt };
  } catch (error) {
    // No lanzar el error después de intentar enviar: un reintento automático podría duplicar el WhatsApp.
    try {
      await updateTracking(spreadsheetId, sheetName, rowNumber, {
        status: "ERROR: VERIFICAR", error: String(error.message || "Resultado de envío incierto; verificar antes de reintentar.").slice(0, 450)
      });
    } catch (trackingError) {
      console.error("No se pudo actualizar el seguimiento; la fila puede permanecer ENVIANDO:", trackingError.message);
    }
    return { sent: false, rowNumber, reason: "send_result_needs_manual_verification" };
  }
}

module.exports = { enqueueCommercialProspects, processCommercialTask };
