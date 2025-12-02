// services/EmailService.js
const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: "mail.rsjmb.com",
      port: 465,
      secure: true,
      auth: {
        user: "info@rsjmb.com",
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async sendEmail(to, subject, message) {
    try {
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <div style="text-align: center;">
            <img src="https://rsjmb.com/assets/rsjmb-logo.png" alt="RSJMB Logo" style="max-width: 150px; margin-bottom: 20px;" />
          </div>
          <h2 style="color: #005a87;">${subject}</h2>
          <p>${message}</p>
          <a>Silahkan Kunjungi Link Berikut Untuk cek laporan temuan http://localhost:8000/report</a>
          <hr />
          <footer style="font-size: 12px; color: #999;">
            Email ini dikirim dari sistem RSJMB. Jangan balas email ini.
          </footer>
        </div>
      `;

      const info = await this.transporter.sendMail({
        from: '"RSJMB Info" <info@rsjmb.com>',
        to,
        subject,
        text: message, // fallback text (optional)
        html: htmlBody, // actual HTML email
      });

      console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error.message);
    }
  }
}

module.exports = EmailService;
