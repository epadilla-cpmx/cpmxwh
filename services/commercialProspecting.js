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

const DEFAULT_QUEUE = process.env.COMMERCIAL_QUEUE || "commercial-sender";
const QUEUE_LOCATION = process.env.SENDER_QUEUE_LOCATION || process.env.CLOUD_TASKS_LOCATION;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const INSTANCE = process.env.COMMERCIAL_EVOLUTION_INSTANCE || "comercial";
const MIN_DELAY_MS = 2 * 60 * 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;
const MAX_BATCH_SIZE = 10;
const TZ = "America/Monterrey";

function randomDelayMs() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

function localHour() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "2-digit", hourCycle: "h23"
  }).format(new Date()));
}

function localMinute() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, minute: "2-digit"
  }).format(new Date()));
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth });
}

function getQueueClient() {
  return auth.getClient();
}

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
  if (missing.length) throw new Error("Faltan variables de entorno: " + [...new Set(missing)].join(", "));
}

function validateSheetData(data) {
  if (!data || typeof data.spreadsheetId !== "string" || !data.spreadsheetId.trim()) {
    const error = new Error("Falta spreadsheetId.");
    error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(String(data.sheetName || ""))) {
    const error = new Error("Nombre de pestaña inválido.");
    error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  if (!Array.isArray(data.contacts) || data.contacts.length === 0) {
    const error = new Error("Selecciona al menos un contacto.");
    error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  if (data.contacts.length > MAX_BATCH_SIZE) {
    const error = new Error("El lote máximo inicial es de 10 contactos.");
    error.statusCode = 400; error.publicMessage = error.message; throw error;
  }
  for (const c of data.contacts) {
    if (!Number.isInteger(Number(c.rowNumber)) || Number(c.rowNumber) < 2 || !c.company || !c.contact || !c.phone) {
      const error = new Error("Cada contacto requiere fila, empresa, contacto y teléfono.");
      error.statusCode = 400; error.publicMessage = error.message; throw error;
    }
  }
}

async function ensureTrackingColumns(spreadsheetId, sheetName) {
  const sheets = getSheetsClient();
  const range = "'" + sheetName.replace(/'/g, "''") + "'!A1:J1";
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const headers = response.data.values?.[0] || [];
  const needed = [
    [8, "Fecha primer mensaje"],
    [9, "Estado de envío"],
    [10, "Error de envío"]
  ];
  for (const [index, title] of needed) {
    if (!headers[index - 1]) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'" + sheetName.replace(/'/g, "''") + "'!" + String.fromCharCode(64 + index) + "1",
        valueInputOption: "RAW",
        requestBody: { values: [[title]] }
      });
    }
  }
}

async function updateTracking(spreadsheetId, sheetName, rowNumber, values) {
  const sheets = getSheetsClient();
  const escapedName = "'" + sheetName.replace(/'/g, "''") + "'";
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: escapedName + "!H" + rowNumber, values: [[values.date || ""]] },
        { range: escapedName + "!I" + rowNumber, values: [[values.status || ""]] },
        { range: escapedName + "!J" + rowNumber, values: [[values.error || ""]] }
      ]
    }
  });
}

async function enqueueCommercialProspects(data) {
  validateConfig();
  validateSheetData(data);

  // Restrict manual campaign starts to the configured 08:00–20:00 window.
  const hour = localHour();
  const minute = localMinute();
  const remainingMinutes = (20 - hour) * 60 - minute;
  const requiredMinutes = data.contacts.length * 5;
  if (!isWithinSendingHours() || remainingMinutes < requiredMinutes) {
    const error = new Error("Inicia el lote entre las 08:00 y las 20:00 de Monterrey y con tiempo suficiente para terminarlo.");
    error.statusCode = 400; error.publicMessage = error.message; throw error;
  }

  await ensureTrackingColumns(data.spreadsheetId, data.sheetName);
  const client = await getQueueClient();
  const queuePath = `projects/${PROJECT_ID}/locations/${QUEUE_LOCATION}/queues/${DEFAULT_QUEUE}`;
  const tasks = [];

  for (let i = 0; i < data.contacts.length; i++) {
    const contact = data.contacts[i];
    const rowNumber = Number(contact.rowNumber);
    const scheduledAt = new Date(Date.now() + (i === 0 ? 1000 : tasks[tasks.length - 1].delayMs + randomDelayMs()));
    const delayMs = scheduledAt.getTime() - Date.now();
    const payload = {
      taskId: crypto.randomUUID(),
      spreadsheetId: data.spreadsheetId,
      sheetName: data.sheetName,
      rowNumber,
      company: String(contact.company).trim(),
      contact: String(contact.contact).trim(),
      phone: String(contact.phone).trim(),
      instance: INSTANCE,
      messageTemplate: "Hola! buenos días disculpa es {contact} de {company}? le escribe Erick Padilla de Coparmex NL",
      enqueuedAt: new Date().toISOString()
    };
    const task = {
      httpRequest: {
        httpMethod: "POST",
        url: CLOUD_RUN_URL.replace(/\/$/, "") + "/internal/commercial-send",
        headers: { "Content-Type": "application/json" },
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
    await updateTracking(data.spreadsheetId, data.sheetName, rowNumber, {
      status: "EN COLA", error: ""
    });
    tasks.push({ rowNumber, delayMs });
  }

  return {
    queued: tasks.length,
    instance: INSTANCE,
    queue: DEFAULT_QUEUE,
    note: "Los mensajes se enviarán de forma gradual; revisa la hoja para ver el estado."
  };
}

async function processCommercialTask(payload) {
  const { spreadsheetId, sheetName, rowNumber, company, contact, phone, instance, messageTemplate, taskId } = payload;
  if (!spreadsheetId || !sheetName || !rowNumber || !company || !contact || !phone || !instance || !taskId) {
    throw new Error("Payload de tarea comercial incompleto.");
  }

  const sheets = getSheetsClient();
  const escapedName = "'" + sheetName.replace(/'/g, "''") + "'";
  const statusResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: escapedName + "!I" + rowNumber + ":I" + rowNumber
  });
  const currentStatus = statusResponse.data.values?.[0]?.[0] || "";
  if (currentStatus === "ENVIADO" || currentStatus === "ENVIANDO") {
    return { skipped: true, reason: "already_processed", rowNumber };
  }

  if (!isWithinSendingHours()) {
    await updateTracking(spreadsheetId, sheetName, rowNumber, {
      status: "PENDIENTE: FUERA DE HORARIO", error: "Se requiere reprogramar manualmente."
    });
    return { skipped: true, reason: "outside_sending_hours", rowNumber };
  }

  await updateTracking(spreadsheetId, sheetName, rowNumber, { status: "ENVIANDO", error: "" });
  const message = String(messageTemplate)
    .replaceAll("{contact}", contact)
    .replaceAll("{company}", company);

  try {
    const result = await sendMessage(instance, phone, message);
    if (!result?.sent) {
      await updateTracking(spreadsheetId, sheetName, rowNumber, {
        status: "ERROR", error: result?.reason || "Evolution no confirmó el envío."
      });
      return { sent: false, rowNumber, reason: result?.reason || "send_failed" };
    }
    const sentAt = new Date().toISOString();
    await updateTracking(spreadsheetId, sheetName, rowNumber, {
      date: sentAt, status: "ENVIADO", error: ""
    });
    return { sent: true, rowNumber, sentAt };
  } catch (error) {
    await updateTracking(spreadsheetId, sheetName, rowNumber, {
      status: "ERROR", error: String(error.message || "Error de envío").slice(0, 450)
    });
    throw error;
  }
}

module.exports = { enqueueCommercialProspects, processCommercialTask };
