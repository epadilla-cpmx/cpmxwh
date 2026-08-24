function getFirstName(fullName) {

  if (!fullName) {
    return "";
  }

  return String(fullName)
    .trim()
    .split(/\s+/)[0];

}


function buildMessage(template, data) {

  if (!template) {
    return "";
  }

  const firstName =
    getFirstName(data.candidateName);

  return template
    .replace(
      /{{candidateName}}/g,
      firstName
    )
    .replace(
      /{{vacancyName}}/g,
      data.vacancyName || ""
    )
    .replace(
      /{{recruiterName}}/g,
      data.recruiterName || ""
    );

}


module.exports = {
  getFirstName,
  buildMessage
};