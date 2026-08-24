function normalizePhone(phone) {

  if (!phone) {
    throw new Error("El número de teléfono está vacío");
  }

  let cleanPhone =
    String(phone).replace(/\D/g, "");

  // México: número nacional de 10 dígitos
  if (cleanPhone.length === 10) {

    cleanPhone = "52" + cleanPhone;

  }

  // México: si viene con 521, convertir a 52
  // Esto puede aparecer en números provenientes de WhatsApp.
  if (
    cleanPhone.length === 13 &&
    cleanPhone.startsWith("521")
  ) {

    cleanPhone =
      "52" + cleanPhone.substring(3);

  }

  // Estados Unidos / Canadá:
  // si ya tiene 11 dígitos y comienza con 1,
  // conservarlo como está.
  if (
    cleanPhone.length === 11 &&
    cleanPhone.startsWith("1")
  ) {

    return cleanPhone;

  }

  // México debe quedar como 12 dígitos: 52 + 10 dígitos
  if (
    cleanPhone.length === 12 &&
    cleanPhone.startsWith("52")
  ) {

    return cleanPhone;

  }

  throw new Error(
    `Número de teléfono inválido: ${phone}`
  );

}


module.exports = {
  normalizePhone
};