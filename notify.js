const sgMail = require("@sendgrid/mail");

module.exports = function sendMail(text) {
  sgMail.setApiKey(sgKey);

  const msg = {
    to: "russell@polygraph.cool",
    from: "russellgoldenberg@gmail.com",
    subject: "Issue with Infinite Data",
    text
  };

  sgMail
    .send(msg)
    .then(process.exit)
    .catch(err => {
      console.log(err);
      process.exit();
    });
};
