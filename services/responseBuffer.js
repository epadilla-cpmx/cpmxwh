const { google } = require("googleapis");

const RESPONSE_BUFFER_MS = Number(
  process.env.RESPONSE_BUFFER_MS || 11500
);

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const TARGET_SHEET_ID = process.env.TARGET_SHEET_ID;

async function updateBufferState(conversation, values) {
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: TARGET_SHEET_ID,
    range: `Motor!N${conversation.motorRow}:Q${conversation.motorRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        values.pendingResponse ?? conversation.pendingResponse ?? "",
        values.lastMessageAt ?? conversation.lastMessageAt ?? "",
        values.processing ?? conversation.processing ?? false,
        values.lastMessageId ?? conversation.lastMessageId ?? ""
      ]]
    }
  });
}

async function scheduleBufferProcessing(
  conversationId,
  recruiterInstance,
  lastMessageAt
) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const targetUrl = process.env.CLOUD_RUN_URL;
  const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL;

  if (!projectId || !location || !queue || !targetUrl || !serviceAccountEmail) {
    throw new Error(
      "Faltan variables de Cloud Tasks: GOOGLE_CLOUD_PROJECT, CLOUD_TASKS_LOCATION, CLOUD_TASKS_QUEUE, CLOUD_RUN_URL o GOOGLE_CLIENT_EMAIL."
    );
  }

  const client = await auth.getClient();
  const queuePath = `projects/${projectId}/locations/${location}/queues/${queue}`;
  const scheduledTime = new Date(
    new Date(lastMessageAt).getTime() + RESPONSE_BUFFER_MS
  ).toISOString();

  const payload = Buffer.from(JSON.stringify({
    conversationId,
    recruiterInstance,
    lastMessageAt
  })).toString("base64");

  await client.request({
    url: `https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`,
    method: "POST",
    data: {
      task: {
        scheduleTime: scheduledTime,
        httpRequest: {
          httpMethod: "POST",
          url: `${targetUrl.replace(/\/$/, "")}/internal/process-buffer`,
          headers: { "Content-Type": "application/json" },
          body: payload,
          oidcToken: {
            serviceAccountEmail,
            audience: targetUrl
          }
        }
      }
    }
  });

  console.log(
    `Procesamiento programado para ${conversationId} a las ${scheduledTime}`
  );
}

async function appendMessage(conversation, messageId, text) {
  if (!text) return { added: false, reason: "empty_text" };

  if (messageId && messageId === conversation.lastMessageId) {
    console.log("Mensaje duplicado ignorado:", messageId);
    return { added: false, reason: "duplicate" };
  }

  const pendingResponse = conversation.pendingResponse
    ? `${conversation.pendingResponse}\n${text}`
    : text;

  const lastMessageAt = new Date().toISOString();

  // Escribimos primero el nuevo estado. Las tareas antiguas solamente
  // podrán procesarlo si todavía coincide con este lastMessageAt.
  await updateBufferState(conversation, {
    pendingResponse,
    lastMessageAt,
    processing: false,
    lastMessageId: messageId || conversation.lastMessageId
  });

  await scheduleBufferProcessing(
    conversation.conversationId,
    conversation.recruiterInstance,
    lastMessageAt
  );

  return { added: true, pendingResponse, lastMessageAt };
}

function hasBufferExpired(lastMessageAt) {
  if (!lastMessageAt) return false;
  return Date.now() - new Date(lastMessageAt).getTime() >= RESPONSE_BUFFER_MS;
}

module.exports = {
  appendMessage,
  updateBufferState,
  hasBufferExpired,
  RESPONSE_BUFFER_MS
};
