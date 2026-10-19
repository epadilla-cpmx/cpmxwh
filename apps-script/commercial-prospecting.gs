/**
 * Configura estas propiedades en Apps Script > Configuración del proyecto >
 * Propiedades del script:
 *   COMMERCIAL_API_URL = URL base de Cloud Run
 *   COMMERCIAL_API_KEY = mismo valor que COMMERCIAL_API_KEY en Cloud Run
 *
 * La hoja debe tener estas columnas:
 * A Empresa, B estado, C contacto, D correo, E telefono,
 * F seguimiento, G ultima respuesta.
 */
const COMMERCIAL_COLUMNS = {
  company: 1,
  contact: 3,
  phone: 5,
  status: 9
};
const COMMERCIAL_MAX_BATCH = 10;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Prospección WhatsApp")
    .addItem("Enviar a filas seleccionadas", "sendSelectedCommercialProspects")
    .addToUi();
}

function sendSelectedCommercialProspects() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  if (!range || range.getRow() < 2) {
    ui.alert("Selecciona las filas de empresas que quieres contactar, sin incluir el encabezado.");
    return;
  }
  if (range.getNumRows() > COMMERCIAL_MAX_BATCH) {
    ui.alert("El lote inicial permite un máximo de 10 filas.");
    return;
  }

  const properties = PropertiesService.getScriptProperties();
  const apiUrl = (properties.getProperty("COMMERCIAL_API_URL") || "").replace(/\/$/, "");
  const apiKey = properties.getProperty("COMMERCIAL_API_KEY");
  if (!apiUrl || !apiKey) {
    ui.alert("Faltan COMMERCIAL_API_URL o COMMERCIAL_API_KEY en las propiedades del script.");
    return;
  }

  const values = range.getValues();
  const contacts = [];
  const missing = [];
  values.forEach((row, offset) => {
    const rowNumber = range.getRow() + offset;
    const company = String(row[COMMERCIAL_COLUMNS.company - 1] || "").trim();
    const contact = String(row[COMMERCIAL_COLUMNS.contact - 1] || "").trim();
    const phone = String(row[COMMERCIAL_COLUMNS.phone - 1] || "").trim();
    const status = String(sheet.getRange(rowNumber, COMMERCIAL_COLUMNS.status).getDisplayValue() || "").trim();

    if (!company || !contact || !phone) {
      missing.push(rowNumber + " (faltan empresa, contacto o teléfono)");
      return;
    }
    if (status === "ENVIADO" || status === "ENVIANDO" || status === "EN COLA") {
      missing.push(rowNumber + " (ya está " + status + ")");
      return;
    }
    contacts.push({ rowNumber, company, contact, phone });
  });

  if (missing.length) {
    const choice = ui.alert(
      "Filas omitidas",
      missing.join("\n") + "\n\nSe enviarán solamente las filas válidas que no estén procesadas. ¿Continuar?",
      ui.ButtonSet.YES_NO
    );
    if (choice !== ui.Button.YES) return;
  }
  if (!contacts.length) {
    ui.alert("No hay filas válidas nuevas para enviar.");
    return;
  }

  const confirmation = ui.alert(
    "Confirmar prospección",
    "Se pondrán en cola " + contacts.length + " mensajes desde la instancia comercial. ¿Continuar?",
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  const spreadsheet = sheet.getParent();
  const payload = {
    spreadsheetId: spreadsheet.getId(),
    sheetName: sheet.getName(),
    contacts
  };

  try {
    const response = UrlFetchApp.fetch(apiUrl + "/commercial/prospect", {
      method: "post",
      contentType: "application/json",
      headers: { "x-commercial-api-key": apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code < 200 || code >= 300) {
      ui.alert("Cloud Run rechazó la solicitud (" + code + "):\n" + body);
      return;
    }
    const result = JSON.parse(body);
    ui.alert("Mensajes puestos en cola: " + result.queued + "\nInstancia: " + result.instance);
  } catch (error) {
    ui.alert("No se pudo contactar Cloud Run: " + error.message);
  }
}
