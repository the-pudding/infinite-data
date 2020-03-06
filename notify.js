const sgMail = require("@sendgrid/mail");

const sgKey = process.env.SENDGRID_API_KEY;

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
    .then(() => process.exit(1))
    .catch(err => {
      console.log(err);
      process.exit(1);
    });
};
