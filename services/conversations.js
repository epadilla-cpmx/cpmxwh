const { google } = require("googleapis");

const { buildMessage } = require("./messageBuilder");
const { getScript } = require("./scriptLoader");

// --------------------------------------------------
// AUTENTICACIÓN DE GOOGLE
// --------------------------------------------------

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

// --------------------------------------------------
// CONFIGURACIÓN
// --------------------------------------------------

const TARGET_SHEET_ID =
  process.env.TARGET_SHEET_ID;

// Relación entre instancia de Evolution y hoja destino.
// Todas las instancias usan una hoja con el mismo nombre,
// excepto Main, que corresponde a Erick.
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

// --------------------------------------------------
// OBTENER CONEXIÓN CON GOOGLE SHEETS
// --------------------------------------------------

async function getSheetsClient() {
  return google.sheets({
    version: "v4",
    auth
  });
}

// --------------------------------------------------
// OBTENER HOJA DEL RECLUTADOR
// --------------------------------------------------

function getTargetSheet(instance) {
  const sheetName =
    recruiterSheets[instance];

  if (!sheetName) {
    throw new Error(
      `No existe una hoja configurada para la instancia: ${instance}`
    );
  }

  return sheetName;
}

// --------------------------------------------------
// BUSCAR ÚLTIMA FILA DE UNA HOJA
// --------------------------------------------------

async function getNextRow(sheetName) {
  const sheets =
    await getSheetsClient();

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId: TARGET_SHEET_ID,
      range: `${sheetName}!A:A`
    });

  const values =
    response.data.values || [];

  return values.length + 1;
}

// --------------------------------------------------
// GENERAR ID DE CONVERSACIÓN
// --------------------------------------------------

async function getNextConversationId() {
  const sheets =
    await getSheetsClient();

  const response =
    await sheets.spreadsheets.values.get({
      spreadsheetId: TARGET_SHEET_ID,
      range: "Motor!A:A"
    });

  const values =
    response.data.values || [];

  const conversationNumber =
    values.length;

  return `CONV-${String(conversationNumber).padStart(4, "0")}`;
}

// --------------------------------------------------
// CREAR CONVERSACIÓN
// --------------------------------------------------

async function createConversation(data) {
  const sheets =
    await getSheetsClient();

  const targetSheet =
    getTargetSheet(
      data.recruiterInstance
    );

  const targetRow =
    await getNextRow(
      targetSheet
    );

  const conversationId =
    await getNextConversationId();

  // --------------------------------------------------
  // CARGAR Y PERSONALIZAR EL GUION
  // --------------------------------------------------

  const script =
    getScript(data.scriptId);

  const greeting =
    buildMessage(
      script.greeting,
      {
        candidateName: data.candidateName,
        vacancyName: data.vacancyName,
        recruiterName: data.recruiterName
      }
    );

  // --------------------------------------------------
  // REGISTRAR CANDIDATO EN LA HOJA DEL RECLUTADOR
  // --------------------------------------------------

  await sheets.spreadsheets.values.append({
    spreadsheetId:
      TARGET_SHEET_ID,

    range:
      `${targetSheet}!A:B`,

    valueInputOption:
      "RAW",

    insertDataOption:
      "INSERT_ROWS",

    requestBody: {
      values: [[
        data.vacancyId,
        data.candidateName
      ]]
    }
  });

  const now =
    new Date().toISOString();

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
    now
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId:
      TARGET_SHEET_ID,

    range:
      "Motor!A:M",

    valueInputOption:
      "RAW",

    insertDataOption:
      "INSERT_ROWS",

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

// --------------------------------------------------
// EXPORTAR FUNCIONES
// --------------------------------------------------

module.exports = {
  createConversation,
  getTargetSheet
};
