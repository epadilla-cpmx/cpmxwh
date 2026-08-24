const { google } = require("googleapis");

const {
  getScript
} = require("./scriptLoader");

const {
  buildMessage
} = require("./messageBuilder");

const {
  sendMessage
} = require("./evolution");

const {
  updateConversation
} = require("./conversationUpdater");


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


// --------------------------------------------------
// OBTENER GOOGLE SHEETS
// --------------------------------------------------

function getSheetsClient() {

  return google.sheets({

    version: "v4",

    auth

  });

}


// --------------------------------------------------
// GUARDAR RESPUESTA
// --------------------------------------------------

async function saveAnswer(
  conversation,
  step,
  answer
) {

  const sheets =
    getSheetsClient();

  await sheets.spreadsheets.values.update({

    spreadsheetId:
      TARGET_SHEET_ID,

    range:
      `${conversation.targetSheet}!${step.column}${conversation.targetRow}`,

    valueInputOption:
      "RAW",

    requestBody: {

      values: [
        [answer]
      ]

    }

  });

  console.log(
    `Respuesta guardada en ${conversation.targetSheet}!${step.column}${conversation.targetRow}`
  );

}


// --------------------------------------------------
// OBTENER PASO ACTUAL
// --------------------------------------------------

function getStep(conversation) {

  const script =
    getScript(
      conversation.scriptId
    );

  return script.steps[
    conversation.currentStep
  ];

}


// --------------------------------------------------
// ENVIAR PREGUNTA ACTUAL
// --------------------------------------------------

async function sendCurrentStep(
  conversation
) {

  const script =
    getScript(
      conversation.scriptId
    );

  const step =
    script.steps[
      conversation.currentStep
    ];


  // Ya no hay preguntas
  if (!step) {

    return finishConversation(
      conversation
    );

  }


  const question =
    buildMessage(

      step.question,

      {
        candidateName:
          conversation.candidateName,

        vacancyName:
          conversation.vacancyName,

        recruiterName:
          conversation.recruiterName
      }

    );


  console.log(
    "Enviando pregunta:",
    question
  );


  const response =
    await sendMessage(

      conversation.recruiterInstance,

      conversation.candidatePhone,

      question

    );


  console.log(
    "Respuesta de Evolution:",
    response
  );


  return {

    type: "question_sent",

    step:
      conversation.currentStep,

    question

  };

}


// --------------------------------------------------
// FINALIZAR CONVERSACIÓN
// --------------------------------------------------

async function finishConversation(
  conversation
) {

  const script =
    getScript(
      conversation.scriptId
    );


  const goodbye =
    buildMessage(

      script.goodbye,

      {
        candidateName:
          conversation.candidateName,

        vacancyName:
          conversation.vacancyName,

        recruiterName:
          conversation.recruiterName
      }

    );


  console.log(
    "Entrevista terminada."
  );


  await sendMessage(

    conversation.recruiterInstance,

    conversation.candidatePhone,

    goodbye

  );


  return {

    type: "completed",

    goodbye

  };

}


// --------------------------------------------------
// PROCESAR RESPUESTA
// --------------------------------------------------

async function processAnswer(
  conversation,
  answer
) {

  const step =
    getStep(
      conversation
    );


  if (!step) {

    return finishConversation(
      conversation
    );

  }


  console.log(
    "Procesando respuesta para:",
    step.question
  );


  await saveAnswer(

    conversation,

    step,

    answer

  );


  const nextStep =
    conversation.currentStep + 1;


  return {

    type:
      "answer_processed",

    currentStep:
      conversation.currentStep,

    nextStep

  };

}


// --------------------------------------------------
// AVANZAR CONVERSACIÓN
// --------------------------------------------------

async function advanceConversation(
  conversation,
  answer
) {

  const result =
    await processAnswer(
      conversation,
      answer
    );


  const script =
    getScript(
      conversation.scriptId
    );


  // ----------------------------------------------
  // TERMINAR ENTREVISTA
  // ----------------------------------------------

  if (
    result.nextStep >=
    script.steps.length
  ) {

    await updateConversation(

      conversation.conversationId,

      {
        currentStep:
          result.nextStep,

        status:
          "completed"
      }

    );


    return finishConversation(
      conversation
    );

  }


  // ----------------------------------------------
  // AVANZAR AL SIGUIENTE PASO
  // ----------------------------------------------

  await updateConversation(

    conversation.conversationId,

    {
      currentStep:
        result.nextStep,

      status:
        "waiting_answer"
    }

  );


  const nextConversation = {

    ...conversation,

    currentStep:
      result.nextStep,

    status:
      "waiting_answer"

  };


  return sendCurrentStep(
    nextConversation
  );

}


module.exports = {

  saveAnswer,

  getStep,

  sendCurrentStep,

  processAnswer,

  advanceConversation,

  finishConversation

};