const express = require("express");
const router = express.Router();

const {
  createConversation
} = require("../services/conversations");


router.post("/conversation/start", async (req, res) => {

  try {

    const data = req.body;

    console.log("Solicitud de inicio de entrevista recibida:");
    console.log(JSON.stringify(data, null, 2));


    // --------------------------------------------------
    // VALIDACIONES BÁSICAS
    // --------------------------------------------------

    if (!data.recruiterInstance) {

      return res.status(400).json({
        error: "Falta recruiterInstance"
      });

    }


    if (!data.scriptId) {

      return res.status(400).json({
        error: "Falta scriptId"
      });

    }


    if (!data.candidates || !Array.isArray(data.candidates)) {

      return res.status(400).json({
        error: "Falta candidates"
      });

    }


    if (data.candidates.length === 0) {

      return res.status(400).json({
        error: "No hay candidatos para iniciar"
      });

    }


    // --------------------------------------------------
    // MOSTRAR INFORMACIÓN RECIBIDA
    // --------------------------------------------------

    console.log(
      "Reclutador:",
      data.recruiterInstance
    );

    console.log(
      "Guion:",
      data.scriptId
    );

    console.log(
      "Vacante:",
      data.vacancy.name
    );

    console.log(
      "Candidatos:",
      data.candidates.length
    );


    // --------------------------------------------------
    // CREAR UNA CONVERSACIÓN POR CADA CANDIDATO
    // --------------------------------------------------

    const conversations = [];


    for (const candidate of data.candidates) {

      console.log(
        "Creando conversación para:",
        candidate.name
      );


      const conversation =
        await createConversation({

          recruiterInstance:
            data.recruiterInstance,

          recruiterName:
            data.recruiterName,

          candidatePhone:
            candidate.phone,

          candidateName:
            candidate.name,

          vacancyId:
            data.vacancy.id,

          scriptId:
            data.scriptId

        });


      conversations.push(conversation);


      console.log(
        "Conversación creada:",
        conversation
      );

    }


    // --------------------------------------------------
    // RESPUESTA
    // --------------------------------------------------

    res.status(200).json({

      success: true,

      message:
        "Conversaciones creadas correctamente",

      conversations

    });


  } catch (error) {

    console.error(
      "Error en /conversation/start:"
    );

    console.error(error);


    res.status(500).json({

      success: false,

      error: error.message

    });

  }

});


module.exports = router;