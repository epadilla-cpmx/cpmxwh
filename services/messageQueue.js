const { google } = require("googleapis");
const { updateConversation } = require("./conversationUpdater");
const { sendMessage } = require("./evolution");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/cloud-tasks"
  ]
});

const SENDER_QUEUE = process.env.SENDER_QUEUE || "recruitment-sender";
const SENDER_QUEUE_LOCATION =
  process.env.SENDER_QUEUE_LOCATION || process.env.CLOUD_TASKS_LOCATION;
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL;
const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;

const INTER_MESSAGE_MIN_MS = 2000;
const INTER_MESSAGE_MAX_MS = 5000;

function getRandomInterval() {
  return Math.floor(
    Math.random() * (INTER_MESSAGE_MAX_MS - INTER_MESSAGE_MIN_MS + 1)
  ) + INTER_MESSAGE_MIN_MS;
}

function validateConfig() {
  const missing = [];
  if (!PROJECT_ID) missing.push("GOOGLE_CLOUD_PROJECT");
  if (!SENDER_QUEUE_LOCATION) missing.push("SENDER_QUEUE_LOCATION");
  if (!CLOUD_RUN_URL) missing.push("CLOUD_RUN_URL");
  if (!SERVICE_ACCOUNT_EMAIL) missing.push("GOOGLE_CLIENT_EMAIL");

  if (missing.length) {
    throw new Error(
      `Faltan variables de recruitment-sender: ${missing.join(", ")}`
    );
  }
}

async function enqueueMessage(conversation, text, options = {}) {
  if (!conversation?.conversationId) {
    throw new Error("Falta conversationId para encolar mensaje.");
  }
  if (!conversation?.recruiterInstance) {
    throw new Error("Falta recruiterInstance para encolar mensaje.");
  }
  if (!conversation?.candidatePhone) {
    throw new Error("Falta candidatePhone para encolar mensaje.");
  }
  if (!text) {
    throw new Error("No se puede encolar un mensaje vacío.");
  }

  validateConfig();

  const queuedAt = new Date().toISOString();
  const scheduleDelayMs = Number(options.scheduleDelayMs || 0);

  await updateConversation(conversation.conversationId, {
    sending: false,
    sendQueuedAt: queuedAt
  });

  const client = await auth.getClient();
  const queuePath =
    `projects/${PROJECT_ID}/locations/${SENDER_QUEUE_LOCATION}/queues/${SENDER_QUEUE}`;
  const targetUrl =
    `${CLOUD_RUN_URL.replace(/\/$/, "")}/internal/process-sender`;

  const payload = {
    conversationId: conversation.conversationId,
    recruiterInstance: conversation.recruiterInstance,
    candidatePhone: conversation.candidatePhone,
    text,
    presence: options.presence || null,
    delayMs: options.delayMs || null,
    queuedAt
  };

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url: targetUrl,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        audience: CLOUD_RUN_URL
      }
    }
  };

  if (scheduleDelayMs > 0) {
    task.scheduleTime = new Date(Date.now() + scheduleDelayMs).toISOString();
  }

  try {
    await client.request({
      url: `https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`,
      method: "POST",
      data: { task }
    });
  } catch (error) {
    await updateConversation(conversation.conversationId, {
      sendQueuedAt: ""
    });
    throw error;
  }

  console.log(
    `Mensaje encolado en ${SENDER_QUEUE}: ${conversation.conversationId} (${conversation.recruiterInstance})`
  );

  return { queued: true, queuedAt };
}

async function getMotorRows() {
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.TARGET_SHEET_ID;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Motor!A:S"
  });
  return response.data.values || [];
}

function isTrue(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function getQueuedForInstance(rows, instance) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      row[1] === instance &&
      row[0] &&
      row[18]
    )
    .sort((a, b) => {
      const timeA = new Date(a.row[18]).getTime();
      const timeB = new Date(b.row[18]).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.row[0]).localeCompare(String(b.row[0]));
    });
}

async function processSenderTask(payload) {
  const {
    conversationId,
    recruiterInstance,
    candidatePhone,
    text,
    presence,
    delayMs
  } = payload || {};

  if (!conversationId || !recruiterInstance || !candidatePhone || !text) {
    throw new Error(
      "conversationId, recruiterInstance, candidatePhone y text son requeridos"
    );
  }

  const rows = await getMotorRows();
  const queued = getQueuedForInstance(rows, recruiterInstance);
  const current = queued.find(({ row }) => row[0] === conversationId);

  if (!current) {
    console.log(`Tarea ${conversationId} ya no tiene un envío pendiente.`);
    return { sent: false, skipped: true, reason: "not_pending" };
  }

  const currentSending = isTrue(current.row[17]);
  if (currentSending) {
    const error = new Error(`La instancia ${recruiterInstance} está ocupada.`);
    error.code = "INSTANCE_BUSY";
    throw error;
  }

  const next = queued[0];
  if (next.row[0] !== conversationId) {
    const error = new Error(
      `La instancia ${recruiterInstance} tiene otro mensaje pendiente antes de ${conversationId}.`
    );
    error.code = "QUEUE_TURN_NOT_READY";
    throw error;
  }

  // El mensaje más antiguo de la instancia toma el turno antes de llamar a Evolution.
  await updateConversation(conversationId, {
    sending: true
  });

  try {
    console.log(
      `Enviando ${conversationId} mediante ${recruiterInstance}. Typing: ${delayMs || "sin delay"} ms.`
    );

    const result = await sendMessage(
      recruiterInstance,
      candidatePhone,
      text,
      {
        delayMs: delayMs || undefined,
        presence: presence || undefined
      }
    );

    if (!result?.sent) {
      throw new Error(
        `Evolution no confirmó el envío de ${conversationId}: ${result?.reason || "unknown"}`
      );
    }

    const intervalMs = getRandomInterval();
    console.log(
      `Intervalo de ${intervalMs} ms antes de liberar la instancia ${recruiterInstance}.`
    );
    await new Promise(resolve => setTimeout(resolve, intervalMs));

    await updateConversation(conversationId, {
      sending: false,
      sendQueuedAt: ""
    });

    console.log(`Envío completado para ${conversationId}.`);
    return result;
  } catch (error) {
    // Conservamos sendQueuedAt para que Cloud Tasks pueda reintentar la tarea.
    await updateConversation(conversationId, {
      sending: false
    });
    throw error;
  }
}

module.exports = {
  enqueueMessage,
  processSenderTask
};
