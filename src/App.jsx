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

// ---------- HELPERS ----------
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
  return m === "CB" ? "Carte bancaire (CB)" : m === "Virement" ? "Virement" : "Espèce";
}

// ---------- INFOS ASSOCIATION ----------
const ASSOCIATION_NAME = "ASSOCIATION MIM";
const ASSOCIATION_ADDRESS = "2 Place Victor Hugo, 95400 Villiers-le-Bel";
const ASSOCIATION_OBJECT = "Religion";
const DON_PURPOSE =
  "UTILISATION PRÉVUE DU DON : CONSTRUCTION DE MOSQUÉE POUR L'ASSOCIATION MIM.";

// ---------- SIGNATURES ----------
const SIGNATURE_OPTIONS = ["TRÉSORIER : RAJA TARIQ", "PRÉSIDENT : ALI ASIF"];

const SIGNER_BY_EMAIL = {
  "tariq@test.fr": "TRÉSORIER : RAJA TARIQ",
  "asif@test.fr": "PRÉSIDENT : ALI ASIF",
};
const normalizeEmail = (s) => String(s || "").trim().toLowerCase();

// ---------- CONFIG MAIL ----------
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

// ---------- AUTH COMPONENT ----------
function AuthCard({ onReady }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => isValidEmail(email) && (mode === "reset" ? true : pw.length >= 6),
    [email, pw, mode]
  );

  const handleSignin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
      onReady?.(cred.user);
    } catch (e) {
      alert(`❌ Connexion: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      alert("✅ Compte créé !");
      onReady?.(cred.user);
    } catch (e) {
      alert(`❌ Inscription: ${e.message}`);
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
      alert(`❌ Reset: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="brandbar">
        <div className="logo">M</div>
        <div className="brandtitle">{ASSOCIATION_NAME} — Accès sécurisé</div>
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
          <div className="form">
            <label>Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode !== "reset" && (
              <>
                <label>Mot de passe</label>
                <input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
              </>
            )}
            <div className="actions">
              {mode === "signin" && (
                <>
                  <button disabled={!canSubmit || loading} onClick={handleSignin}>
                    {loading ? "Connexion…" : "Se connecter"}
                  </button>
                  <span onClick={() => setMode("signup")}>Créer un compte</span>
                  <span onClick={() => setMode("reset")}>Mot de passe oublié</span>
                </>
              )}
              {mode === "signup" && (
                <>
                  <button disabled={!canSubmit || loading} onClick={handleSignup}>
                    {loading ? "Création…" : "Créer le compte"}
                  </button>
                  <span onClick={() => setMode("signin")}>Retour</span>
                </>
              )}
              {mode === "reset" && (
                <>
                  <button disabled={!isValidEmail(email) || loading} onClick={handleReset}>
                    {loading ? "Envoi…" : "Envoyer le lien"}
                  </button>
                  <span onClick={() => setMode("signin")}>Retour</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- MAIN APP ----------
export default function RootApp() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [donationDate, setDonationDate] = useState(() => new Date().toISOString().slice(0, 10));
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
          <div className="brandtitle">{ASSOCIATION_NAME}</div>
        </div>
        <div className="wrapper">
          <div className="card">
            <h1>Accès non autorisé</h1>
            <button onClick={logout}>Se déconnecter</button>
          </div>
        </div>
      </>
    );
  }

  const generateReceipt = async () => {
    const donorTrim = donor.trim();
    const emailTrim = email.trim();
    const forcedByEmail = SIGNER_BY_EMAIL[normalizeEmail(user?.email)];
    const signerTrim = forcedByEmail || signerName.trim();

    if (!donorTrim || !amount) return alert("Merci de remplir le nom du donateur et le montant");
    if (emailTrim && !isValidEmail(emailTrim)) return alert("Email invalide");

    const amountNumber = Number(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) return alert("Montant invalide");
    if (!donationDate) return alert("Merci de choisir une date");

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

      // --- PDF ---
      const pdf = new jsPDF();
      pdf.setFontSize(14);
      pdf.text(ASSOCIATION_NAME, 20, 26);
      pdf.setFontSize(12);
      pdf.text(ASSOCIATION_ADDRESS, 20, 34);
      pdf.text(`Objet de l'association : ${ASSOCIATION_OBJECT}`, 20, 46);
      pdf.text(`Reçu N°: ${number}`, 160, 14);
      pdf.text(`Donateur : ${donorTrim}`, 20, 70);
      pdf.text(`Montant : ${amountNumber.toFixed(2)} €`, 20, 80);
      pdf.text(`Date du don : ${formatDateFR(donationDate)}`, 20, 90);
      pdf.text(`Mode de paiement : ${paymentLabel(paymentMethod)}`, 20, 100);
      pdf.text(DON_PURPOSE, 20, 115);
      pdf.text(`Signataire : ${signerTrim}`, 20, 130);

      const pdfBlob = pdf.output("blob");
      const fileName = `receipt_${number}.pdf`;
      const pdfBase64 = await blobToBase64(pdfBlob);

      // --- Envoi mail ---
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
          attachments: [
            {
              filename: fileName,
              content: pdfBase64,
              encoding: "base64",
            },
          ],
        },
      });

      alert("✅ Reçu généré et envoyé avec la pièce jointe PDF.");
      setDonor("");
      setAmount("");
      setEmail("");
    } catch (e) {
      console.error(e);
      alert("❌ Erreur: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="brandbar">
        <div className="logo">M</div>
        <div className="brandtitle">{ASSOCIATION_NAME}</div>
      </div>

      <div className="wrapper">
        <div className="card">
          <h1>Générer un reçu PDF</h1>
          <div className="form">
            <label>Nom du donateur</label>
            <input value={donor} onChange={(e) => setDonor(e.target.value)} />

            <label>Montant (€)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />

            <label>Email du donateur</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

            <label>Date du don</label>
            <input type="date" value={donationDate} onChange={(e) => setDonationDate(e.target.value)} />

            <label>Mode de paiement</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="Espece">Espèce</option>
              <option value="CB">Carte bancaire (CB)</option>
              <option value="Virement">Virement</option>
            </select>

            <label>Signataire</label>
            <select value={signerName} onChange={(e) => setSignerName(e.target.value)} disabled={lockSigner}>
              {SIGNATURE_OPTIONS.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>

            <button onClick={generateReceipt} disabled={loading}>
              {loading ? "Traitement…" : "Générer le reçu"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
