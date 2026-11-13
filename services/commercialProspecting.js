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

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function validateSheetData(data) {
  if (!data || typeof data.spreadsheetId !== "string" || !data.spreadsheetId.trim()) {
    throw httpError("Falta spreadsheetId.");
  }
  if (!/^[a-zA-Z0-9 _-]+$/.test(String(data.sheetName || "").trim())) {
    throw httpError("Nombre de pestaña inválido.");
  }
  if (!Array.isArray(data.contacts) || data.contacts.length === 0) {
    throw httpError("Selecciona al menos un contacto.");
  }

  const seenRows = new Set();
  for (const c of data.contacts) {
    const rowNumber = Number(c.rowNumber);
    const messageType = Number(c.messageType);

    if (!Number.isInteger(rowNumber) || rowNumber < 2 ||
        !String(c.company || "").trim() || !String(c.phone || "").trim()) {
      throw httpError("Cada contacto requiere fila, empresa y teléfono. El nombre del contacto es opcional.");
    }
    if (![1, 2].includes(messageType)) {
      throw httpError("La fila " + rowNumber + " tiene un tipo de mensaje inválido. Solo se permite 1 o 2.");
    }
    if (seenRows.has(rowNumber)) {
      throw httpError("La fila " + rowNumber + " aparece más de una vez.");
    }
    seenRows.add(rowNumber);
  }
}

function escapedSheet(sheetName) { return "'" + sheetName.replace(/'/g, "''") + "'"; }

/**
 * Interpreta el historial almacenado en I.
 * Formatos combinados: "ENVIADO - MENSAJES 1, 2"
 * También reconoce el formato individual: "ENVIADO - MENSAJE 1".
 */
function getSentTypes(status) {
  const value = String(status || "").toUpperCase();
  const sent = [];
  if (/ENVIADO\s*-\s*MENSAJE(?:S)?\s*1(?:\s*[,Y]\s*2)?/.test(value)) sent.push(1);
  if (/ENVIADO\s*-\s*MENSAJE(?:S)?\s*(?:1\s*[,Y]\s*)?2/.test(value)) sent.push(2);
  return sent;
}

function hasLegacyUnidentifiedSentStatus(status) {
  const value = String(status || "").trim().toUpperCase();
  return value === "ENVIADO" || value === "ENVIADO - MENSAJE";
}

function hasActiveTask(status) {
  const value = String(status || "").toUpperCase();
  return value.includes("EN COLA") || value.includes("ENVIANDO");
}

function historySuffix(sentTypes) {
  const unique = [...new Set(sentTypes)].sort();
  if (unique.length === 0) return "";
  if (unique.length === 1) return "ENVIADO - MENSAJE " + unique[0];
  return "ENVIADO - MENSAJES " + unique.join(", ");
}

function composeStatus(currentStatus, activeLabel, sentTypes) {
  const parts = [activeLabel, historySuffix(sentTypes)].filter(Boolean);
  return parts.join(" | ");
}

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
  const data = [
    { range: range + "!I" + rowNumber, values: [[values.status ?? ""]] },
    { range: range + "!J" + rowNumber, values: [[values.error ?? ""]] }
  ];

  // Solo modificar H cuando se proporciona explícitamente una fecha.
  if (Object.prototype.hasOwnProperty.call(values, "date")) {
    data.push({ range: range + "!H" + rowNumber, values: [[values.date]] });
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data }
  });
}

async function readRowTracking(sheets, spreadsheetId, sheetName, rowNumber) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: escapedSheet(sheetName) + "!H" + rowNumber + ":I" + rowNumber
  });
  const values = response.data.values?.[0] || [];
  return {
    firstSentAt: String(values[0] || ""),
    status: String(values[1] || "").trim()
  };
}

async function enqueueCommercialProspects(data) {
  validateConfig();
  validateSheetData(data);

  const hour = localHour();
  const minute = localMinute();
  const remainingMinutes = (20 - hour) * 60 - minute;
  if (!isWithinSendingHours() || remainingMinutes < data.contacts.length * 5) {
    throw httpError("Inicia el lote entre las 08:00 y las 20:00 de Monterrey y con tiempo suficiente para terminarlo.");
  }

  await ensureTrackingColumns(data.spreadsheetId, data.sheetName);
  const sheets = getSheetsClient();
  const client = await getQueueClient();
  const queuePath = \`projects/\${PROJECT_ID}/locations/\${QUEUE_LOCATION}/queues/\${QUEUE}\`;

  // Validar el lote completo antes de crear tareas.
  const trackingByRow = new Map();
  for (const contact of data.contacts) {
    const rowNumber = Number(contact.rowNumber);
    const tracking = await readRowTracking(sheets, data.spreadsheetId, data.sheetName, rowNumber);
    const status = tracking.status.toUpperCase();
    const messageType = Number(contact.messageType);
    const sentTypes = getSentTypes(status);

    if (hasActiveTask(status)) {
      throw httpError("La fila " + rowNumber + " ya tiene un mensaje pendiente o en proceso.", 409);
    }
    if (status.includes("ERROR: VERIFICAR")) {
      throw httpError("La fila " + rowNumber + " requiere verificar el resultado del envío anterior.", 409);
    }
    if (hasLegacyUnidentifiedSentStatus(status)) {
      throw httpError("La fila " + rowNumber + " tiene un envío anterior sin tipo identificado. Revisa esa fila antes de continuar.", 409);
    }
    if (sentTypes.includes(messageType)) {
      throw httpError("El mensaje " + messageType + " ya fue enviado en la fila " + rowNumber + ".", 409);
    }

    trackingByRow.set(rowNumber, { ...tracking, sentTypes });
  }

  const tasks = [];
  let cumulativeDelayMs = 1000;

  for (const contact of data.contacts) {
    const rowNumber = Number(contact.rowNumber);
    const messageType = Number(contact.messageType);
    const tracking = trackingByRow.get(rowNumber);

    if (tasks.length > 0) cumulativeDelayMs += randomDelayMs();
    const scheduledAt = new Date(Date.now() + cumulativeDelayMs);
    const queuedStatus = composeStatus(
      tracking.status,
      "EN COLA - MENSAJE " + messageType,
      tracking.sentTypes
    );

    // Marcar la fila antes de crear la tarea para reducir la ventana de duplicación.
    await updateTracking(data.spreadsheetId, data.sheetName, rowNumber, {
      status: queuedStatus,
      error: ""
    });

    const payload = {
      taskId: crypto.randomUUID(),
      spreadsheetId: data.spreadsheetId,
      sheetName: data.sheetName,
      rowNumber,
      company: String(contact.company).trim(),
      contact: String(contact.contact || "").trim(),
      phone: String(contact.phone).trim(),
      messageType,
      instance: INSTANCE
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

    try {
      await client.request({
        url: \`https://cloudtasks.googleapis.com/v2/\${queuePath}/tasks\`,
        method: "POST",
        data: { task }
      });
    } catch (error) {
      await updateTracking(data.spreadsheetId, data.sheetName, rowNumber, {
        status: composeStatus(tracking.status, "ERROR - MENSAJE " + messageType, tracking.sentTypes),
        error: String(error.message || "No se pudo crear la tarea.").slice(0, 450)
      });
      throw error;
    }

    tasks.push({ rowNumber, messageType, scheduledAt: scheduledAt.toISOString() });
  }

  return {
    queued: tasks.length,
    instance: INSTANCE,
    queue: QUEUE,
    message1: tasks.filter(task => task.messageType === 1).length,
    message2: tasks.filter(task => task.messageType === 2).length,
    note: "Mensajes puestos en cola de forma gradual."
  };
}

function buildMessage(messageType, contact, company) {
  const name = String(contact || "").trim();
  const business = String(company || "").trim();

  if (messageType === 1) {
    return name
      ? "Hola! buenos días disculpa es {contact} de {company}? le escribe Erick Padilla de Coparmex NL"
      : "Hola! buenos días disculpa es {company}? le escribe Erick Padilla de Coparmex NL";
  }

  if (messageType === 2) {
    return name
      ? "Hola buenos días {contact}! escribo para dar seguimiento, con gusto puedo dar más detalles y resolver dudas, saludos!"
      : "Hola buenos días! escribo para dar seguimiento, con gusto puedo dar más detalles y resolver dudas, saludos!";
  }

  throw new Error("Tipo de mensaje no permitido.");
}

async function processCommercialTask(payload) {
  const {
    spreadsheetId, sheetName, rowNumber, company, contact, phone,
    instance, messageType, taskId
  } = payload;

  const type = Number(messageType);
  if (!spreadsheetId || !sheetName || !rowNumber || !company || !phone ||
      !instance || !taskId || ![1, 2].includes(type)) {
    throw new Error("Payload de tarea comercial incompleto o inválido.");
  }

  const sheets = getSheetsClient();
  const tracking = await readRowTracking(sheets, spreadsheetId, sheetName, rowNumber);
  const currentStatus = tracking.status;
  const sentTypes = getSentTypes(currentStatus);

  if (sentTypes.includes(type)) {
    return { skipped: true, reason: "message_type_already_sent", rowNumber, messageType: type };
  }

  if (currentStatus.toUpperCase().includes("ENVIANDO")) {
    return { skipped: true, reason: "row_already_processing", rowNumber };
  }

  // Solo procesar tareas que sigan registradas como EN COLA para ese tipo.
  if (!currentStatus.toUpperCase().includes("EN COLA - MENSAJE " + type)) {
    return { skipped: true, reason: "task_no_longer_queued", rowNumber, messageType: type };
  }

  if (!isWithinSendingHours()) {
    await updateTracking(spreadsheetId, sheetName, rowNumber, {
      status: composeStatus(currentStatus, "PENDIENTE - MENSAJE " + type, sentTypes),
      error: "Fuera del horario permitido. Vuelve a seleccionar este tipo de mensaje para reencolarlo."
    });
    return { skipped: true, reason: "outside_sending_hours", rowNumber };
  }

  await updateTracking(spreadsheetId, sheetName, rowNumber, {
    status: composeStatus(currentStatus, "ENVIANDO - MENSAJE " + type, sentTypes),
    error: ""
  });

  const messageTemplate = buildMessage(type, contact, company);
  const message = messageTemplate
    .replaceAll("{contact}", String(contact || "").trim())
    .replaceAll("{company}", String(company || "").trim());

  try {
    const result = await sendMessage(instance, phone, message, {
      presence: "composing",
      delayMs: randomTypingDelayMs()
    });

    if (!result?.sent) {
      await updateTracking(spreadsheetId, sheetName, rowNumber, {
        status: composeStatus(currentStatus, "ERROR - MENSAJE " + type, sentTypes),
        error: String(result?.reason || "Evolution no confirmó el envío.").slice(0, 450)
      });
      return { sent: false, rowNumber, messageType: type, reason: result?.reason || "send_failed" };
    }

    const sentAt = new Date().toISOString();
    const nextSentTypes = [...sentTypes, type];
    const updatedStatus = "ENVIADO - " +
      (nextSentTypes.length > 1 ? "MENSAJES " : "MENSAJE ") +
      [...new Set(nextSentTypes)].sort().join(", ");

    const update = { status: updatedStatus, error: "" };
    if (!tracking.firstSentAt) update.date = sentAt;

    await updateTracking(spreadsheetId, sheetName, rowNumber, update);
    return { sent: true, rowNumber, messageType: type, sentAt };
  } catch (error) {
    // Evitar que un reintento automático duplique un mensaje cuyo resultado sea incierto.
    try {
      await updateTracking(spreadsheetId, sheetName, rowNumber, {
        status: composeStatus(currentStatus, "ERROR: VERIFICAR - MENSAJE " + type, sentTypes),
        error: String(error.message || "Resultado de envío incierto; verificar antes de reintentar.").slice(0, 450)
      });
    } catch (trackingError) {
      console.error("No se pudo actualizar el seguimiento; la fila puede permanecer ENVIANDO:", trackingError.message);
    }
    return { sent: false, rowNumber, messageType: type, reason: "send_result_needs_manual_verification" };
  }
}

module.exports = { enqueueCommercialProspects, processCommercialTask };
