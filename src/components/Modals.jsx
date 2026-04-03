import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { C, LVL_LABEL } from "../lib/constants";
import { Confetti } from "./SharedUI";
import { useT } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { useToast } from "../lib/ToastContext";
import { err as logErr } from "../lib/logger";

// certGenerator ładowany tylko gdy użytkownik klika "Pobierz PDF"
// dzięki temu @react-pdf/renderer (~1.5MB) nie trafia do głównego bundla
async function loadAndGenerate(args) {
  const { generateCertificate } = await import("../lib/certGenerator");
  return generateCertificate(args);
}

const LOGO_URL = "/logo.png";

/* ─── PORTAL WRAPPER ─────────────────────────────────────────────────────── */
// Renderuje dzieci bezpośrednio w document.body — omija overflow:hidden rodzica
// i naprawia position:fixed na iOS Safari wewnątrz app-container.
function Portal({ children }) {
  return createPortal(children, document.body);
}

export function CelebModal({ entry, onClose }) {
  const T = useT();
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), 30); }, []);
  return (
    <Portal>
      <Confetti active={vis}/>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20,fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}} onClick={onClose}>
        <div style={{background:C.white,width:"100%",maxWidth:340,overflow:"hidden",transition:"all .4s cubic-bezier(.175,.885,.32,1.275)",transform:vis?"scale(1)":"scale(.85)",opacity:vis?1:0,boxShadow:"0 20px 60px rgba(0,0,0,.35)"}} onClick={e => e.stopPropagation()}>
          <div style={{height:5,background:C.green}}/>
          <div style={{fontSize:48,textAlign:"center",padding:"24px 0 8px"}}>🏆</div>
          <div style={{textAlign:"center",fontSize:28,fontWeight:700,color:C.black}}>Gratulacje!</div>
          <div style={{textAlign:"center",fontSize:13,color:C.greyMid,marginTop:4,marginBottom:20}}>{T.training_done_sub}</div>
          <div style={{margin:"0 24px 16px",background:C.greyBg,padding:"14px 16px",borderLeft:`4px solid ${C.green}`}}>
            <div style={{fontSize:15,fontWeight:700,color:C.black}}>{entry.training.title}</div>
            <div style={{fontSize:12,color:C.greyMid,marginTop:4}}>{entry.training.category} · {entry.training.duration}</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",margin:"0 24px 16px"}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.greyMid}}>DATA SZKOLENIA</span>
            <span style={{fontSize:13,fontWeight:600,color:C.greyDk,fontFamily:"monospace"}}>{entry.date}</span>
          </div>
          <div style={{margin:"0 24px 20px",border:`1px solid ${C.green}`,background:"rgba(138,183,62,.08)",padding:"10px 20px",textAlign:"center",color:C.greenDk,fontWeight:700,fontSize:13,letterSpacing:3}}>✓ &nbsp; ZALICZONE</div>
          <button style={{display:"block",width:"calc(100% - 48px)",margin:"0 24px 24px",background:C.black,border:"none",color:C.white,padding:15,fontSize:15,fontWeight:600,cursor:"pointer"}} onClick={onClose}>Kontynuuj</button>
        </div>
      </div>
    </Portal>
  );
}

/* ─── CERT MODAL ─────────────────────────────────────────────────────────── */
export function CertModal({ entry, user, onClose }) {
  const T = useT();
  const { addToast } = useToast();
  const { token } = useUser();
  const [generating, setGenerating] = useState(false);
  const [certId, setCertId] = useState("…");
  const sub = [user.displayRole, user.firma].filter(Boolean).join(" · ");

  // Generowanie numeru certyfikatu — async (HMAC-SHA256)
  // Format: CCYDDDTSSSSS (12 znaków)
  // CC=nr szkolenia, Y=rok(litera), DDD=dzień roku, T=trener, SSSSS=podpis HMAC
  useEffect(() => {
    let cancelled = false;
    const trainerNum = parseInt(entry.key?.slice(-1)) || 1;
    import("../lib/certId").then(({ generateCertId }) =>
      generateCertId({
        trainingId: entry.training.id,
        date:       entry.date,
        trainer:    trainerNum,
        uid:        user.id || "",
      })
    ).then(id => {
      if (!cancelled) setCertId(id);
    }).catch(() => {
      if (!cancelled) setCertId("ERR");
    });
    return () => { cancelled = true; };
  }, [entry.training.id, entry.date, entry.key, user.id]);

  async function downloadPDF() {
    setGenerating(true);
    try {
      await loadAndGenerate({
        participantName: user.displayName,
        trainingTitle:   entry.training.title,
        parsedCode: {
          trainerNum: parseInt(entry.key?.slice(-1)) || 1,
          date:       entry.date,
          prefix:     entry.training.id,
          duration:   entry.training.duration,
        },
        token: token,
      });
    } catch(e) {
      logErr("Błąd generowania certyfikatu:", e);
      addToast(T.cert_error + e.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Portal>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:"16px",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}} onClick={onClose}>
        <div style={{background:C.white,width:"100%",maxWidth:390,maxHeight:"92dvh",overflowY:"auto",borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,.4)"}} onClick={e => e.stopPropagation()}>
          <div style={{background:C.darkHdr,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"16px 16px 0 0"}}>
            <div>
              <img src={LOGO_URL} alt="ENGEL" style={{height:22,mixBlendMode:"screen"}}/>
              <div style={{color:"#aaa",fontSize:10,marginTop:2,letterSpacing:2}}>CERTYFIKAT UKOŃCZENIA</div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:18,cursor:"pointer",opacity:.7}}>✕</button>
          </div>
          <div style={{height:3,background:C.green}}/>
          <div style={{padding:24}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6}}>UCZESTNIK</div>
            <div style={{fontSize:20,fontWeight:700,color:C.black}}>{user.displayName}</div>
            {sub && <div style={{fontSize:12,color:C.greyDk,marginTop:3}}>{sub}</div>}
            <div style={{height:1,background:C.grey,margin:"16px 0"}}/>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6}}>SZKOLENIE</div>
            <div style={{fontSize:16,fontWeight:700,color:C.black}}>{entry.training.title}</div>
            <div style={{fontSize:12,color:C.greyDk,marginTop:3}}>{entry.training.category} · {LVL_LABEL[entry.training.level]} · {entry.training.duration}</div>
            <div style={{height:1,background:C.grey,margin:"16px 0"}}/>
            <div style={{display:"flex",gap:32}}>
              <div><div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.greyMid,marginBottom:4}}>DATA</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:600}}>{entry.date}</div></div>
              <div><div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.greyMid,marginBottom:4}}>NR CERTYFIKATU</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:600}}>{certId}</div></div>
            </div>
            {entry.trainer && (
              <>
                <div style={{height:1,background:C.grey,margin:"16px 0"}}/>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6}}>TRENER</div>
                <div style={{fontSize:15,fontWeight:700,color:C.black}}>{entry.trainer}</div>
              </>
            )}
          </div>
          <div style={{borderTop:`1px solid ${C.grey}`,padding:"12px 24px",display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={onClose}
              style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"12px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              Zamknij
            </button>
            <button onClick={downloadPDF} disabled={generating}
              style={{background:generating?C.greyDk:C.green,border:"none",color:C.white,padding:"12px 24px",fontSize:13,fontWeight:600,cursor:generating?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8}}>
              {generating
                ? <><span style={{width:14,height:14,border:"2px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/> Generuję...</>
                : <>📄 Pobierz PDF</>
              }
            </button>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    </Portal>
  );
}
