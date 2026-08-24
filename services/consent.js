function normalizeText(text) {

  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[¿?¡!.,;:]/g, "")
    .replace(/\s+/g, " ");

}


function isPositiveResponse(text) {

  const normalized =
    normalizeText(text);

  const positiveResponses = [

    "si",
    "sí",
    "si claro",
    "claro",
    "claro que si",
    "claro que sí",
    "por supuesto",
    "por supuesto que si",
    "por supuesto que sí",
    "adelante",
    "si adelante",
    "sí adelante",
    "ok",
    "okay",
    "okey",
    "esta bien",
    "está bien",
    "esta perfecto",
    "está perfecto",
    "va",
    "dale",
    "de acuerdo",
    "con gusto",
    "sin problema",
    "no hay problema",
    "si podemos",
    "sí podemos",
    "si claro adelante",
    "sí claro adelante"

  ];

  return positiveResponses.includes(normalized);

}


function isNegativeResponse(text) {

  const normalized =
    normalizeText(text);

  const negativeResponses = [

    "no",
    "no gracias",
    "no muchas gracias",
    "ahorita no",
    "ahora no",
    "por ahora no",
    "prefiero no",
    "prefiero que no",
    "no puedo",
    "no me interesa",
    "no estoy interesado",
    "no estoy interesada",
    "no deseo",
    "no quiero",
    "no gracias por ahora",
    "gracias pero no",
    "mejor no"

  ];

  return negativeResponses.includes(normalized);

}


function getConsentResult(text) {

  if (isPositiveResponse(text)) {

    return "accepted";

  }

  if (isNegativeResponse(text)) {

    return "rejected";

  }

  return "ambiguous";

}


module.exports = {

  normalizeText,
  isPositiveResponse,
  isNegativeResponse,
  getConsentResult

};