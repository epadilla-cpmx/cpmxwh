const express = require("express");
const router = express.Router();

router.post("/conversation/start", async (req, res) => {

  try {

    const data = req.body;

    console.log("Solicitud de inicio de entrevista recibida:");
    console.log(JSON.stringify(data, null, 2));

    // Validaciones básicas
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

    console.log("Reclutador:", data.recruiterInstance);
    console.log("Guion:", data.scriptId);
    console.log("Vacante:", data.vacancyName);
    console.log("Candidatos:", data.candidates.length);

    // Por ahora solamente confirmamos que recibimos correctamente la información.
    // La creación de la conversación y el envío por Evolution vendrán después.

    res.status(200).json({
      success: true,
      message: "Información recibida correctamente",
      candidatesReceived: data.candidates.length
    });

  } catch (error) {

    console.error("Error en /conversation/start:");
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});

module.exports = router;