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
        <div className="logo">Q</div>
        <div className="brandtitle">Mosquée Quba — Accès sécurisé</div>
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
  const [loading, setLoading] = useState(false);

  // Session
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (u) {
        // Vérifie si l'UID est dans admins
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
          <div className="logo">Q</div>
          <div className="brandtitle">Mosquée Quba — Accès sécurisé</div>
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

    if (!donorTrim || !amount || !emailTrim) return alert("Merci de remplir toutes les informations");
    if (!isValidEmail(emailTrim)) return alert("Adresse e-mail invalide.");
    const amountNumber = Number(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) return alert("Montant invalide.");

    setLoading(true);
    try {
      // Numéro
      const number = await runTransaction(db, async (tx) => {
        const counterRef = doc(db, "counters", "receipts");
        const snap = await tx.get(counterRef);
        if (!snap.exists()) { tx.set(counterRef, { value: 1 }); return 1; }
        const next = (snap.data().value || 0) + 1; tx.update(counterRef, { value: next }); return next;
      });

  // PDF (mise en page améliorée jsPDF pur)
const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
const pageW = pdf.internal.pageSize.getWidth();
const margin = 18;
const now = new Date();
const frDate = now.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });

// Helpers
const fmtAmount = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const pad = (n) => String(n).padStart(5, "0");

// En-tête
pdf.setFont("helvetica", "bold");
pdf.setFontSize(12);
pdf.text("Association cultuelle – Mosquée Quba", margin, 16);
pdf.setFont("helvetica", "normal");
pdf.setFontSize(10);
pdf.text("2 Place Victor Hugo, 95400 Villiers-le-Bel", margin, 22);

// Titre
pdf.setDrawColor(0);
pdf.setLineWidth(0.6);
pdf.line(margin, 28, pageW - margin, 28);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(18);
pdf.text("REÇU DE DON", pageW / 2, 40, { align: "center" });

// Cadre infos principales
const boxTop = 48;
const boxH = 30;
pdf.setLineWidth(0.3);
pdf.rect(margin, boxTop, pageW - margin * 2, boxH);

pdf.setFont("helvetica", "bold");
pdf.setFontSize(11);
pdf.text("Reçu N° :", margin + 6, boxTop + 10);
pdf.text("Date :", margin + 6, boxTop + 20);

pdf.setFont("helvetica", "normal");
pdf.text(pad(number), margin + 40, boxTop + 10);
pdf.text(frDate, margin + 40, boxTop + 20);

// Donateur & Montant
const infoTop = boxTop + boxH + 12;
pdf.setFont("helvetica", "bold");
pdf.setFontSize(11);
pdf.text("Donateur :", margin, infoTop);
pdf.text("Montant :", margin, infoTop + 10);

pdf.setFont("helvetica", "normal");
pdf.setFontSize(11);
pdf.text(donorTrim, margin + 28, infoTop);
pdf.text(fmtAmount(amountNumber), margin + 28, infoTop + 10);

// Message / mentions
const msgTop = infoTop + 24;
pdf.setFont("helvetica", "normal");
pdf.setFontSize(10);
pdf.text(
  "Merci pour votre soutien. Ce reçu atteste la perception du don mentionné ci-dessus.",
  margin,
  msgTop
);

// Signature (optionnelle)
const sigTop = msgTop + 20;
pdf.setFont("helvetica", "bold");
pdf.text("Signature / Cachet :", margin, sigTop);
pdf.setLineWidth(0.2);
pdf.rect(margin, sigTop + 4, pageW - margin * 2, 22);

// Pied de page
const footerY = 287;
pdf.setFont("helvetica", "normal");
pdf.setFontSize(8);
pdf.text(
  `Document généré automatiquement le ${frDate} – Reçu N° ${pad(number)}`,
  pageW / 2,
  footerY,
  { align: "center" }
);

// Sortie blob + nommage fichier
const fileName = `recu_quba_${pad(number)}_${now.toISOString().slice(0,10)}.pdf`;
const pdfBlob = pdf.output("blob");
try { pdf.save(fileName); } catch {/* fallback géré plus bas */}


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
          donor: donorTrim, amount: amountNumber, email: emailTrim,
          number, date: new Date().toISOString(), createdAt: serverTimestamp(),
          fileUrl: fileUrl || null, uid: user.uid,
        });
      } catch (e) { console.error("Erreur enregistrement reçu:", e); }

      // Pièce jointe base64
      const pdfBase64 = await blobToBase64(pdfBlob);
      await sleep(200);

      // Mail avec PJ PDF
      await addDoc(collection(db, "mail"), {
        to: [emailTrim, "aslan.saqibi@gmail.com"],
        message: {
          subject: `Reçu Mosquée Quba N°${number}`,
          text: `Cher ${donorTrim},

Merci pour votre don de ${amountNumber.toFixed(2)} €.

Veuillez trouver votre reçu en pièce jointe.

Mosquée Quba`,
          html: `
            <p>Cher ${donorTrim},</p>
            <p>Merci pour votre don de <strong>${amountNumber.toFixed(2)} €</strong>.</p>
            <p>Veuillez trouver votre reçu en pièce jointe.</p>
            <p>Mosquée Quba</p>
          `,
          attachments: [
            { filename: fileName, content: pdfBase64, encoding: "base64", contentType: "application/pdf" },
          ],
        },
      });

      setDonor(""); setAmount(""); setEmail("");
      alert("✅ Reçu généré et envoyé avec la pièce jointe PDF.");
    } catch (e) {
      console.error("Erreur:", e);
      alert(`❌ Erreur: ${e.code || ""} ${e.message || e}`);
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="brandbar">
        <div className="logo">Q</div>
        <div className="brandtitle">Mosquée Quba — Reçus de dons (admin)</div>
      </div>

      <div className="wrapper">
        <div className="card">
          <div className="header">
            <h1 className="title">Générer un reçu PDF</h1>
            <button className="btn" onClick={logout} style={{width:"auto", padding:"8px 12px"}}>Se déconnecter</button>
          </div>
          <p className="subtitle">Remplissez les informations puis cliquez sur “Générer le reçu”.</p>

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
