const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const TARGET_SHEET_ID = process.env.TARGET_SHEET_ID;

async function updateConversation(conversationId, updates) {
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: TARGET_SHEET_ID,
    range: "Motor!A:Q"
  });

  const rows = response.data.values || [];
  const rowIndex = rows.findIndex(row => row[0] === conversationId);

  if (rowIndex === -1) {
    throw new Error(`No se encontró la conversación: ${conversationId}`);
  }

  const sheetRow = rowIndex + 1;
  const currentRow = rows[rowIndex];
  const newRow = [
    currentRow[0], currentRow[1], currentRow[2], currentRow[3],
    currentRow[4], currentRow[5], currentRow[6],
    updates.currentStep ?? currentRow[7],
    updates.status ?? currentRow[8],
    currentRow[9], currentRow[10], currentRow[11],
    new Date().toISOString(),
    updates.pendingResponse ?? currentRow[13] ?? "",
    updates.lastMessageAt ?? currentRow[14] ?? "",
    updates.processing ?? currentRow[15] ?? false,
    updates.lastMessageId ?? currentRow[16] ?? ""
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: TARGET_SHEET_ID,
    range: `Motor!A${sheetRow}:Q${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [newRow] }
  });

  return {
    conversationId: newRow[0], recruiterInstance: newRow[1],
    recruiterName: newRow[2], candidatePhone: newRow[3],
    candidateName: newRow[4], vacancyId: newRow[5], scriptId: newRow[6],
    currentStep: Number(newRow[7] || 0), status: newRow[8],
    targetSheet: newRow[9], targetRow: Number(newRow[10] || 0),
    createdAt: newRow[11], updatedAt: newRow[12],
    pendingResponse: newRow[13] || "", lastMessageAt: newRow[14] || "",
    processing: String(newRow[15]).toLowerCase() === "true",
    lastMessageId: newRow[16] || ""
  };
}

module.exports = { updateConversation };
