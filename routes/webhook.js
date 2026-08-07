const express = require("express");
const router = express.Router();

router.post("/webhook/:event?", async (req, res) => {

  try {

    console.log("Webhook recibido:");
    console.log(JSON.stringify(req.body, null, 2));

    res.status(200).json({
      status: "received"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });

  }

});

module.exports = router;