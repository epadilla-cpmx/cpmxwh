const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets.readonly"
  ],
});

async function getVacanteData() {

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.JD_SHEETS_ID,
    range: "Vacantes!AR2:AV2",
  });

  const row = response.data.values[0];

  return {
    mensaje: row[0], // AR2
    activar: row[4]  // AV2
  };
}

module.exports = {
  getVacanteData
};