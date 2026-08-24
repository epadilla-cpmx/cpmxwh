function normalizePhone(phone) {

  if (!phone) {
    throw new Error("El número de teléfono está vacío");
  }

  // Convertir a texto y eliminar espacios, guiones, paréntesis, etc.
  let cleanPhone = String(phone).replace(/\D/g, "");

  // Si viene como número mexicano de 10 dígitos,
  // agregar código de país 52.
  if (cleanPhone.length === 10) {
    cleanPhone = "52" + cleanPhone;
  }

  // Validación básica
  if (cleanPhone.length < 12) {
    throw new Error(
      `Número de teléfono inválido: ${phone}`
    );
  }

  return cleanPhone;
}


module.exports = {
  normalizePhone
};