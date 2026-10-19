/**
 * Apps Script para prospección manual desde filas seleccionadas.
 * Propiedades del script:
 * COMMERCIAL_API_URL = URL base de Cloud Run
 * COMMERCIAL_API_KEY = valor de COMMERCIAL_API_KEY configurado en Cloud Run
 *
 * Columnas de origen: A Empresa, B estado, C contacto, D correo,
 * E telefono, F seguimiento, G ultima respuesta.
 * El backend crea H:J para fecha, estado de envío y errores.
 */
const COMMERCIAL_MAX_BATCH = 10;
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Prospección WhatsApp")
    .addItem("Enviar a filas seleccionadas", "sendSelectedCommercialProspects")
    .addToUi();
}

function sendSelectedCommercialProspects() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const selected = sheet.getActiveRange();
  if (!selected || selected.getRow() < 2) {
    ui.alert("Selecciona las filas de empresas sin incluir el encabezado.");
    return;
  }
  if (selected.getNumRows() > COMMERCIAL_MAX_BATCH) {
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

  // Lee siempre A:G aunque el usuario haya seleccionado solo una celda de cada fila.
  const firstRow = selected.getRow();
  const rowCount = selected.getNumRows();
  const values = sheet.getRange(firstRow, 1, rowCount, 7).getDisplayValues();
  const contacts = [];
  const skipped = [];

  values.forEach((row, offset) => {
    const rowNumber = firstRow + offset;
    const company = String(row[0] || "").trim();
    const contact = String(row[2] || "").trim();
    const phone = String(row[4] || "").trim();
    const status = String(sheet.getRange(rowNumber, 9).getDisplayValue() || "").trim();
    if (!company || !contact || !phone) {
      skipped.push("Fila " + rowNumber + ": faltan empresa, contacto o teléfono.");
      return;
    }
    if (["ENVIADO", "ENVIANDO", "EN COLA"].includes(status)) {
      skipped.push("Fila " + rowNumber + ": ya está " + status + ".");
      return;
    }
    contacts.push({ rowNumber, company, contact, phone });
  });

  if (skipped.length && ui.alert("Filas omitidas", skipped.join("\n") + "\n\n¿Continuar con las filas válidas?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  if (!contacts.length) {
    ui.alert("No hay filas válidas nuevas para enviar.");
    return;
  }
  if (ui.alert("Confirmar prospección", "Se pondrán en cola " + contacts.length + " mensajes desde la instancia comercial. ¿Continuar?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const payload = {
    spreadsheetId: sheet.getParent().getId(),
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
