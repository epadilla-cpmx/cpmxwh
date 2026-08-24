const { google } = require("googleapis");
const { normalizePhone } = require("./phone");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const TARGET_SHEET_ID = process.env.TARGET_SHEET_ID;

async function findConversation(recruiterInstance, candidatePhone) {
  const sheets = google.sheets({ version: "v4", auth });
  const normalizedPhone = normalizePhone(candidatePhone);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: TARGET_SHEET_ID,
    range: "Motor!A:Q"
  });

  const rows = response.data.values || [];

  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const conversation = {
      motorRow: index + 1,
      conversationId: row[0],
      recruiterInstance: row[1],
      recruiterName: row[2],
      candidatePhone: row[3],
      candidateName: row[4],
      vacancyId: row[5],
      scriptId: row[6],
      currentStep: Number(row[7] || 0),
      status: row[8],
      targetSheet: row[9],
      targetRow: Number(row[10] || 0),
      createdAt: row[11],
      updatedAt: row[12],
      pendingResponse: row[13] || "",
      lastMessageAt: row[14] || "",
      processing: String(row[15] || "").toLowerCase() === "true",
      lastMessageId: row[16] || ""
    };

    const rowPhone = normalizePhone(conversation.candidatePhone);

    if (
      conversation.recruiterInstance === recruiterInstance &&
      rowPhone === normalizedPhone &&
      conversation.status !== "completed" &&
      conversation.status !== "cancelled"
    ) {
      return conversation;
    }
  }

  return null;
}

module.exports = { findConversation };
