const express = require("express");
const router = express.Router();

async function handler(req, res) {

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

}

router.post("/webhook", handler);

router.post("/webhook/messages-upsert", handler);

module.exports = router;