const { google } = require("googleapis");


const auth = new google.auth.GoogleAuth({

  credentials: {

    client_email:
      process.env.GOOGLE_CLIENT_EMAIL,

    private_key:
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")

  },

  scopes: [
    "https://www.googleapis.com/auth/spreadsheets"
  ]

});


const TARGET_SHEET_ID =
  process.env.TARGET_SHEET_ID;


async function updateConversation(
  conversationId,
  updates
) {

  const sheets =
    google.sheets({

      version: "v4",

      auth

    });


  const response =
    await sheets.spreadsheets.values.get({

      spreadsheetId:
        TARGET_SHEET_ID,

      range:
        "Motor!A:M"

    });


  const rows =
    response.data.values || [];


  const rowIndex =
    rows.findIndex(
      row =>
        row[0] === conversationId
    );


  if (rowIndex === -1) {

    throw new Error(
      `No se encontró la conversación: ${conversationId}`
    );

  }


  const sheetRow =
    rowIndex + 1;


  const currentRow =
    rows[rowIndex];


  const newRow = [

    currentRow[0],

    currentRow[1],

    currentRow[2],

    currentRow[3],

    currentRow[4],

    currentRow[5],

    currentRow[6],

    updates.currentStep ??
      currentRow[7],

    updates.status ??
      currentRow[8],

    currentRow[9],

    currentRow[10],

    currentRow[11],

    new Date().toISOString()

  ];


  await sheets.spreadsheets.values.update({

    spreadsheetId:
      TARGET_SHEET_ID,

    range:
      `Motor!A${sheetRow}:M${sheetRow}`,

    valueInputOption:
      "RAW",

    requestBody: {

      values: [
        newRow
      ]

    }

  });


  return {

    ...Object.fromEntries(
      [
        "conversationId",
        "recruiterInstance",
        "recruiterName",
        "candidatePhone",
        "candidateName",
        "vacancyId",
        "scriptId",
        "currentStep",
        "status",
        "targetSheet",
        "targetRow",
        "createdAt",
        "updatedAt"
      ].map(
        (key, index) => [
          key,
          newRow[index]
        ]
      )
    )

  };

}


module.exports = {

  updateConversation

};