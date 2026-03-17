import { useState, useEffect } from "react";
import { C } from "../lib/constants";
import { auth, db, session } from "../lib/supabase";
import { generateLogin } from "../lib/helpers";
import { ClipboardSvg, Field, Header } from "./SharedUI";
import { useT, useLang } from "../lib/LangContext";

export function LoginScreen({ onLogin }) {
  const T = useT();
  const { lang, switchLang } = useLang();
  const [mode, setMode] = useState("login");
  return (
    <div className="app-container" style={{height:"100%",display:"flex",flexDirection:"column",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",overflow:"hidden",background:C.greyBg}}>
      <Header/>
      <div style={{background:C.greyBanner,borderBottom:`1px solid #D0D3D6`,padding:"11px 20px",textAlign:"center"}}>
        <strong style={{display:"block",fontSize:15,color:C.black,marginBottom:2}}>ENGEL Expert Academy</strong>
        <span style={{fontSize:13,color:C.greyDk}}>by Damian Świderski</span>
      </div>
      <div className="app-content" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 24px 40px",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <ClipboardSvg/>
        <div style={{display:"flex",gap:6,marginBottom:12,justifyContent:"center"}}>
          {["pl","en"].map(l => <button key={l} onClick={() => switchLang(l)} style={{padding:"4px 14px",fontSize:12,fontWeight:700,border:`1px solid ${lang===l?C.black:C.grey}`,background:lang===l?C.black:C.white,color:lang===l?C.white:C.greyMid,cursor:"pointer"}}>{l.toUpperCase()}</button>)}
        </div>
        <div style={{width:"100%",maxWidth:340,marginTop:8}}>
          {mode === "recover"
            ? <RecoverForm onBack={() => setMode("login")}/>
            : <AuthForm mode={mode} setMode={setMode} onLogin={onLogin}/>
          }
        </div>
      </div>
    </div>
  );
}

const LS_REMEMBER_KEY = "eea_remember";

export function AuthForm({ mode, setMode, onLogin }) {
  const T = useT();
  const [email,    setEmail]    = useState("");
  const [pass,     setPass]     = useState("");
  const [remember, setRemember] = useState(false);
  const [name,     setName]     = useState("");
  const [genLogin, setGenLogin] = useState("");
  const [err,      setErr]      = useState("");
  const [info,     setInfo]     = useState("");
  const [shake,    setShake]    = useState(false);
  const [loading,  setLoading]  = useState(false);

  // Wczytaj preferencję checkboxa + email z zapisanej sesji
  useEffect(() => {
    const savedRemember = localStorage.getItem(LS_REMEMBER_KEY) === "true";
    setRemember(savedRemember);
    if (savedRemember) {
      const saved = session.load();
      if (saved?.user?.email) setEmail(saved.user.email);
    }
  }, []);

  function sw(m) { setMode(m); setErr(""); setInfo(""); }
  useEffect(() => {
    setGenLogin(name.trim().split(/\s+/).length >= 2 ? generateLogin(name) : "");
  }, [name]);

  async function doLogin() {
    if (!email.trim() || !pass) { setErr("Wypełnij wszystkie pola"); return; }
    setLoading(true); setErr("");
    try {
      const s = await auth.signIn(email.trim().toLowerCase(), pass);

      if (remember) {
        // Zapisz pełną sesję — access_token + refresh_token
        localStorage.setItem(LS_REMEMBER_KEY, "true");
        session.save(s.access_token, s.refresh_token, s.user);
      } else {
        localStorage.removeItem(LS_REMEMBER_KEY);
        session.clear();
      }

      onLogin({
        id:          s.user.id,
        accessToken: s.access_token,
        email:       s.user.email,
      });
    } catch(e) {
      setErr(e.message || "Błąd logowania");
      setShake(true); setTimeout(() => setShake(false), 400);
    } finally { setLoading(false); }
  }

  async function doRegister() {
    if (!email.trim() || !pass) { setErr("E-mail i hasło są wymagane"); return; }
    if (pass.length < 6) { setErr("Hasło musi mieć co najmniej 6 znaków"); return; }
    if (!email.includes("@")) { setErr("Podaj poprawny adres e-mail"); return; }
    setLoading(true); setErr("");
    try {
      const result = await auth.signUp(email.trim().toLowerCase(), pass);
      if (!result.user) throw new Error("Błąd tworzenia konta");

      const emailName = email.trim().split("@")[0];
      await db.insert(result.access_token, "profiles", {
        id: result.user.id,
        login: emailName,
        name: emailName,
        role: null,
        firma: null,
        active_groups: ["tech","ur","maszyny"],
        notif_reminder: true,
        notif_cert: true,
      }).catch(() => {}); // profil może już istnieć — ignoruj duplikat

      setInfo("Konto utworzone! Możesz się teraz zalogować.");
      sw("login"); setEmail(email); setPass("");
    } catch(e) {
      const msg = e.message || "";
      if (msg.includes("already registered") || msg.includes("User already registered")) {
        setErr("Konto z tym adresem e-mail już istnieje. Zaloguj się lub zresetuj hasło.");
      } else {
        setErr(msg || "Błąd rejestracji");
      }
    }
    finally { setLoading(false); }
  }

  return (
    <>
      <div style={{display:"flex"}}>
        {[["login",T.login_btn],["register",T.register_btn]].map(([m,l]) => (
          <button key={m} onClick={() => sw(m)}
            style={{flex:1,padding:"12px",background:mode===m?C.black:C.white,color:mode===m?C.white:C.greyDk,border:`1px solid ${mode===m?C.black:C.grey}`,fontSize:14,fontWeight:600,cursor:"pointer"}}>
            {l}
          </button>
        ))}
      </div>
      <div style={{background:C.white,padding:24,boxShadow:"0 1px 6px rgba(0,0,0,.1)",animation:shake?"shake .35s ease":"none"}}>
        <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}`}</style>
        {info && <div style={{background:C.greenBg,border:`1px solid ${C.green}`,color:C.greenDk,fontSize:13,padding:"10px 14px",marginBottom:16,lineHeight:1.5}}>{info}</div>}

        {mode === "login" ? (
          <>
            <Field label={T.email_label} type="email" value={email} onChange={v => { setEmail(v); setErr(""); }} placeholder="np. jan@firma.pl"/>
            <Field label={T.password_label} type="password" value={pass} onChange={v => { setPass(v); setErr(""); }} placeholder="••••••"/>

            {/* ── Checkbox T.login_btn === "Sign in" ? "Remember me" : "Zapamiętaj mnie" ── */}
            <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,cursor:"pointer",userSelect:"none"}}>
              <div onClick={() => setRemember(r => !r)} style={{
                width:20, height:20, flexShrink:0,
                border:`2px solid ${remember ? C.green : C.greyMid}`,
                background: remember ? C.green : C.white,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all .15s",
              }}>
                {remember && <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                  <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>}
              </div>
              <span style={{fontSize:13,color:C.greyDk}} onClick={() => setRemember(r => !r)}>
                Zapamiętaj mnie
              </span>
            </label>

            {err && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}
            <button style={{width:"100%",background:loading?C.greyDk:C.black,border:"none",color:C.white,padding:15,fontSize:15,fontWeight:600,cursor:loading?"not-allowed":"pointer",marginBottom:12}}
              onClick={doLogin} disabled={loading}>{loading ? T.logging_in : T.login_btn}</button>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.greyMid}}>
              <span>Nie masz konta? <span style={{color:C.black,fontWeight:700,cursor:"pointer",textDecoration:"underline"}} onClick={() => sw("register")}>Zarejestruj się</span></span>
              <span style={{color:C.black,fontWeight:600,cursor:"pointer",textDecoration:"underline"}} onClick={() => setMode("recover")}>Zapomniałem hasła</span>
            </div>
          </>
        ) : (
          <>
            <Field label={T.email_label + " *"} type="email" value={email} onChange={v => { setEmail(v); setErr(""); }} placeholder="np. jan@firma.pl"/>
            <Field label={T.password_label + " *"} type="password" value={pass} onChange={v => { setPass(v); setErr(""); }} placeholder="min. 6 znaków"/>
            {err && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}
            <button style={{width:"100%",background:loading?C.greyDk:C.black,border:"none",color:C.white,padding:15,fontSize:15,fontWeight:600,cursor:loading?"not-allowed":"pointer",marginBottom:12}}
              onClick={doRegister} disabled={loading}>{loading ? "Rejestracja..." : T.register}</button>
            <div style={{textAlign:"center",fontSize:12,color:C.greyMid}}>Masz już konto? <span style={{color:C.black,fontWeight:700,cursor:"pointer",textDecoration:"underline"}} onClick={() => sw("login")}>Zaloguj się</span></div>
          </>
        )}
      </div>
    </>
  );
}

/* ─── RECOVER FORM ───────────────────────────────────────────────────────── */
export function RecoverForm({ onBack }) {
  const T = useT();
  const [email,   setEmail]   = useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  async function send() {
    if (!email.trim() || !email.includes("@")) { setErr("Podaj poprawny adres e-mail"); return; }
    setLoading(true); setErr("");
    try {
      await auth.recover(email.trim().toLowerCase());
      setDone(true);
    } catch(e) { setErr(e.message || "Błąd — spróbuj ponownie"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.greyDk,fontSize:22,padding:0}}>←</button>
        <span style={{fontSize:16,fontWeight:700,color:C.black}}>Odzyskiwanie hasła</span>
      </div>
      <div style={{background:C.white,padding:24,boxShadow:"0 1px 6px rgba(0,0,0,.1)"}}>
        {done ? (
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{fontSize:40,marginBottom:12}}>📧</div>
            <div style={{fontSize:16,fontWeight:700,color:C.black,marginBottom:8}}>E-mail wysłany!</div>
            <div style={{fontSize:13,color:C.greyDk,lineHeight:1.6,marginBottom:20}}>Sprawdź skrzynkę <strong>{email}</strong> i kliknij link do resetowania hasła.</div>
            <button style={{width:"100%",background:C.black,border:"none",color:C.white,padding:14,fontSize:14,fontWeight:600,cursor:"pointer"}} onClick={onBack}>Wróć do logowania</button>
          </div>
        ) : (
          <>
            <div style={{fontSize:13,color:C.greyDk,lineHeight:1.6,marginBottom:20}}>
              Podaj adres e-mail podany podczas rejestracji. Wyślemy link do resetowania hasła.
            </div>
            <Field label="E-MAIL" type="email" value={email} onChange={v => { setEmail(v); setErr(""); }} placeholder="np. jan@firma.pl"/>
            {err && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}
            <button style={{width:"100%",background:loading?C.greyDk:C.black,border:"none",color:C.white,padding:14,fontSize:14,fontWeight:600,cursor:loading?"not-allowed":"pointer"}}
              onClick={send} disabled={loading}>{loading ? T.sending : T.reset_btn}</button>
          </>
        )}
      </div>
    </>
  );
}