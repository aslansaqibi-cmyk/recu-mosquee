// netlify/functions/send-receipt.js
export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { donorEmail, donorName, amount, dateISO, associationName } = JSON.parse(event.body || "{}");

    if (!donorEmail || !amount || !dateISO || !associationName) {
      return { statusCode: 400, body: "Missing required fields" };
    }

    // Reçu HTML simple
    const html = `
      <div style="font-family: Arial, sans-serif">
        <h2>Reçu de don – ${associationName}</h2>
        <p>Bonjour ${donorName || ""},</p>
        <p>Nous confirmons la réception de votre don :</p>
        <ul>
          <li>Montant : <strong>${Number(amount).toFixed(2)} €</strong></li>
          <li>Date : <strong>${new Date(dateISO).toLocaleDateString()}</strong></li>
          <li>Bénéficiaire : <strong>${associationName}</strong></li>
        </ul>
        <p>Merci pour votre soutien.</p>
      </div>
    `;

    // Variables d'environnement (à définir sur Netlify)
    const apiKey = process.env.RESEND_API_KEY;    // ta clé Resend
    const from = process.env.EMAIL_FROM;          // ex: "Association <recu@tondomaine.fr>"
    if (!apiKey || !from) {
      return { statusCode: 500, body: "Email provider not configured" };
    }

    // Appel API Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: donorEmail,
        subject: `Votre reçu de don – ${associationName}`,
        html
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return { statusCode: 502, body: `Email send failed: ${text}` };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: `Server error: ${e.message}` };
  }
};
