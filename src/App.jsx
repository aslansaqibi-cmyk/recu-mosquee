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

const ASSOCIATION_NAME = "ASSOCIATION MIM";
const ASSOCIATION_ADDRESS = "2 Place Victor Hugo, 95400 Villiers-le-Bel"; // adresse inchangée
const ASSOCIATION_OBJECT = "Religion"; // objet de l'association
const DON_PURPOSE = "UTILISATION PRÉVUE DU DON : CONSTRUCTION DE MOSQUÉE POUR L'ASSOCIATION MIM.";
const SIGNATURE_OPTIONS = [
  "TRÉSORIER : RAJA TARIQ",
  "PRÉSIDENT : ALI ASIF",
];

function deriveNameFromEmail(email) {
  if (!email) return "";
  const local = email.split("@")[0];
  // Remplace séparateurs courants par des espaces et met en Capitalize simple
  const pretty = local.replace(/[._-]+/g, " ").trim();
  return pretty.replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDateFR(dateStr) {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString("fr-FR");
  } catch {
    return dateStr;
  }
}

function AuthCard({ onReady }) {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup' | 'reset'
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
      alert("✅ Compte créé. Demande à l’admin d’ajouter ton UID dans 'admins' si pas déjà fait.");
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
        <div className="brandtitle">{ASSOCIATION_NAME} — Accès sécurisé</div>
      </div>

      <div className="wrapper">
        <div className="card">
          <div className="header">
            <h1 className="title">
              {mode === "signin" ? "Connexion" : mode === "signup" ? "Créer un compte" : "Mot de passe oublié"}
            </h1>
          </div>
          <p className="subtitle">
            {mode === "reset"
              ? "Entrez votre e-mail pour recevoir un lien de réinitialisation."
              : "Accès réservé aux responsables autorisés."}
          </p>

          <div className="form">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="ex. admin@mail.com" />
            </div>

            {mode !== "reset" && (
              <div>
                <label className="label" htmlFor="pw">Mot de passe</label>
                <input id="pw" className="input" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} placeholder="min. 6 caractères" />
              </div>
            )}

            <div className="actions">
              {mode === "signin" && (
                <>
                  <button className="btn" disabled={!canSubmit || loading} onClick={handleSignin}>
                    {loading ? "Connexion…" : "Se connecter"}
                  </button>
                  <div style={{display:"flex", gap:8, fontSize:12, color:"#6b7280", justifyContent:"space-between"}}>
                    <span style={{cursor:"pointer"}} onClick={()=>setMode("signup")}>Créer un compte</span>
                    <span style={{cursor:"pointer"}} onClick={()=>setMode("reset")}>Mot de passe oublié</span>
                  </div>
                </>
              )}

              {mode === "signup" && (
                <>
                  <button className="btn" disabled={!canSubmit || loading} onClick={handleSignup}>
                    {loading ? "Création…" : "Créer le compte"}
                  </button>
                  <div style={{fontSize:12, color:"#6b7280", cursor:"pointer"}} onClick={()=>setMode("signin")}>
                    ← Retour à la connexion
                  </div>
                </>
              )}

              {mode === "reset" && (
                <>
                  <button className="btn" disabled={!isValidEmail(email) || loading} onClick={handleReset}>
                    {loading ? "Envoi…" : "Envoyer le lien"}
                  </button>
                  <div style={{fontSize:12, color:"#6b7280", cursor:"pointer"}} onClick={()=>setMode("signin")}>
                    ← Retour à la connexion
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
  const [isAdmin, setIsAdmin] = useState(null); // null = inconnu, true/false connu
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [donationDate, setDonationDate] = useState(() => new Date().toISOString().slice(0,10)); // yyyy-mm-dd
  const [paymentMethod, setPaymentMethod] = useState("CB"); // "CB" | "Virement" | "Espece"
  const [signerName, setSignerName] = useState(SIGNATURE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);

  // Session
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
      } else {
        setIsAdmin(null);
      }
    });
  }, []);

  const logout = async () => {
    try { await signOut(auth); } catch {}
  };

  // Si pas connecté → écran Auth
  if (!user || isAdmin === null) {
    return <AuthCard onReady={(u)=>setUser(u)} />;
  }

  // Connecté mais non-admin
  if (isAdmin === false) {
    return (
      <>
        <div className="brandbar">
          <div className="logo">M</div>
          <div className="brandtitle">{ASSOCIATION_NAME} — Accès sécurisé</div>
        </div>
        <div className="wrapper">
          <div className="card">
            <h1 className="title">Accès non autorisé</h1>
            <p className="subtitle">Votre compte n’est pas autorisé. Contactez l’administrateur.</p>
            <div className="actions">
              <button className="btn" onClick={logout}>Se déconnecter</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ----------- App (admin) -----------
  const generateReceipt = async () => {
    const donorTrim = donor.trim();
    const emailTrim = email.trim();
    const signerTrim = signerName.trim();

    if (!donorTrim || !amount || !emailTrim) return alert("Merci de remplir toutes les informations");
    if (!isValidEmail(emailTrim)) return alert("Adresse e-mail invalide.");
    const amountNumber = Number(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) return alert("Montant invalide.");
    if (!donationDate) return alert("Merci de choisir une date.");

    setLoading(true);
    try {
      // Numéro
      const number = await runTransaction(db, async (tx) => {
        const counterRef = doc(db, "counters", "receipts");
        const snap = await tx.get(counterRef);
        if (!snap.exists()) { tx.set(counterRef, { value: 1 }); return 1; }
        const next = (snap.data().value || 0) + 1; tx.update(counterRef, { value: next }); return next;
      });

      // PDF
      const pdf = new jsPDF();
      pdf.setFontSize(14);
      pdf.text(ASSOCIATION_NAME, 20, 20);
      pdf.text(ASSOCIATION_ADDRESS, 20, 30);
      pdf.setFontSize(12);
      pdf.text(`Objet de l'association : ${ASSOCIATION_OBJECT}`, 20, 40);
      pdf.text(`Reçu N°: ${number}`, 20, 55);
      pdf.text(`Donateur : ${donorTrim}`, 20, 70);
      pdf.text(`Montant : ${amountNumber.toFixed(2)} €`, 20, 80);
      pdf.text(`Date du don : ${formatDateFR(donationDate)}`, 20, 90);
      pdf.text(`Mode de paiement : ${paymentMethod === 'CB' ? 'Carte bancaire (CB)' : paymentMethod === 'Virement' ? 'Virement' : 'Espèce'}`, 20, 100);
      const splitPurpose = pdf.splitTextToSize(DON_PURPOSE, 170);
      pdf.text(splitPurpose, 20, 115);
      // Signature (mention à côté du nom)
      const signY = 135;
      pdf.text(`Nom et qualité du signataire : ${signerTrim}`, 20, signY);
      pdf.text("Signature :", 20, signY + 10);
      pdf.line(45, signY + 10, 120, signY + 10);
      pdf.text("Merci pour votre soutien.", 20, signY + 30);

      const pdfBlob = pdf.output("blob");
      const fileName = `receipt_${number}.pdf`;

      // Téléchargement local
      try { pdf.save(fileName); }
      catch {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a"); a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }

      // Upload + URL (archivage)
      let fileUrl = null;
      try {
        const storageRef = ref(storage, `receipts/${fileName}`);
        const task = uploadBytesResumable(storageRef, pdfBlob);
        await waitForUploadTask(task);
        fileUrl = await getDownloadURL(storageRef);
      } catch (e) { console.error("Upload/URL Storage échoué:", e); }

      // Sauvegarde Firestore
      try {
        await setDoc(doc(db, "receipts", `receipt_${number}`), {
          association: ASSOCIATION_NAME,
          address: ASSOCIATION_ADDRESS,
          associationObject: ASSOCIATION_OBJECT,
          donor: donorTrim,
          amount: amountNumber,
          email: emailTrim,
          number,
          donationDate,
          paymentMethod,
          purpose: DON_PURPOSE,
          signerName: signerTrim,
          signerUid: user.uid,
          createdAt: serverTimestamp(),
          fileUrl: fileUrl || null,
        });
      } catch (e) { console.error("Erreur enregistrement reçu:", e); }

      // Pièce jointe base64
      const pdfBase64 = await blobToBase64(pdfBlob);
      await sleep(200);

      // Mail avec PJ PDF
      await addDoc(collection(db, "mail"), {
        to: [emailTrim, "aslan.saqibi@gmail.com"],
        message: {
          subject: `Reçu ${ASSOCIATION_NAME} N°${number}`,
          text: `Cher ${donorTrim},\n\nMerci pour votre don de ${amountNumber.toFixed(2)} €.\nDate du don : ${formatDateFR(donationDate)}\nMode de paiement : ${paymentMethod === 'CB' ? 'Carte bancaire (CB)' : paymentMethod === 'Virement' ? 'Virement' : 'Espèce'}
\n${DON_PURPOSE}\n\nVeuillez trouver votre reçu en pièce jointe.\n\n${ASSOCIATION_NAME} — ${ASSOCIATION_ADDRESS}`,
          html: `
            <p>Cher ${donorTrim},</p>
            <p>Merci pour votre don de <strong>${amountNumber.toFixed(2)} €</strong>.</p>
            <p><strong>Date du don :</strong> ${formatDateFR(donationDate)}<br/>
               <strong>Mode de paiement :</strong> ${paymentLabel(paymentMethod)}<br/>
               <strong>Signataire :</strong> ${signerTrim}</p>
            <p>${DON_PURPOSE}</p>
            <p>Veuillez trouver votre reçu en pièce jointe.</p>
            <p>${ASSOCIATION_NAME} — ${ASSOCIATION_ADDRESS}</p>
          `,
          attachments: [
            { filename: fileName, content: pdfBase64, encoding: "base64", contentType: "application/pdf" },
          ],
        },
      });

      setDonor(""); setAmount(""); setEmail("");
      // Ne pas réinitialiser la date ni la méthode de paiement pour gains de temps
      alert("✅ Reçu généré et envoyé avec la pièce jointe PDF.");
    } catch (e) {
      console.error("Erreur:", e);
      alert(`❌ Erreur: ${e.code || ""} ${e.message || e}`);
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="brandbar">
        <div className="logo">M</div>
        <div className="brandtitle">{ASSOCIATION_NAME} — Reçus de dons (admin)</div>
      </div>

      <div className="wrapper">
        <div className="card">
          <div className="header">
            <h1 className="title">Générer un reçu PDF</h1>
            <button className="btn" onClick={logout} style={{width:"auto", padding:"8px 12px"}}>Se déconnecter</button>
          </div>
          <p className="subtitle">
            Adresse : {ASSOCIATION_ADDRESS} • Objet de l'association : {ASSOCIATION_OBJECT}
          </p>

          <div className="form">
            <div>
              <label className="label" htmlFor="donor">Nom du donateur</label>
              <input id="donor" className="input" type="text" value={donor} onChange={(e)=>setDonor(e.target.value)} placeholder="ex. Jean Dupont" />
            </div>

            <div className="row">
              <div>
                <label className="label" htmlFor="amount">Montant (€)</label>
                <input id="amount" className="input" type="number" inputMode="decimal" value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="ex. 50" />
              </div>
              <div>
                <label className="label" htmlFor="email">Email du donateur</label>
                <input id="email" className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="ex. jean@mail.com" />
              </div>
            </div>

            <div className="row">
              <div>
                <label className="label" htmlFor="donationDate">Date du don</label>
                <input id="donationDate" className="input" type="date" value={donationDate} onChange={(e)=>setDonationDate(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="paymentMethod">Mode de paiement</label>
                <select id="paymentMethod" className="input" value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)}>
                  <option value="CB">Carte bancaire (CB)</option>
                  <option value="Virement">Virement</option>
                  <option value="Espece">Espèce</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="signer">Signature (choisir une option)</label>
              <select id="signer" className="input" value={signerName} onChange={(e)=>setSignerName(e.target.value)}>
                {SIGNATURE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <div style={{fontSize:12, color:"#6b7280", marginTop:4}}>Connecté en tant que : {user?.email}</div>
              <div style={{fontSize:12, color:"#6b7280", marginTop:4}}>Connecté en tant que : {user?.email}</div>
            </div>

            <div className="note" style={{marginTop:8}}>
              {DON_PURPOSE}
            </div>

            <div className="actions">
              <button className="btn" onClick={generateReceipt} disabled={loading}>
                {loading ? "Traitement…" : "Générer le reçu"}
              </button>
            </div>

            <div className="note">
              Astuce : sur iPhone, ajoute la page à l’écran d’accueil pour un accès rapide.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
