import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  runTransaction,
  serverTimestamp,
  collection,
  addDoc,
  getDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import "./App.css";

// ---------- CONFIG FIREBASE ----------
const firebaseConfig = {
  apiKey: "AIzaSyAwPFBJ5GTtfOXSVQM1ZaIH_GJSLTG8z4A",
  authDomain: "quba-21daf.firebaseapp.com",
  projectId: "quba-21daf",
  storageBucket: "quba-21daf.firebasestorage.app",
  messagingSenderId: "71019976001",
  appId: "1:71019976001:web:59261a098ad42d3e5d3dc0",
  measurementId: "G-9RRXRQG80D",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app, "gs://quba-21daf.firebasestorage.app");

// Helpers
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitForUploadTask = (task) =>
  new Promise((resolve, reject) => task.on("state_changed", undefined, reject, resolve));
async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000; let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function paymentLabel(m){
  return m === 'CB' ? 'Carte bancaire (CB)' : m === 'Virement' ? 'Virement' : 'Espèce';
}

const ASSOCIATION_NAME = "ASSOCIATION MIM";
const ASSOCIATION_ADDRESS = "2 Place Victor Hugo, 95400 Villiers-le-Bel";
const ASSOCIATION_OBJECT = "Religion";
const DON_PURPOSE = "UTILISATION PRÉVUE DU DON : CONSTRUCTION DE MOSQUÉE POUR L'ASSOCIATION MIM.";

const SIGNATURE_OPTIONS = [
  "TRÉSORIER : RAJA TARIQ",
  "PRÉSIDENT : ALI ASIF",
];

const SIGNER_BY_EMAIL = {
  "tariq@test.fr": "TRÉSORIER : RAJA TARIQ",
  "asif@test.fr": "PRÉSIDENT : ALI ASIF",
};
const normalizeEmail = (s) => String(s || "").trim().toLowerCase();

// === Mail config ===
const MAIL_FROM = "Association MIM <no.reply.masjidquba@gmail.com>";
const MAIL_REPLY_TO = "no.reply.masjidquba@gmail.com";
const MAIL_ARCHIVE_BCC = "no.reply.masjidquba@gmail.com";

function formatDateFR(dateStr) {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString("fr-FR");
  } catch {
    return dateStr;
  }
}

export default function RootApp() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [donationDate, setDonationDate] = useState(() => new Date().toISOString().slice(0,10));
  const [paymentMethod, setPaymentMethod] = useState("Espece");
  const [signerName, setSignerName] = useState(SIGNATURE_OPTIONS[0]);
  const [lockSigner, setLockSigner] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "admins", u.uid));
          setIsAdmin(snap.exists());
        } catch {
          setIsAdmin(false);
        }
        const mapped = SIGNER_BY_EMAIL[normalizeEmail(u.email)];
        if (mapped && SIGNATURE_OPTIONS.includes(mapped)) {
          setSignerName(mapped);
          setLockSigner(true);
        } else {
          setLockSigner(false);
        }
      } else {
        setIsAdmin(null);
        setLockSigner(false);
      }
    });
  }, []);

  const logout = async () => {
    try { await signOut(auth); } catch {}
  };

  if (!user || isAdmin === null) return null;
  if (isAdmin === false) return <div>Accès non autorisé</div>;

  const generateReceipt = async () => {
    const donorTrim = donor.trim();
    const emailTrim = email.trim();
    const forcedByEmail = SIGNER_BY_EMAIL[normalizeEmail(user?.email)];
    const signerTrim = (forcedByEmail && SIGNATURE_OPTIONS.includes(forcedByEmail))
      ? forcedByEmail
      : signerName.trim();

    if (!donorTrim || !amount) return alert("Merci de remplir le nom du donateur et le montant");
    if (emailTrim && !isValidEmail(emailTrim)) return alert("Adresse e-mail invalide.");
    const amountNumber = Number(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) return alert("Montant invalide.");
    if (!donationDate) return alert("Merci de choisir une date.");

    setLoading(true);
    try {
      const number = await runTransaction(db, async (tx) => {
        const counterRef = doc(db, "counters", "receipts");
        const snap = await tx.get(counterRef);
        if (!snap.exists()) { tx.set(counterRef, { value: 1 }); return 1; }
        const next = (snap.data().value || 0) + 1; tx.update(counterRef, { value: next }); return next;
      });

      const pdf = new jsPDF();
      const pageW = pdf.internal.pageSize.getWidth();
      pdf.setFontSize(14);
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(15, 15, pageW - 30, 22, 3, 3);
      pdf.text(ASSOCIATION_NAME, 20, 26);
      pdf.setFontSize(12);
      pdf.text(ASSOCIATION_ADDRESS, 20, 34);
      pdf.text(`Objet de l'association : ${ASSOCIATION_OBJECT}`, 20, 46);
      pdf.text(`Reçu N°: ${number}`, pageW - 20, 14, { align: 'right' });
      pdf.text(`Donateur : ${donorTrim}`, 20, 70);
      pdf.text(`Montant : ${amountNumber.toFixed(2)} €`, 20, 80);
      pdf.text(`Date du don : ${formatDateFR(donationDate)}`, 20, 90);
      pdf.text(`Mode de paiement : ${paymentLabel(paymentMethod)}`, 20, 100);
      const splitPurpose = pdf.splitTextToSize(DON_PURPOSE, 170);
      pdf.text(splitPurpose, 20, 115);
      const signY = 135;
      pdf.text("Signature, nom et qualité du signataire :", 20, signY);
      pdf.text(`${signerTrim}`, 20, signY + 8);
      pdf.text("Merci pour votre soutien.", 20, signY + 26);

      const pdfBlob = pdf.output("blob");
      const fileName = `receipt_${number}.pdf`;
      const pdfBase64 = await blobToBase64(pdfBlob);

      const recipients = [];
      if (emailTrim) recipients.push(emailTrim);

      await addDoc(collection(db, "mail"), {
        to: recipients,
        bcc: [MAIL_ARCHIVE_BCC],
        from: MAIL_FROM,
        replyTo: MAIL_REPLY_TO,

        message: {
          subject: `Reçu ${ASSOCIATION_NAME} N°${number}`,
          text: `As-salāmu ‘alaykum wa rahmatullāh,

Qu’Allāh accepte votre don et vous récompense pour votre générosité.
Veuillez trouver en pièce jointe le reçu correspondant à votre contribution.

BarakAllāhu fīkum,
L’équipe de l’Association MIM`,

          html: `
            <p><strong>As-salāmu ‘alaykum wa rahmatullāh,</strong></p>
            <p>Qu’Allāh accepte votre don et vous récompense pour votre générosité.</p>
            <p>Veuillez trouver en pièce jointe le reçu correspondant à votre contribution.</p>
            <p><em>BarakAllāhu fīkum,</em><br/>
            L’équipe de l’Association MIM</p>
          `,
        },

        attachments: [
          {
            filename: fileName,
            content: pdfBase64,
            contentType: "application/pdf",
          },
        ],
      });

      setDonor(""); setAmount(""); setEmail("");
      alert("✅ Reçu généré et envoyé avec la pièce jointe PDF.");
    } catch (e) {
      console.error("Erreur:", e);
      alert(`❌ Erreur: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>{ASSOCIATION_NAME} — Reçus de dons</h1>
      <div>
        <input placeholder="Nom du donateur" value={donor} onChange={(e)=>setDonor(e.target.value)} />
        <input placeholder="Montant (€)" type="number" value={amount} onChange={(e)=>setAmount(e.target.value)} />
        <input placeholder="Email du donateur" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <button onClick={generateReceipt} disabled={loading}>
          {loading ? "Envoi..." : "Générer le reçu"}
        </button>
      </div>
    </div>
  );
}
