import { useT } from "../lib/LangContext";
import { C } from "../lib/constants";

export function TabBar({ tab, setTab, completedCount, msgCount }) {
  const T = useT();
  const tabs = [
    [T.tab_trainings,"▦"],
    [T.tab_catalog,"⊞"],
    [T.tab_schedule,"📅"],
    [T.tab_messages,"✉"],
    [T.tab_profile,"⚙"],
  ];
  return (
    <div className="tabbar" style={{display:"flex",background:C.white,borderTop:`1px solid ${C.grey}`,flexShrink:0}}>
      {tabs.map(([label,icon],i) => (
        <button key={i} style={{flex:1,background:"none",border:"none",borderTop:`3px solid ${tab===i?C.green:"transparent"}`,padding:"8px 2px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",position:"relative"}} onClick={() => setTab(i)}>
          {i===0 && completedCount>0 && <div style={{position:"absolute",top:4,right:"calc(50% - 16px)",background:C.green,color:C.white,borderRadius:"50%",width:15,height:15,fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{completedCount}</div>}
          {i===3 && msgCount>0 && <div style={{position:"absolute",top:4,right:"calc(50% - 16px)",background:C.red,color:C.white,borderRadius:"50%",width:15,height:15,fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{msgCount}</div>}
          <span style={{fontSize:16,color:tab===i?C.black:C.greyMid}}>{icon}</span>
          <span style={{fontSize:10,fontWeight:600,color:tab===i?C.black:C.greyMid,letterSpacing:.2}}>{label}</span>
        </button>
      ))}
    </div>
  );
}
