// mailService.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,  // your Gmail address
    pass: process.env.GMAIL_PASS,  // your Gmail app password
  },
});

async function sendMail(to, subject, html, text = "") {
  let mailOptions = {
    from: `"Enquiry System " <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ Email error:", err);
    throw err;
  }
}

module.exports = { sendMail };