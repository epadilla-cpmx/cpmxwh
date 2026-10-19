/**
 * Prospección comercial por WhatsApp desde filas seleccionadas.
 * Columnas: A Empresa, C contacto, E telefono.
 * Seguimiento: H fecha, I estado de envío, J error.
 */
const COMMERCIAL_SHEET_NAME = "seguimiento 1";
const COMMERCIAL_MAX_BATCH = 10;
const COMMERCIAL_CLOUD_RUN_URL =
  "https://cpmxwh-417317824044.northamerica-south1.run.app";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Aplicaciones")
    .addItem("Mandar mensajes por WhatsApp", "mandarMensajesWhatsApp")
    .addToUi();
}

function mandarMensajesWhatsApp() {
  const ui = SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();

  if (sheet.getName() !== COMMERCIAL_SHEET_NAME) {
    ui.alert('Abre la pestaña "' + COMMERCIAL_SHEET_NAME + '" y selecciona las filas.');
    return;
  }

  const rangeList = sheet.getActiveRangeList();
  if (!rangeList) {
    ui.alert("Selecciona las filas de las empresas que deseas contactar.");
    return;
  }

  const selectedRows = new Set();
  rangeList.getRanges().forEach(range => {
    const firstRow = range.getRow();
    const lastRow = firstRow + range.getNumRows() - 1;
    for (let row = firstRow; row <= lastRow; row++) {
      if (row >= 2) selectedRows.add(row);
    }
  });

  const rows = [...selectedRows].sort((a, b) => a - b);
  if (rows.length === 0) {
    ui.alert("Selecciona filas de empresas, sin incluir el encabezado.");
    return;
  }
  if (rows.length > COMMERCIAL_MAX_BATCH) {
    ui.alert("El lote máximo permitido es de 10 filas.");
    return;
  }

  const contacts = [];
  const skipped = [];

  rows.forEach(rowNumber => {
    const row = sheet.getRange(rowNumber, 1, 1, 10).getDisplayValues()[0];
    const company = String(row[0] || "").trim();
    const contact = String(row[2] || "").trim();
    const phone = String(row[4] || "").trim();
    const status = String(row[8] || "").trim().toUpperCase();

    if (!company || !contact || !phone) {
      skipped.push("Fila " + rowNumber + ": faltan empresa, contacto o teléfono.");
      return;
    }
    if (["EN COLA", "ENVIANDO", "ENVIADO"].includes(status)) {
      skipped.push("Fila " + rowNumber + ": ya está " + status + ".");
      return;
    }

    contacts.push({ rowNumber, company, contact, phone });
  });

  if (skipped.length > 0) {
    const choice = ui.alert(
      "Filas omitidas",
      skipped.join("\n") + "\n\n¿Continuar con las filas válidas?",
      ui.ButtonSet.YES_NO
    );
    if (choice !== ui.Button.YES) return;
  }

  if (contacts.length === 0) {
    ui.alert("No hay contactos válidos nuevos para enviar.");
    return;
  }

  const confirmation = ui.alert(
    "Confirmar envío",
    "Se pondrán en cola " + contacts.length +
      " mensajes mediante la instancia Erick2.\n\n" +
      "Horario: 08:00 a 20:00, hora de Monterrey.\n" +
      "¿Deseas continuar?",
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  const payload = {
    spreadsheetId: spreadsheet.getId(),
    sheetName: sheet.getName(),
    contacts
  };

  try {
    const response = UrlFetchApp.fetch(
      COMMERCIAL_CLOUD_RUN_URL + "/commercial/prospect",
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    const code = response.getResponseCode();
    const body = response.getContentText();
    console.log("Código HTTP: " + code);
    console.log("Respuesta Cloud Run: " + body);

    if (code < 200 || code >= 300) {
      ui.alert("Cloud Run respondió con un error (" + code + "):\n\n" + body);
      return;
    }

    const result = JSON.parse(body);
    ui.alert(
      "Solicitud enviada correctamente.\n\n" +
      "Mensajes puestos en cola: " + result.queued + "\n" +
      "Instancia: " + result.instance
    );
  } catch (error) {
    ui.alert("Error al contactar Cloud Run:\n" + error.message);
  }
}
