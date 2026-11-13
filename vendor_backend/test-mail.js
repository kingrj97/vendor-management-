const nodemailer = require("nodemailer");

const t = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: "onepice4597@gmail.com",
    pass: "YAHAN_APP_PASSWORD_BINA_SPACE_KE"
  },
  tls: { rejectUnauthorized: false }
});

t.sendMail({
  from: "onepice4597@gmail.com",
  to: "rajjethva97@gmail.com",
  subject: "test",
  text: "hello"
})
  .then((r) => console.log("OK", r.messageId))
  .catch((e) => console.log("FAIL", e.message));