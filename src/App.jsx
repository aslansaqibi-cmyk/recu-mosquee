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
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function paymentLabel(m) {
  return m === "CB"
    ? "Carte bancaire (CB)"
    : m === "Virement"
    ? "Virement"
    : "Espèce";
}

const ASSOCIATION_NAME = "ASSOCIATION MIM";
const ASSOCIATION_ADDRESS = "2 Place Victor Hugo, 95400 Villiers-le-Bel";
const ASSOCIATION_OBJECT = "Religion";
const DON_PURPOSE =
  "UTILISATION PRÉVUE DU DON : CONSTRUCTION DE MOSQUÉE POUR L'ASSOCIATION MIM.";

const SIGNATURE_OPTIONS = [
  "TRÉSORIER : RAJA TARIQ",
  "PRÉSIDENT : ALI ASIF",
];

// correspondance email → signataire
const SIGNER_BY_EMAIL = {
  "tariq@test.fr": "TRÉSORIER : RAJA TARIQ",
  "asif@test.fr": "PRÉSIDENT : ALI ASIF",
};
const normalizeEmail = (s) => String(s || "").trim().toLowerCase();

// configuration de l'envoi d'emails anonymes
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

function AuthCard({ onReady }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const canSubmit = useMemo(
    () => isValidEmail(email) && (mode === "reset" ? true : pw.length >= 6),
    [email, pw, mode]
  );

  const handleSignup = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      alert("✅ Compte créé. Demande à l’admin d’ajouter ton UID dans 'admins'.");
      onReady?.(cred.user);
    } catch (e) {
      alert(`❌ Inscription: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
      onReady?.(cred.user);
    } catch (e) {
      alert(`❌ Connexion: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!isValidEmail(email)) return alert("Email invalide");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      alert("📩 Email de réinitialisation envoyé.");
      setMode("signin");
    } catch (e) {
      alert(`❌ Reset: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="brandbar">
        <div className="logo">M</div>
        <div className="brandtitle">
          {ASSOCIATION_NAME} — Accès sécurisé
        </div>
      </div>
      <div className="wrapper">
        <div className="card">
          <div className="header">
            <h1 className="title">
              {mode === "signin"
                ? "Connexion"
                : mode === "signup"
                ? "Créer un compte"
                : "Mot de passe oublié"}
            </h1>
          </div>
          <p className="subtitle">
            {mode === "reset"
              ? "Entrez votre e-mail pour réinitialiser votre mot de passe."
              : "Accès réservé aux responsables autorisés."}
          </p>
          <div className="form">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode !== "reset" && (
              <div>
                <label className="label">Mot de passe</label>
                <input
                  type="password"
                  className="input"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
              </div>
            )}
            <div className="actions">
              {mode === "signin" && (
                <>
                  <button
                    className="btn"
                    disabled={!canSubmit || loading}
                    onClick={handleSignin}
                  >
                    {loading ? "Connexion…" : "Se connecter"}
                  </button>
                  <div className="smalltext">
                    <span onClick={() => setMode("signup")}>Créer un compte</span> •{" "}
                    <span onClick={() => setMode("reset")}>Mot de passe oublié</span>
                  </div>
                </>
              )}
              {mode === "signup" && (
                <>
                  <button
                    className="btn"
                    disabled={!canSubmit || loading}
                    onClick={handleSignup}
                  >
                    {loading ? "Création…" : "Créer le compte"}
                  </button>
                  <div
                    className="smalltext"
                    onClick={() => setMode("signin")}
                  >
                    ← Retour
                  </div>
                </>
              )}
              {mode === "reset" && (
                <>
                  <button
                    className="btn"
                    disabled={!isValidEmail(email) || loading}
                    onClick={handleReset}
                  >
                    {loading ? "Envoi…" : "Envoyer le lien"}
                  </button>
                  <div
                    className="smalltext"
                    onClick={() => setMode("signin")}
                  >
                    ← Retour
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function RootApp() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [donationDate, setDonationDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
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
        } else setLockSigner(false);
      } else {
        setIsAdmin(null);
        setLockSigner(false);
      }
    });
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {}
  };

  if (!user || isAdmin === null) {
    return <AuthCard onReady={(u) => setUser(u)} />;
  }

  if (isAdmin === false) {
    return (
      <>
        <div className="brandbar">
          <div className="logo">M</div>
          <div className="brandtitle">{ASSOCIATION_NAME} — Accès sécurisé</div>
        </div>
        <div className="wrapper">
          <div className="card">
            <h1>Accès non autorisé</h1>
            <button className="btn" onClick={logout}>
              Se déconnecter
            </button>
          </div>
        </div>
      </>
    );
  }

  const generateReceipt = async () => {
    const donorTrim = donor.trim();
    const emailTrim = email.trim();
    const forcedByEmail = SIGNER_BY_EMAIL[normalizeEmail(user?.email)];
    const signerTrim =
      forcedByEmail && SIGNATURE_OPTIONS.includes(forcedByEmail)
        ? forcedByEmail
        : signerName.trim();

    if (!donorTrim || !amount) return alert("Nom et montant requis");
    if (emailTrim && !isValidEmail(emailTrim)) return alert("Email invalide");

    const amountNumber = Number(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) return alert("Montant invalide");

    setLoading(true);
    try {
      const number = await runTransaction(db, async (tx) => {
        const ref = doc(db, "counters", "receipts");
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          tx.set(ref, { value: 1 });
          return 1;
        }
        const next = (snap.data().value || 0) + 1;
        tx.update(ref, { value: next });
        return next;
      });

      // --- PDF (style administratif) ---
      const pdf = new jsPDF();
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 15;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text(ASSOCIATION_NAME, pageW / 2, 22, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.text(ASSOCIATION_ADDRESS, pageW / 2, 29, { align: "center" });
      pdf.text(`Objet : ${ASSOCIATION_OBJECT}`, pageW / 2, 35, { align: "center" });
      pdf.setLineWidth(0.4);
      pdf.line(margin, 40, pageW - margin, 40);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(`REÇU DE DON N° ${number}`, pageW / 2, 52, { align: "center" });
      pdf.line(margin, 56, pageW - margin, 56);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      let y = 70;
      const lh = 8;
      pdf.text(`Donateur : ${donorTrim}`, margin, y);
      y += lh;
      pdf.text(`Montant  : ${amountNumber.toFixed(2)} €`, margin, y);
      y += lh;
      pdf.text(`Date du don : ${formatDateFR(donationDate)}`, margin, y);
      y += lh;
      pdf.text(`Mode de paiement : ${paymentLabel(paymentMethod)}`, margin, y);
      y += lh + 5;
      pdf.setFont("helvetica", "bold");
      pdf.text("Utilisation prévue du don :", margin, y);
      y += lh;
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(DON_PURPOSE, pageW - margin * 2);
      pdf.text(lines, margin, y);
      y += lines.length * 6 + 10;
      pdf.setFont("helvetica", "bold");
      pdf.text("Signataire :", margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(signerTrim, margin + 30, y);
      y += 20;
      pdf.setDrawColor(150);
      pdf.line(margin, y, pageW - margin, y);
      pdf.setFontSize(10);
      pdf.setTextColor(80);
      pdf.text("Merci pour votre soutien à l’Association MIM.", pageW / 2, y + 8, {
        align: "center",
      });
      pdf.setTextColor(0);

      const pdfBlob = pdf.output("blob");
      const fileName = `receipt_${number}.pdf`;

      const storageRef = ref(storage, `receipts/${fileName}`);
      const task = uploadBytesResumable(storageRef, pdfBlob);
      await waitForUploadTask(task);
      const fileUrl = await getDownloadURL(storageRef);

      await setDoc(doc(db, "receipts", `receipt_${number}`), {
        association: ASSOCIATION_NAME,
        donor: donorTrim,
        amount: amountNumber,
        email: emailTrim || null,
        number,
        donationDate,
        paymentMethod,
        signerName: signerTrim,
        fileUrl: fileUrl || null,
        createdAt: serverTimestamp(),
      });

      const pdfBase64 = await blobToBase64(pdfBlob);
      await sleep(200);

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
            <p><em>BarakAllāhu fīkum,</em><br/>L’équipe de l’Association MIM</p>
          `,
          attachments: [
            {
              filename: fileName,
              content: pdfBase64,
              encoding: "base64",
            },
          ],
        },
      });

      setDonor("");
      setAmount("");
      setEmail("");
      alert("✅ Reçu généré et envoyé avec la pièce jointe PDF.");
    } catch (e) {
      console.error("Erreur:", e);
      alert("❌ Erreur : " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="brandbar">
        <div className="logo">M</div>
        <div className="brandtitle">
          {ASSOCIATION_NAME} — Reçus de dons (admin)
        </div>
      </div>
      <div className="wrapper">
        <div className="card">
          <div className="header">
            <h1>Générer un reçu PDF</h1>
            <button className="btn" onClick={logout}>
              Se déconnecter
            </button>
          </div>
          <p className="subtitle">
            Adresse : {ASSOCIATION_ADDRESS} • Objet : {ASSOCIATION_OBJECT}
          </p>
          <div className="form">
            <div>
              <label className="label">Nom du donateur</label>
              <input
                className="input"
                value={donor}
                onChange={(e) => setDonor(e.target.value)}
              />
            </div>
            <div className="row">
              <div>
                <label className="label">Montant (€)</label>
                <input
                  className="input"
                  type="number"
                  value={amount}
                  onChange={(
