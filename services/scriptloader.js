const scripts = {
  "Ing": require("../scripts/ing")
};


function getScript(scriptId) {

  const script = scripts[scriptId];

  if (!script) {

    throw new Error(
      `No existe un guion configurado con el ID: ${scriptId}`
    );

  }

  return script;

}


module.exports = {
  getScript
};