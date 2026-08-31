const { google } = require("googleapis");

const { buildMessage } = require("./messageBuilder");
const { getScript } = require("./scriptLoader");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key:
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  },
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets"
  ]
});

const TARGET_SHEET_ID = process.env.TARGET_SHEET_ID;

const recruiterSheets = {
  "Main": "Erick",
  "Angel": "Angel",
  "Heidy": "Heidy",
  "Majo": "Majo",
  "Diana": "Diana",
  "Mia": "Mia",
  "Arely": "Arely",
  "Johanna": "Johanna"
};

async function getSheetsClient() {
  return google.sheets({
    version: "v4",
    auth
  });
}

function getTargetSheet(instance) {
  const sheetName = recruiterSheets[instance];

  if (!sheetName) {
    throw new Error(
      `No existe una hoja configurada para la instancia: ${instance}`
    );
  }

  return sheetName;
}

async function getNextRow(sheetName) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: TARGET_SHEET_ID,
    range: `${sheetName}!A:A`
  });

  const values = response.data.values || [];
  return values.length + 1;
}

async function getNextConversationId() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: TARGET_SHEET_ID,
    range: "Motor!A:A"
  });

  const values = response.data.values || [];
  const conversationNumber = values.length;

  return `CONV-${String(conversationNumber).padStart(4, "0")}`;
}

async function createConversation(data) {
  const sheets = await getSheetsClient();
  const targetSheet = getTargetSheet(data.recruiterInstance);
  const targetRow = await getNextRow(targetSheet);
  const conversationId = await getNextConversationId();

  const script = getScript(data.scriptId);

  const greeting = buildMessage(
    script.greeting,
    {
      candidateName: data.candidateName,
      vacancyName: data.vacancyName,
      recruiterName: data.recruiterName
    }
  );

  await sheets.spreadsheets.values.append({
    spreadsheetId: TARGET_SHEET_ID,
    range: `${targetSheet}!A:B`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[data.vacancyId, data.candidateName]]
    }
  });

  const now = new Date().toISOString();

  // A:S: conversation state + outbound send state.
  const row = [
    conversationId,
    data.recruiterInstance,
    data.recruiterName,
    data.candidatePhone,
    data.candidateName,
    data.vacancyId,
    data.scriptId,
    0,
    "waiting_start",
    targetSheet,
    targetRow,
    now,
    now,
    "",
    "",
    false,
    "",
    false,
    ""
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: TARGET_SHEET_ID,
    range: "Motor!A:S",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row]
    }
  });

  return {
    conversationId,
    targetSheet,
    targetRow,
    greeting
  };
}

module.exports = {
  createConversation,
  getTargetSheet
};
