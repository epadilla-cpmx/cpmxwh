const { google } = require("googleapis");

const { normalizePhone } = require("./phone");

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

function getSheetsClient() {
  return google.sheets({ version: "v4", auth });
}

function nowIso() {
  return new Date().toISOString();
}

async function updateBufferState(conversation, values) {
  const sheets = getSheetsClient();
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

async function appendMessage(conversation, messageId, text) {
  if (!text) return { added: false, reason: "empty_text" };

  if (messageId && messageId === conversation.lastMessageId) {
    console.log("Mensaje duplicado ignorado:", messageId);
    return { added: false, reason: "duplicate" };
  }

  const pendingResponse = conversation.pendingResponse
    ? `${conversation.pendingResponse}\n${text}`
    : text;

  const lastMessageAt = nowIso();

  await updateBufferState(conversation, {
    pendingResponse,
    lastMessageAt,
    processing: false,
    lastMessageId: messageId || conversation.lastMessageId
  });

  console.log(
    `Respuesta acumulada para ${conversation.conversationId}. ` +
    `Ventana: ${RESPONSE_BUFFER_MS} ms.`
  );

  return {
    added: true,
    pendingResponse,
    lastMessageAt
  };
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
