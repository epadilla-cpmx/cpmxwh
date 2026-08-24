const TIME_ZONE = "America/Monterrey";

const START_HOUR = 8;
const END_HOUR = 20;


function getCurrentHour() {

  const hour =
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      hour12: false
    }).format(new Date());

  return Number(hour);
}


function isWithinSendingHours() {

  const hour = getCurrentHour();

  return (
    hour >= START_HOUR &&
    hour < END_HOUR
  );
}


module.exports = {
  isWithinSendingHours,
  getCurrentHour
};
