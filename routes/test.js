const express = require("express");
const router = express.Router();
const { sendMessage } = require("../services/evolution");
const { getVacanteData } = require("../services/sheets");

router.get("/test-sheets", async (req, res) => {

  try {

    const data = await getVacanteData();

    res.json(data);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
});
module.exports = router;

router.get("/test-flow", async (req, res) => {

  try {

    const data = await getVacanteData();

    if (data.activar !== "1") {
      return res.json({
        status: "no enviado",
        reason: "AV2 no tiene valor 1"
      });
    }

    const result = await sendMessage(
      "5218115900861",
      data.mensaje
    );

    res.json({
      status: "mensaje enviado",
      evolution: result
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});