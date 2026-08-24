const script = {

  id: "Ing",

  greeting:
    "Hola {{candidateName}}, soy parte del equipo de reclutamiento de Coparmex NL. Vimos tu información para la vacante de {{vacancyName}}. ¿Puedo hacerte una breve entrevista?",

  steps: [

    {
      question: "¿Qué edad tienes?",
      column: "D",
      type: "numeric"
    },

    {
      question: "¿En qué carrera estás?",
      column: "F",
      type: "text"
    },

    {
      question: "¿Qué semestre estás cursando?",
      column: "G",
      type: "numeric"
    },

    {
      question: "¿Qué promedio tienes?",
      column: "H",
      type: "numeric"
    },

    {
      question: "¿Cuál es tu horario de clases?",
      column: "I",
      type: "text"
    },

    {
      question: "¿En qué fecha te gradúas?",
      column: "J",
      type: "text"
    },

    {
      question: "¿Cuál es tu nivel de dominio en la paquetería de Office?",
      column: "K",
      type: "text"
    },

    {
      question: "¿Cuál es tu nivel de inglés?",
      column: "L",
      type: "text"
    },

    {
      question: "¿Cuentas con laptop?",
      column: "M",
      type: "text"
    },

    {
      question: "¿Con qué diplomados cuentas?",
      column: "N",
      type: "text"
    },

    {
      question: "¿Cuáles son tus áreas de interés?",
      column: "O",
      type: "text"
    },

    {
      question: "¿Cuentas con auto propio?",
      column: "P",
      type: "text"
    },

    {
      question: "¿Podrías compartirnos 2 habilidades con las que cuentes?",
      column: "R",
      type: "text"
    },

    {
      question:
        "Cuéntame sobre un problema técnico que hayas tenido en un proyecto y cómo lo resolviste.",
      column: "U",
      type: "star"
    },

    {
      question:
        "Cuéntame sobre alguna herramienta o tecnología que hayas tenido que aprender por tu cuenta. ¿Cómo lo hiciste?",
      column: "V",
      type: "star"
    },

    {
      question:
        "Cuéntame sobre algún desacuerdo que hayas tenido trabajando en equipo. ¿Cómo lo resolvieron?",
      column: "W",
      type: "star"
    },

    {
      question:
        "Cuéntame sobre algún error que hayas cometido en un proyecto. ¿Cómo lo corregiste y qué aprendiste?",
      column: "X",
      type: "star"
    }

  ],

  goodbye:
    "Muchas gracias por tu tiempo para esta entrevista, te estaremos contactando para dar seguimiento. ¡Saludos!"

};


module.exports = script;