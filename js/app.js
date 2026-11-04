const STORAGE_KEY = "myDokiDoki.v1";
const SELECT_HINT_VERSION = 1;
const DOCUMENT_TEMPLATES = ["dplate","discplate","soul","csat"];

const state = {
  activeTemplate: "dplate",
  theme: "forest",
  sidebarCollapsed: false,
  sidebarWidth: null,
  includeWoFields: false,
  sections: { pinned: true, bookmarked: true },
  currentDocId: null,
  currentBookmarkId: null,
  draft: emptyDraft(),
  templateDrafts: {},
  pins: [],
  bookmarks: []
};

let actionAudioContext=null;
let bookmarkPointerDrag=null;
let bookmarkAutoScrollTimer=null;
let suppressBookmarkClick=false;
let stopwatchElapsed=0;
let stopwatchStartedAt=null;
let stopwatchTimer=null;

function emptyDraft(){
  return {
    carNumber:"",
    description:"",
    previousActions:"",
    troubleshooting:"",
    missionType:"",
    vehicleLocation:"",
    vehicleSW:"",
    vehiclePlatform:"",
    vehicleAssignment:"",
    geo:"",
    problemWhen:"",
    carDoing:"",
    nrr:"",
    logFile:"",
    recommendations:"",
    csat:"",
    ldap:"",
    resourcedUsed:"",
    carman:"",
    endResult:""
  };
}

function emptyDiscDraft(){
  return {
    carNumber:"",
    description:"",
    troubleshooting:"",
    nrr:"",
    logFile:"",
    geo:"",
    missionType:"",
    vehiclePlatform:"",
    vehicleLocation:"",
    endResult:"",
    ldap:"",
    resourcedUsed:""
  };
}

function emptySoulDraft(){
  return {
    description:"",
    troubleshooting:"",
    geo:"",
    task:"",
    shift:"",
    endResult:"",
    ldap:"",
    csat:"",
    resourcedUsed:""
  };
}

function emptyCsatDraft(){
  return {
    messageType:"regular",
    operatorName:"",
    csatCarNumber:"",
    woId:"",
    techDepotLocation:"",
    caseNumber:""
  };
}

function emptyDraftFor(template){
  if(template==="discplate") return emptyDiscDraft();
  if(template==="soul") return emptySoulDraft();
  if(template==="csat") return emptyCsatDraft();
  return emptyDraft();
}

const options = {
  missionType:["ADC","MDC","RO"],
  vehicleLocation:["Startup","Infield"],
  vehiclePlatform:["APOLLO","LIBERTY","W12"],
  geo:["Atlanta","Austin","Dallas","Denver","Detroit","Houston","Las Vegas","London","Los Angeles","Miami","Mountain View","Nashville","New Orleans","New York","Orlando","Philadelphia","Phoenix","Pittsburgh","San Antonio","San Diego","San Francisco","Seattle","Tampa","Tokyo","Washington DC"],
  endResult:["resolved","resolved_while_on_call","hand_off_to_tech","in_progress_pc_included","in_progress","continue_as_before"]
};

const techDepots = {
  "Los Angeles":["Granville (Liberty)","Santa Fe (W12)"],
  "San Francisco":["Toland","Mission St","14 street","Pacific Ave"],
  "Mountain View":["Rails - Robot Garage"],
  Phoenix:["Mesa Service Center","3rd Street","EdgeConnex"],
  Austin:["Stassney"],
  Atlanta:["Plymouth"],
  "San Antonio":["Eissenhauer"],
  Orlando:["S Orange"],
  Dallas:["WeWork / Mockingbird"],
  Houston:["Cavalcade"],
  Miami:["Terrace"],
  Tokyo:["Minato / Jari"],
  London:["Autonation - Willen Field"],
  Nashville:["Harding"],
  "Las Vegas":["Post Road"],
  "Washington DC":["U-line Arena"],
  "San Diego":["Anna Ave"]
};

const themes = ["forest","ocean","lavender","sunset","nocturne","porcelain","abyss"];

function load(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved) Object.assign(state,saved);
  }catch(e){}
  delete state.notes;
  state.sections={pinned:true,bookmarked:true,...(state.sections || {})};
  delete state.sections.notes;
  state.pins=Array.isArray(state.pins)?state.pins:[];
  state.bookmarks=Array.isArray(state.bookmarks)?state.bookmarks:[];
  if(!state.bookmarks.some(item=>item.id===state.currentBookmarkId)) state.currentBookmarkId=null;
  if(!themes.includes(state.theme)) state.theme="forest";
  if(state.activeTemplate==="disconnected") state.activeTemplate="discplate";
  if(!DOCUMENT_TEMPLATES.includes(state.activeTemplate)) state.activeTemplate="dplate";
  const savedDrafts=state.templateDrafts || {};
  state.templateDrafts={
    dplate:{...emptyDraft(),...(savedDrafts.dplate || state.draft || {})},
    discplate:{...emptyDiscDraft(),...(savedDrafts.discplate || {})},
    soul:{...emptySoulDraft(),...(savedDrafts.soul || {})},
    csat:{...emptyCsatDraft(),...(savedDrafts.csat || {})}
  };
  if(!["regular","withWo","withWoTechDepot"].includes(state.templateDrafts.csat.messageType)){
    state.templateDrafts.csat.messageType="regular";
  }
  if(state.selectHintVersion!==SELECT_HINT_VERSION){
    ["geo","missionType","vehiclePlatform","vehicleLocation","endResult"].forEach(key=>{
      if(state.templateDrafts.discplate[key]==="N/A") state.templateDrafts.discplate[key]="";
    });
    ["geo","endResult"].forEach(key=>{
      if(state.templateDrafts.soul[key]==="N/A") state.templateDrafts.soul[key]="";
    });
    state.selectHintVersion=SELECT_HINT_VERSION;
  }
  if(DOCUMENT_TEMPLATES.includes(state.activeTemplate)){
    state.draft=state.templateDrafts[state.activeTemplate];
  }else{
    state.draft=state.templateDrafts.dplate;
  }
  persist();
  render();
}
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}

function sidebarWidthLimits(){
  return {
    min:window.innerWidth<=850 ? 200 : 240,
    max:Math.max(window.innerWidth<=850 ? 200 : 240,Math.min(600,window.innerWidth-280))
  };
}
function applySidebarWidth(width=state.sidebarWidth){
  const sidebar=document.getElementById("sidebar");
  const limits=sidebarWidthLimits();
  if(!Number.isFinite(width)){
    sidebar.style.removeProperty("width");
    sidebar.style.removeProperty("min-width");
    width=sidebar.getBoundingClientRect().width;
  }else{
    width=Math.min(limits.max,Math.max(limits.min,width));
    state.sidebarWidth=width;
    sidebar.style.width=`${width}px`;
    sidebar.style.minWidth=`${width}px`;
  }
  updateSidebarResizeAria(width,limits);
}
function updateSidebarResizeAria(width=state.sidebarWidth,limits=sidebarWidthLimits()){
  const resizeHandle=document.getElementById("sidebarResizeHandle");
  resizeHandle.setAttribute("aria-valuemin",String(limits.min));
  resizeHandle.setAttribute("aria-valuemax",String(limits.max));
  resizeHandle.setAttribute("aria-valuenow",String(Math.round(width)));
}
function setSidebarCollapsed(collapsed){
  const sidebar=document.getElementById("sidebar");
  if(collapsed){
    if(!Number.isFinite(state.sidebarWidth)) state.sidebarWidth=sidebar.getBoundingClientRect().width;
    sidebar.classList.add("collapsed");
    sidebar.style.width="0px";
    sidebar.style.minWidth="0px";
    const limits=sidebarWidthLimits();
    state.sidebarWidth=Math.min(limits.max,Math.max(limits.min,state.sidebarWidth));
    updateSidebarResizeAria();
  }else{
    sidebar.classList.remove("collapsed");
    applySidebarWidth();
  }
  const toggle=document.getElementById("sidebarToggle");
  toggle.title=collapsed?"Expand sidebar":"Collapse sidebar";
  toggle.setAttribute("aria-label",toggle.title);
  toggle.setAttribute("aria-expanded",String(!collapsed));
}

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function field(key,label,placeholder="",large=false){
  const value=esc(state.draft[key]);
  return `<div class="field">
    <textarea class="field-control ${large?"large":""}" data-key="${key}" placeholder="${esc(placeholder || label)}" rows="1">${value}</textarea>
  </div>`;
}
function fixedField(label,value){
  return `<div class="field">
    <label class="field-label">${esc(label)}</label>
    <textarea class="field-control fixed-field" rows="1" readonly>${esc(value)}</textarea>
  </div>`;
}
function textField(key,placeholder){
  const value=esc(state.draft[key]);
  return `<textarea class="field-control" data-key="${key}" placeholder="${esc(placeholder)}" rows="1">${value}</textarea>`;
}
function selectField(key,items,showTitleHint=true,hintTitle=""){
  const value=state.draft[key] || "";
  const title=hintTitle || key.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase());
  return `<div class="select-wrap"><select data-key="${key}">
    ${showTitleHint?`<option value="" hidden ${value?"":"selected"}>${esc(title)}</option>`:""}
    ${items.map(x=>`<option value="${esc(x)}" ${x===value?"selected":""}>${esc(x)}</option>`).join("")}
  </select></div>`;
}

function render(){
  applyTheme(state.theme);
  setSidebarCollapsed(state.sidebarCollapsed);
  renderSidebar();
  renderTabs();
  renderPanel();
}
function applyTheme(theme){
  document.documentElement.dataset.theme=themes.includes(theme) ? theme : "forest";
  const picker=document.getElementById("themePicker");
  if(picker) picker.value=document.documentElement.dataset.theme;
}
function renderSidebar(){
  const p=document.getElementById("pinnedList");
  p.innerHTML=state.sections.pinned ? (state.pins.length ? state.pins.map(doc=>`
    <div class="side-item pin-item" data-pin="${doc.id}">
      <span class="item-title">${String(doc.carNumber || "").trim() ? `Car# ${esc(String(doc.carNumber).trim())}` : esc(String(doc.template || "Document").toUpperCase())}</span>
      <button class="delete-pin" data-delete-pin="${doc.id}" title="Delete pinned doc" aria-label="Delete pinned doc">×</button>
    </div>`).join("") : `<div class="empty-list">No pinned docs yet</div>`) : "";

  const b=document.getElementById("bookmarksList");
  b.innerHTML=state.sections.bookmarked ? (state.bookmarks.length ? state.bookmarks.map(doc=>`
    <div class="side-item bookmark-item" data-bookmark="${doc.id}">
      <span class="bookmark-drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>
      <span class="item-title">${String(doc.carNumber || "").trim() ? `Car# ${esc(String(doc.carNumber).trim())}` : esc(String(doc.template || "Document").toUpperCase())}</span>
      <button class="delete-pin" data-delete-bookmark="${doc.id}" title="Remove bookmark" aria-label="Remove bookmark">×</button>
    </div>`).join("") : `<div class="empty-list">No bookmarks yet</div>`) : "";

  document.querySelectorAll(".section-toggle").forEach(btn=>{
    const key=btn.dataset.section;
    btn.classList.toggle("collapsed",!state.sections[key]);
    btn.closest(".side-section").classList.toggle("collapsed",!state.sections[key]);
  });
}

document.addEventListener("pointerdown",event=>{
  const handle=event.target.closest(".bookmark-drag-handle");
  if(!handle || event.button!==0) return;
  const item=handle.closest(".bookmark-item");
  if(!item) return;
  bookmarkPointerDrag={id:item.dataset.bookmark,handle,startY:event.clientY,active:false};
  handle.setPointerCapture(event.pointerId);
  event.preventDefault();
});
document.addEventListener("pointermove",event=>{
  if(!bookmarkPointerDrag) return;
  const drag=bookmarkPointerDrag;
  if(!drag.active && Math.abs(event.clientY-drag.startY)<4) return;
  drag.active=true;
  drag.clientX=event.clientX;
  drag.clientY=event.clientY;
  const list=document.getElementById("bookmarksList");
  const bounds=list.getBoundingClientRect();
  repositionBookmarkAtPoint(drag);
  const nearTop=event.clientX>=bounds.left && event.clientX<=bounds.right && event.clientY<bounds.top+14;
  const nearBottom=event.clientX>=bounds.left && event.clientX<=bounds.right && event.clientY>bounds.bottom-14;
  if((nearTop || nearBottom) && !bookmarkAutoScrollTimer){
    bookmarkAutoScrollTimer=setInterval(()=>{
      const current=bookmarkPointerDrag;
      if(!current) return;
      const currentBounds=list.getBoundingClientRect();
      const atTop=current.clientX>=currentBounds.left && current.clientX<=currentBounds.right && current.clientY<currentBounds.top+14;
      const atBottom=current.clientX>=currentBounds.left && current.clientX<=currentBounds.right && current.clientY>currentBounds.bottom-14;
      if(!atTop && !atBottom){
        clearInterval(bookmarkAutoScrollTimer);
        bookmarkAutoScrollTimer=null;
        return;
      }
      list.scrollTop+=atTop?-18:18;
      repositionBookmarkAtPoint(current);
    },50);
  }else if(!nearTop && !nearBottom && bookmarkAutoScrollTimer){
    clearInterval(bookmarkAutoScrollTimer);
    bookmarkAutoScrollTimer=null;
  }
});
document.addEventListener("pointerup",()=>{
  if(!bookmarkPointerDrag) return;
  const drag=bookmarkPointerDrag;
  bookmarkPointerDrag=null;
  if(bookmarkAutoScrollTimer){
    clearInterval(bookmarkAutoScrollTimer);
    bookmarkAutoScrollTimer=null;
  }
  if(!drag.active) return;
  const list=document.getElementById("bookmarksList");
  const sourceIndex=state.bookmarks.findIndex(item=>item.id===drag.id);
  if(sourceIndex>=0){
    const [moving]=state.bookmarks.splice(sourceIndex,1);
    let targetIndex=drag.targetId ? state.bookmarks.findIndex(item=>item.id===drag.targetId) : -1;
    if(targetIndex<0){
      targetIndex=drag.clientY<list.getBoundingClientRect().top+list.clientHeight/2 ? 0 : state.bookmarks.length;
    }else if(drag.after){
      targetIndex++;
    }
    state.bookmarks.splice(targetIndex,0,moving);
  }
  suppressBookmarkClick=true;
  setTimeout(()=>{suppressBookmarkClick=false},250);
  persist();
  renderSidebar();
});
document.addEventListener("pointercancel",()=>{
  if(!bookmarkPointerDrag) return;
  bookmarkPointerDrag=null;
  if(bookmarkAutoScrollTimer){
    clearInterval(bookmarkAutoScrollTimer);
    bookmarkAutoScrollTimer=null;
  }
  renderSidebar();
});
function repositionBookmarkAtPoint(drag){
  const list=document.getElementById("bookmarksList");
  const source=list.querySelector(`[data-bookmark="${CSS.escape(drag.id)}"]`);
  if(!source) return;
  source.classList.add("dragging");
  const hovered=document.elementFromPoint(drag.clientX,drag.clientY)?.closest(".bookmark-item");
  let target=hovered && hovered!==source ? hovered : null;
  if(!target){
    target=Array.from(list.querySelectorAll(".bookmark-item"))
      .filter(item=>item!==source)
      .find(item=>drag.clientY<item.getBoundingClientRect().top+item.offsetHeight/2);
    if(!target){
      const rows=Array.from(list.querySelectorAll(".bookmark-item")).filter(item=>item!==source);
      target=rows[rows.length-1] || null;
    }
  }
  list.querySelectorAll(".bookmark-item").forEach(item=>item.classList.remove("drop-before","drop-after"));
  if(!target){
    drag.targetId=null;
    drag.after=false;
    return;
  }
  const after=drag.clientY>target.getBoundingClientRect().top+target.offsetHeight/2;
  drag.targetId=target.dataset.bookmark;
  drag.after=after;
  target.classList.add(after?"drop-after":"drop-before");
}

function renderTabs(){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.template===state.activeTemplate));
}

function renderPanel(){
  const panel=document.getElementById("documentPanel");
  if(!DOCUMENT_TEMPLATES.includes(state.activeTemplate)){
    panel.className="document-panel coming-soon";
    panel.textContent="Coming Soon";
    return;
  }
  panel.className="document-panel";
  const activeSavedId=state.currentBookmarkId || state.currentDocId;
  const isBookmarked=!!activeSavedId && state.bookmarks.some(item=>item.id===activeSavedId);
  const isPinned=!!activeSavedId && state.pins.some(item=>item.id===activeSavedId);
  const actions=`
    <div class="actions">
      <div class="action-buttons">
        <button class="action-btn clear-btn" id="clearBtn" title="Clear fields" aria-label="Clear fields">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v6m4-6v6"/></svg>
        </button>
        ${state.activeTemplate==="csat"?"":`<button class="action-btn bookmark-btn${isBookmarked?" is-bookmarked":""}" id="bookmarkBtn" title="${isBookmarked?"Bookmark saved":"Bookmark document"}" aria-label="${isBookmarked?"Bookmark saved":"Bookmark document"}" aria-pressed="${isBookmarked}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-4-6 4V4.75Z"/></svg>
        </button>`}
        ${state.activeTemplate==="csat"?"":`<button class="action-btn pin-btn${isPinned?" is-pinned":""}" id="pinBtn" title="${isPinned?"Pinned":"Pin document"}" aria-label="${isPinned?"Pinned":"Pin document"}" aria-pressed="${isPinned}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1 5 3 3v2h-5l-1 8-1-8H6v-2l3-3-1-5Z"/></svg>
        </button>`}
        <button class="action-btn copy-btn" id="copyBtn" title="Copy ${state.activeTemplate==="csat"?"message":"document"}" aria-label="Copy ${state.activeTemplate==="csat"?"message":"document"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>
        </button>
      </div>
    </div>`;
  const carNumber=["soul","csat"].includes(state.activeTemplate) ? "" : `
    <div class="dplate-top ${state.activeTemplate==="dplate"?"has-tech-depot":""}">
      ${state.activeTemplate==="dplate"?'<div class="tech-depot-guide" id="techDepotInstruction" aria-live="polite">Tech Depot: Select GEO</div>':""}
      ${state.activeTemplate==="dplate"?`
      <label class="wo-fields-toggle" title="Include Work Order fields in copied text">
      <input id="includeWoFields" type="checkbox" aria-label="Include Work Order fields in copied text" ${state.includeWoFields?"checked":""}>
      <span>WO</span>
      </label>`:""}
      <div class="car-field">
        <label class="field-label">Car #</label>
        <input class="field-control" data-key="carNumber" value="${esc(state.draft.carNumber)}" />
      </div>
    </div>`;
  const fields=state.activeTemplate==="csat" ? `
    <div class="csat-template">
      <div class="csat-type-selector" aria-label="CSAT message type">
        <button class="csat-type-card${state.draft.messageType==="regular"?" active":""}" type="button" data-csat-type="regular" aria-pressed="${state.draft.messageType==="regular"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.4-.76L4 20l1.76-4.1A7.5 7.5 0 1 1 20 11.5Z"/></svg>
          <span class="csat-type-copy"><strong>Regular</strong><small>Standard feedback request</small></span>
        </button>
        <button class="csat-type-card${state.draft.messageType==="withWo"?" active":""}" type="button" data-csat-type="withWo" aria-pressed="${state.draft.messageType==="withWo"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 6.3 3 3M5 19l5.2-5.2m-1.6-1.6 6.6-6.6a3 3 0 0 1 4.2 4.2l-6.6 6.6m-2.6-4.2 3 3M4 20l3.2-.8"/></svg>
          <span class="csat-type-copy"><strong>With WO</strong><small>Includes Work Order details</small></span>
        </button>
        <button class="csat-type-card${state.draft.messageType==="withWoTechDepot"?" active":""}" type="button" data-csat-type="withWoTechDepot" aria-pressed="${state.draft.messageType==="withWoTechDepot"}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
          <span class="csat-type-copy"><strong>WO + Tech Depot</strong><small>Includes depot instructions</small></span>
        </button>
      </div>
      <div class="csat-content">
        <div class="csat-fields csat-fields-${state.draft.messageType}">
          ${state.draft.messageType==="regular" ? "" : `
            <div class="csat-field csat-field-operator">${textField("operatorName","Operator...")}</div>
            <div class="csat-field csat-field-car">${textField("csatCarNumber","Car #...")}</div>
            <div class="csat-field csat-field-wo">${textField("woId","WO ID...")}</div>
            <div class="csat-field csat-field-case">${textField("caseNumber","Case #...")}</div>
            ${state.draft.messageType==="withWoTechDepot" ? `<div class="csat-field csat-field-depot">${textField("techDepotLocation","Tech Depot...")}</div>` : ""}
          `}
          ${state.draft.messageType==="regular" ? `<div class="csat-field csat-field-case">${textField("caseNumber","Case #...")}</div>` : ""}
        </div>
        <div class="csat-preview">
          <section class="csat-message-section" aria-labelledby="csatMessageLabel">
            <label id="csatMessageLabel" class="field-label" for="csatMessage">Generated message</label>
            <textarea id="csatMessage" class="field-control csat-message-output" aria-label="Generated message" readonly rows="4"></textarea>
          </section>
          ${actions}
        </div>
      </div>
    </div>
  ` : state.activeTemplate==="dplate" ? `

    ${field("description","Description of the Issue","Description of the issue...",true)}

    <div class="row-with-prefix">
      <div class="prefix">AS</div>
      ${textField("previousActions","Previous actions from AS...")}
    </div>

    <div class="row-with-prefix">
      <div class="prefix">ES</div>
      ${textField("troubleshooting","Troubleshooting done by ES...")}
    </div>

    <div class="two-col">
      <div>
        <div class="field">${selectField("missionType",options.missionType)}</div>
        <div class="field">${selectField("vehicleLocation",options.vehicleLocation)}</div>
        <div class="field">${selectField("vehiclePlatform",options.vehiclePlatform)}</div>
        <div class="field">${selectField("geo",options.geo)}</div>
      </div>
      <div>
        <div class="field">${textField("ldap","LDAP...")}</div>
        <div class="field">${textField("vehicleSW","Vehicle SW...")}</div>
        <div class="field">${field("vehicleAssignment","Vehicle Assignment...","",false)}</div>
      </div>
    </div>

    ${field("problemWhen","When did the problem happen...")}
    ${field("carDoing","What was the car doing...")}
    ${field("nrr","NRR...")}
    ${field("logFile","Log File with Timestamp...")}
    ${field("recommendations","Recommendations / Suggestions provided by ES...")}
    ${field("csat","CSAT...")}
    ${field("resourcedUsed","Resourced Used...")}
    ${field("carman","Carman...")}

    <div class="end-row">
      <div class="field">${selectField("endResult",options.endResult)}</div>
    </div>
  ` : state.activeTemplate==="discplate" ? `
    <div class="discplate-fields">
      <div class="field">${textField("description","Description of issue...")}</div>
      <div class="field">${textField("troubleshooting","Troubleshooting attempted...")}</div>
      <div class="field">${textField("nrr","NRR (Not Ready Reasons)...")}</div>
      <div class="field">${textField("logFile","Log File with TIMESTAMP...")}</div>
      <div class="two-col discplate-dropdowns">
        <div class="field">${selectField("geo",["N/A",...options.geo],true,"GEO")}</div>
        <div class="field">${selectField("missionType",["N/A",...options.missionType],true,"Mission Information")}</div>
        <div class="field">${selectField("vehiclePlatform",["N/A",...options.vehiclePlatform],true,"Vehicle type")}</div>
        <div class="field">${selectField("vehicleLocation",["N/A",...options.vehicleLocation],true,"Location of Vehicle")}</div>
        <div class="field">${selectField("endResult",["N/A",...options.endResult],true,"End result")}</div>
      </div>
      <div class="field">${textField("ldap","LDAP...")}</div>
      <div class="field">${textField("resourcedUsed","Resourced Use...")}</div>
    </div>
  ` : `
    <div class="soul-fields">
      ${field("description","Description of the Issue","Description of the Issue...",true)}
      ${field("troubleshooting","Troubleshooting Attempted","Troubleshooting Attempted...",true)}
      <div class="field">${selectField("geo",["N/A",...options.geo],true,"GEO")}</div>
      ${field("task","TASK","TASK...")}
      ${field("shift","SHIFT","SHIFT...")}
      ${fixedField("CAR","N/A")}
      ${fixedField("NRR (Not Ready Reasons)","N/A")}
      <div class="field">${selectField("endResult",["N/A",...options.endResult],true,"End result")}</div>
      ${field("ldap","LDAP","LDAP...")}
      ${field("csat","CSAT","CSAT...")}
      ${field("resourcedUsed","Resourced Used","Resourced Used...")}
    </div>
  `;
  panel.innerHTML=state.activeTemplate==="csat" ? fields : `${carNumber}${fields}${actions}`;
  bindPanel();
  autoSizeAll();
}

function csatMessageContent(){
  const d=state.draft;
  const caseNumber=String(d.caseNumber || "").trim();
  const feedbackText=`if you have a minute to spare, please share your feedback at go/es.feedback${caseNumber?` about case ${caseNumber}`:""}.`;
  const feedbackHtml=`if you have a minute to spare, please share your feedback at go/es.feedback${caseNumber?` about case <strong>${esc(caseNumber)}</strong>`:""}.`;
  if(d.messageType==="regular"){
    return {
      plain:`Hi, This is Carl, ${feedbackText}`,
      html:`Hi, This is Carl, ${feedbackHtml}`
    };
  }
  const operatorName=String(d.operatorName || "").trim();
  const carNumber=String(d.csatCarNumber || "").trim();
  const woId=String(d.woId || "").trim();
  const greeting=operatorName?`Hello ${operatorName}, `:"";
  const greetingHtml=operatorName?`Hello ${esc(operatorName)}, `:"";
  const carClause=carNumber?` for car ${carNumber}`:"";
  const carClauseHtml=carNumber?` for car <strong>${esc(carNumber)}</strong>`:"";
  const woIdClause=woId?`, here's the WO ID for your reference: ${woId}`:"";
  const woIdClauseHtml=woId?`, here's the WO ID for your reference: <strong>${esc(woId)}</strong>`:"";
  const techDepotLocation=String(d.techDepotLocation || "").trim();
  const techDepotSentence=d.messageType==="withWoTechDepot"
    && techDepotLocation
    ? ` You can proceed with having this vehicle brought to ${techDepotLocation} Tech Depot.`
    : "";
  const woSentence=`The WO has been created${carClause}${woIdClause}.`;
  const techDepotSentenceHtml=d.messageType==="withWoTechDepot" && techDepotLocation
    ? ` You can proceed with having this vehicle brought to ${esc(techDepotLocation)} Tech Depot.`
    : "";
  return {
    plain:`${greeting}${woSentence}${techDepotSentence}\n\nAlso, ${feedbackText}`,
    html:`${greetingHtml}The WO has been created${carClauseHtml}${woIdClauseHtml}.${techDepotSentenceHtml}<br><br>Also, ${feedbackHtml}`
  };
}

function generateCsatMessage(){return csatMessageContent().plain}

function updateCsatMessage(){
  const message=document.getElementById("csatMessage");
  if(message) message.value=generateCsatMessage();
}

function bindPanel(){
  document.querySelectorAll("[data-key]").forEach(el=>{
    el.addEventListener("input",onField);
    el.addEventListener("change",onField);
  });
  document.querySelectorAll("textarea").forEach(el=>el.addEventListener("input",()=>autoSize(el)));
  const actionButtons=[
    document.getElementById("clearBtn"),
    document.getElementById("bookmarkBtn"),
    document.getElementById("pinBtn"),
    document.getElementById("copyBtn")
  ].filter(Boolean);
  actionButtons.forEach(button=>button.addEventListener("click",()=>playActionFeedback(button)));
  document.getElementById("clearBtn").onclick=openClear;
  const pinButton=document.getElementById("pinBtn");
  if(pinButton) pinButton.onclick=pinCurrent;
  const bookmarkButton=document.getElementById("bookmarkBtn");
  if(bookmarkButton) bookmarkButton.onclick=bookmarkCurrent;
  document.getElementById("copyBtn").onclick=copyCurrent;
  document.querySelectorAll("[data-csat-type]").forEach(button=>button.addEventListener("click",()=>{
    state.draft.messageType=button.dataset.csatType;
    state.templateDrafts.csat={...state.draft};
    syncCurrentSavedDocs();
    persist();
    renderPanel();
    updateSaveButtonStates();
  }));
  updateCsatMessage();
  const includeWoFields=document.getElementById("includeWoFields");
  if(includeWoFields){
    includeWoFields.addEventListener("change",event=>{
      state.includeWoFields=event.target.checked;
      persist();
    });
  }
  updateTechDepotGuide();
}
function playActionFeedback(button){
  button.classList.remove("action-clicked");
  void button.offsetWidth;
  button.classList.add("action-clicked");
  button.addEventListener("animationend",()=>button.classList.remove("action-clicked"),{once:true});

  const AudioContextClass=window.AudioContext || window.webkitAudioContext;
  if(!AudioContextClass)return;
  if(!actionAudioContext) actionAudioContext=new AudioContextClass();
  if(actionAudioContext.state==="suspended") actionAudioContext.resume();
  const oscillator=actionAudioContext.createOscillator();
  const gain=actionAudioContext.createGain();
  const now=actionAudioContext.currentTime;
  oscillator.type="sine";
  oscillator.frequency.setValueAtTime(button.classList.contains("copy-btn")?660:520,now);
  gain.gain.setValueAtTime(.035,now);
  gain.gain.exponentialRampToValueAtTime(.001,now+.045);
  oscillator.connect(gain);
  gain.connect(actionAudioContext.destination);
  oscillator.start(now);
  oscillator.stop(now+.05);
}
function onField(e){
  state.draft[e.target.dataset.key]=e.target.value;
  if(DOCUMENT_TEMPLATES.includes(state.activeTemplate)){
    state.templateDrafts[state.activeTemplate]={...state.draft};
  }
  if(state.currentDocId){
    const doc=state.pins.find(x=>x.id===state.currentDocId);
    if(doc){ doc.data={...state.draft}; doc.carNumber=state.draft.carNumber; }
  }
  if(state.currentBookmarkId){
    const bookmark=state.bookmarks.find(item=>item.id===state.currentBookmarkId);
    if(bookmark){
      bookmark.data={...state.draft};
      bookmark.carNumber=state.draft.carNumber || "";
      bookmark.template=state.activeTemplate;
    }
  }
  persist();
  if(e.target.tagName==="TEXTAREA") autoSize(e.target);
  if(e.target.dataset.key==="geo") updateTechDepotGuide();
  if(state.activeTemplate==="csat") updateCsatMessage();
  renderSidebar();
}
function updateTechDepotGuide(){
  const instruction=document.getElementById("techDepotInstruction");
  if(!instruction)return;
  const geo=String(state.draft.geo || "").trim();
  if(!geo){
    instruction.innerHTML='<span class="tech-depot-label">TECH DEPOT</span><span class="tech-depot-value">Select GEO</span>';
    instruction.title="Select a GEO to see its assigned tech depot.";
    return;
  }
  const depots=techDepots[geo];
  const depotText=depots ? depots.join(", ") : "Depot not provided";
  instruction.innerHTML=`<span class="tech-depot-label">TECH DEPOT</span><span class="tech-depot-value">${esc(depotText)}</span>`;
  instruction.title=`${geo} — ${depotText}`;
}
function autoSize(el){
  el.style.height="auto";
  const min=el.classList.contains("large")?62:34;
  el.style.height=Math.max(min,el.scrollHeight)+"px";
}
function autoSizeAll(){document.querySelectorAll("textarea").forEach(autoSize)}

function makeId(){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9)}

function preserveCurrentDraft(){
  if(!DOCUMENT_TEMPLATES.includes(state.activeTemplate)) return;
  const data={...state.draft};
  state.templateDrafts[state.activeTemplate]=data;
  if(syncCurrentSavedDocs()) return;
  state.currentDocId=null;
  state.currentBookmarkId=null;
}

function syncCurrentSavedDocs(){
  const data={...state.draft};
  let synced=false;
  const doc=state.pins.find(item=>item.id===state.currentDocId);
  if(doc){
    doc.template=state.activeTemplate;
    doc.data=data;
    doc.carNumber=data.carNumber || "";
    synced=true;
  }
  const bookmark=state.bookmarks.find(item=>item.id===state.currentBookmarkId);
  if(bookmark){
    bookmark.template=state.activeTemplate;
    bookmark.data=data;
    bookmark.carNumber=data.carNumber || "";
    synced=true;
  }
  return synced;
}

function pinCurrent(){
  if(!DOCUMENT_TEMPLATES.includes(state.activeTemplate)) return;
  const id=state.currentDocId || state.currentBookmarkId || makeId();
  let doc=state.pins.find(item=>item.id===id);
  if(!doc){
    doc={id,template:state.activeTemplate,carNumber:"",data:{}};
    state.pins.push(doc);
  }
  doc.template=state.activeTemplate;
  doc.carNumber=state.draft.carNumber || "";
  doc.data={...state.draft};
  state.currentDocId=id;
  persist();
  renderSidebar();
  updateSaveButtonStates();
}

function bookmarkCurrent(){
  if(!DOCUMENT_TEMPLATES.includes(state.activeTemplate)) return;
  const id=state.currentBookmarkId || state.currentDocId || makeId();
  let doc=state.bookmarks.find(item=>item.id===id);
  if(!doc){
    doc={id,template:state.activeTemplate,carNumber:"",data:{}};
    state.bookmarks.push(doc);
  }
  doc.template=state.activeTemplate;
  doc.carNumber=state.draft.carNumber || "";
  doc.data={...state.draft};
  state.currentBookmarkId=id;
  persist();
  renderSidebar();
  updateSaveButtonStates();
}

function updateSaveButtonStates(){
  const id=state.currentBookmarkId || state.currentDocId;
  const isPinned=!!id && state.pins.some(item=>item.id===id);
  const isBookmarked=!!id && state.bookmarks.some(item=>item.id===id);
  const pinButton=document.getElementById("pinBtn");
  const bookmarkButton=document.getElementById("bookmarkBtn");
  if(pinButton){
    pinButton.classList.toggle("is-pinned",isPinned);
    pinButton.title=isPinned?"Pinned":"Pin document";
    pinButton.setAttribute("aria-label",isPinned?"Pinned":"Pin document");
    pinButton.setAttribute("aria-pressed",String(isPinned));
  }
  if(bookmarkButton){
    bookmarkButton.classList.toggle("is-bookmarked",isBookmarked);
    bookmarkButton.title=isBookmarked?"Bookmark saved":"Bookmark document";
    bookmarkButton.setAttribute("aria-label",isBookmarked?"Bookmark saved":"Bookmark document");
    bookmarkButton.setAttribute("aria-pressed",String(isBookmarked));
  }
}

function openPin(id){
  const doc=state.pins.find(x=>x.id===id);
  if(!doc)return;
  preserveCurrentDraft();
  state.activeTemplate=DOCUMENT_TEMPLATES.includes(doc.template) ? doc.template : "dplate";
  state.currentDocId=id;
  state.currentBookmarkId=state.bookmarks.some(item=>item.id===id) ? id : null;
  state.draft={...emptyDraftFor(state.activeTemplate),...doc.data};
  state.templateDrafts[state.activeTemplate]=state.draft;
  persist();
  render();
}

function openBookmark(id){
  const doc=state.bookmarks.find(item=>item.id===id);
  if(!doc)return;
  preserveCurrentDraft();
  state.activeTemplate=DOCUMENT_TEMPLATES.includes(doc.template) ? doc.template : "dplate";
  state.currentDocId=state.pins.some(item=>item.id===id) ? id : null;
  state.currentBookmarkId=id;
  state.draft={...emptyDraftFor(state.activeTemplate),...doc.data};
  state.templateDrafts[state.activeTemplate]=state.draft;
  persist();
  render();
}

function deleteBookmark(id){
  state.bookmarks=state.bookmarks.filter(item=>item.id!==id);
  if(state.currentBookmarkId===id){
    state.currentBookmarkId=null;
    if(state.currentDocId!==id){
      state.draft=emptyDraftFor(state.activeTemplate);
      state.templateDrafts[state.activeTemplate]=state.draft;
    }
  }
  persist();
  render();
}

function deletePin(id){
  const doc=state.pins.find(x=>x.id===id);
  state.pins=state.pins.filter(x=>x.id!==id);
  if(state.currentDocId===id){
    state.currentDocId=null;
    if(state.currentBookmarkId!==id){
      state.draft=emptyDraftFor(doc?.template || state.activeTemplate);
      state.templateDrafts[state.activeTemplate]=state.draft;
    }
  }
  persist();render();
}

function openClear(){
  const templateName=state.activeTemplate.toUpperCase();
  document.getElementById("modalTitle").textContent="You sure ’bout that?";
  document.getElementById("modalText").textContent=`This wipes all current ${templateName} fields. No take-backs!`;
  document.getElementById("modalBackdrop").classList.remove("hidden");
  document.getElementById("modalConfirm").onclick=()=>{
    state.draft=emptyDraftFor(state.activeTemplate);
    state.templateDrafts[state.activeTemplate]=state.draft;
    state.currentDocId=null;
    state.currentBookmarkId=null;
    persist();closeModal();render();
  };
}
function closeModal(){document.getElementById("modalBackdrop").classList.add("hidden")}

function boldUnicode(value){
  return Array.from(String(value),character=>{
    const code=character.codePointAt(0);
    if(code>=65 && code<=90) return String.fromCodePoint(0x1D400+code-65);
    if(code>=97 && code<=122) return String.fromCodePoint(0x1D41A+code-97);
    if(code>=48 && code<=57) return String.fromCodePoint(0x1D7CE+code-48);
    return character;
  }).join("");
}
function formatGeo(value){
  return String(value || "").trim().replace(/\s+/g,"_").toUpperCase();
}

function outputLines(){
  const d=state.draft;
  if(state.activeTemplate==="soul"){
    return [
      ["DESCRIPTION OF THE ISSUE:",d.description,"block"],
      ["TROUBLESHOOTING ATTEMPTED:",d.troubleshooting,"block"],
      ["GEO:",formatGeo(d.geo),"inline"],
      ["TASK:",d.task,"block"],
      ["SHIFT:",d.shift,"block"],
      ["CAR:","N/A","inline"],
      ["NRR (Not Ready Reasons):","N/A","inline"],
      ["End result:",d.endResult,"inline"],
      ["LDAP:",d.ldap,"block"],
      ["CSAT:",d.csat,"block"],
      ["Resourced Used:",d.resourcedUsed,"block"]
    ];
  }
  if(state.activeTemplate==="discplate"){
    return [
      ["Car #:",d.carNumber,"inline"],
      ["Description of issue:",d.description,"block"],
      ["Troubleshooting attempted:",d.troubleshooting,"block"],
      ["NRR (Not Ready Reasons):",d.nrr,"block"],
      ["Log File with TIMESTAMP:",d.logFile,"block"],
      ["GEO:",formatGeo(d.geo),"inline"],
      ["Mission Information:",d.missionType,"inline"],
      ["Vehicle type:",d.vehiclePlatform,"inline"],
      ["Location of Vehicle:",d.vehicleLocation,"inline"],
      ["End result:",d.endResult,"inline"],
      ["LDAP:",d.ldap,"block"],
      ["Resourced Use:",d.resourcedUsed,"block"]
    ];
  }
  const lines=[
    ["DESCRIPTION OF THE ISSUE:",d.description,"block"],
    ["",null,"separator"],
    ...(state.includeWoFields ? [
      ["Vehicle SW:",d.vehicleSW,"inline"],
      ["Vehicle Assignment:",d.vehicleAssignment,"inline"]
    ] : []),
    ["Vehicle Platform:",d.vehiclePlatform,"inline"],
    ["Mission Type:",d.missionType,"inline"],
    ["Vehicle Location:",d.vehicleLocation,"inline"],
    ...(state.includeWoFields ? [
      ["When did the problem happen:",d.problemWhen,"inline"],
      ["What was the car doing:",d.carDoing,"inline"]
    ] : []),
    ["",null,"separator"],
    ["TROUBLESHOOTING ATTEMPTED:",null,"heading"],
    ["Previous actions from Ops or Tech:",d.previousActions,"list"],
    ["Troubleshooting steps done by ES:",d.troubleshooting,"list"],
    ["Recommendations / Suggestions provided by ES:",d.recommendations,"inline"],
    ["",null,"separator"],
    ["NRR:",d.nrr,"inline"],
    ["LOG FILE WITH TIMESTAMP:",d.logFile,"inline"],
    ["",null,"separator"],
    ["GEO:",formatGeo(d.geo),"inline"],
    ["End result:",d.endResult,"inline"],
    ["CSAT:",d.csat,"inline"],
    ["LDAP:",d.ldap,"inline"],
    ["Resourced Used:",d.resourcedUsed,"inline"],
    ...(state.includeWoFields ? [["Carman:",d.carman,"inline"]] : [])
  ];
  return lines;
}

function clipboardContent(){
  const lines=outputLines();
  const bulletItems=value=>String(value || "").split(/\r?\n/)
    .map(line=>line.trim())
    .filter(Boolean)
    .map(line=>line.replace(/^(?:[•*-]\s*)+/,""));
  const valueLines=value=>String(value || "").split(/\r?\n/).filter(line=>line.trim());
  const renderedLines=lines.flatMap(([label,value,type])=>{
    if(type==="separator") return [{text:"",html:""}];
    const boldLabel=boldUnicode(label);
    const strongLabel=`<strong>${esc(boldLabel)}</strong>`;
    if(type==="heading") return [{text:boldLabel,html:strongLabel}];
    if(type==="block"){
      return [
        {text:boldLabel,html:strongLabel},
        ...valueLines(value).map(line=>({text:line,html:esc(line)}))
      ];
    }
    if(type==="list"){
      const items=bulletItems(value);
      return [
        {text:boldLabel,html:strongLabel},
        ...items.map(item=>({text:`• ${item}`,html:`• ${esc(item)}`}))
      ];
    }
    if(value){
      const contentLines=valueLines(value);
      if(contentLines.length) return [
        {text:`${boldLabel} ${contentLines[0]}`,html:`${strongLabel} ${esc(contentLines[0])}`},
        ...contentLines.slice(1).map(line=>({text:line,html:esc(line)}))
      ];
    }
    return [{text:boldLabel,html:strongLabel}];
  });
  const plain=renderedLines.map(line=>line.text).join("\n");
  const html=`<span>${renderedLines.map(line=>line.html).join("<br>")}</span>`;
  return {plain,html};
}

function copyCurrent(){
  if(state.activeTemplate==="csat"){
    const {plain,html}=csatMessageContent();
    if(navigator.clipboard?.write && typeof ClipboardItem!=="undefined"){
      navigator.clipboard.write([
        new ClipboardItem({
          "text/html":new Blob([`<span>${html}</span>`],{type:"text/html"}),
          "text/plain":new Blob([plain],{type:"text/plain"})
        })
      ]).catch(()=>copyCsatPlainText(plain));
    }else if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(plain).catch(()=>copyPlainTextFallback(plain));
    }else{
      copyPlainTextFallback(plain);
    }
    return;
  }
  const {plain,html}=clipboardContent();
  navigator.clipboard.write([
    new ClipboardItem({
      "text/html":new Blob([html],{type:"text/html"}),
      "text/plain":new Blob([plain],{type:"text/plain"})
    })
  ]).catch(()=>navigator.clipboard.writeText(plain));
}

function copyCsatPlainText(text){
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(text).catch(()=>copyPlainTextFallback(text));
  }else{
    copyPlainTextFallback(text);
  }
}

function copyPlainTextFallback(text){
  const textarea=document.createElement("textarea");
  textarea.value=text;
  textarea.setAttribute("readonly","");
  textarea.style.position="fixed";
  textarea.style.opacity="0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied=document.execCommand("copy");
  textarea.remove();
  if(!copied) console.error("Unable to copy the CSAT message.");
}

document.addEventListener("click",e=>{
  const sec=e.target.closest(".section-toggle");
  if(sec){
    const key=sec.dataset.section;state.sections[key]=!state.sections[key];persist();renderSidebar();return;
  }
  const pin=e.target.closest("[data-pin]");
  if(pin && !e.target.closest("[data-delete-pin]")){openPin(pin.dataset.pin);return}
  const delPin=e.target.closest("[data-delete-pin]");
  if(delPin){deletePin(delPin.dataset.deletePin);return}
  const bookmark=e.target.closest("[data-bookmark]");
  if(bookmark && !e.target.closest("[data-delete-bookmark]")){
    if(suppressBookmarkClick){suppressBookmarkClick=false;return}
    openBookmark(bookmark.dataset.bookmark);return
  }
  const delBookmark=e.target.closest("[data-delete-bookmark]");
  if(delBookmark){deleteBookmark(delBookmark.dataset.deleteBookmark);return}
  const tab=e.target.closest(".tab");
  if(tab){
    const nextTemplate=tab.dataset.template;
    if(state.currentBookmarkId || state.currentDocId) syncCurrentSavedDocs();
    if(DOCUMENT_TEMPLATES.includes(state.activeTemplate)){
      state.templateDrafts[state.activeTemplate]={...state.draft};
    }
    state.activeTemplate=nextTemplate;
    if(DOCUMENT_TEMPLATES.includes(nextTemplate)){
      state.draft={...emptyDraftFor(nextTemplate),...(state.templateDrafts[nextTemplate] || {})};
      state.templateDrafts[nextTemplate]=state.draft;
    }
    state.currentDocId=null;
    state.currentBookmarkId=null;
    persist();render();return;
  }
});
document.getElementById("sidebarToggle").onclick=()=>{
  state.sidebarCollapsed=!state.sidebarCollapsed;
  setSidebarCollapsed(state.sidebarCollapsed);
  persist();
};
const sidebarResizeHandle=document.getElementById("sidebarResizeHandle");
let sidebarResizePointer=null;
sidebarResizeHandle.addEventListener("pointerdown",event=>{
  if(state.sidebarCollapsed || (event.button!==0 && event.pointerType==="mouse")) return;
  event.preventDefault();
  const sidebar=document.getElementById("sidebar");
  const startingWidth=sidebar.getBoundingClientRect().width;
  sidebarResizePointer={pointerId:event.pointerId,startX:event.clientX,startWidth:startingWidth};
  sidebarResizeHandle.setPointerCapture(event.pointerId);
  document.body.classList.add("sidebar-resizing");
});
sidebarResizeHandle.addEventListener("pointermove",event=>{
  if(!sidebarResizePointer || event.pointerId!==sidebarResizePointer.pointerId) return;
  applySidebarWidth(sidebarResizePointer.startWidth+event.clientX-sidebarResizePointer.startX);
});
function finishSidebarResize(event){
  if(!sidebarResizePointer || (event && event.pointerId!==sidebarResizePointer.pointerId)) return;
  sidebarResizePointer=null;
  document.body.classList.remove("sidebar-resizing");
  persist();
}
sidebarResizeHandle.addEventListener("pointerup",finishSidebarResize);
sidebarResizeHandle.addEventListener("pointercancel",finishSidebarResize);
sidebarResizeHandle.addEventListener("lostpointercapture",finishSidebarResize);
sidebarResizeHandle.addEventListener("keydown",event=>{
  if(state.sidebarCollapsed) return;
  if(event.key!=="ArrowLeft" && event.key!=="ArrowRight") return;
  event.preventDefault();
  const currentWidth=document.getElementById("sidebar").getBoundingClientRect().width;
  applySidebarWidth(currentWidth+(event.key==="ArrowRight"?12:-12));
  persist();
});
window.addEventListener("resize",()=>{
  if(!Number.isFinite(state.sidebarWidth)) return;
  const previousWidth=state.sidebarWidth;
  if(state.sidebarCollapsed){
    const limits=sidebarWidthLimits();
    state.sidebarWidth=Math.min(limits.max,Math.max(limits.min,previousWidth));
    updateSidebarResizeAria();
  }else{
    applySidebarWidth(previousWidth);
  }
  if(state.sidebarWidth!==previousWidth) persist();
});
document.getElementById("themePicker").addEventListener("change",event=>{
  state.theme=themes.includes(event.target.value) ? event.target.value : "forest";
  applyTheme(state.theme);
  persist();
});
const sidebarClock=document.getElementById("sidebarClock");
function updateSidebarClock(){
  const now=new Date();
  sidebarClock.dateTime=now.toISOString();
  sidebarClock.textContent=now.toLocaleTimeString([], {timeZone:"Asia/Manila",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true}).replace(/\s/g,"");
}
function updateStopwatch(){
  const elapsed=stopwatchElapsed+(stopwatchStartedAt===null?0:performance.now()-stopwatchStartedAt);
  const centiseconds=Math.floor(elapsed/10);
  const hours=Math.floor(centiseconds/360000);
  const minutes=Math.floor(centiseconds/6000)%60;
  const seconds=Math.floor(centiseconds/100)%60;
  const fraction=centiseconds%100;
  document.getElementById("stopwatchDisplay").textContent=hours
    ? `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(fraction).padStart(2,"0")}`
    : `${String(Math.floor(centiseconds/6000)).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(fraction).padStart(2,"0")}`;
}
const stopwatchToggle=document.getElementById("stopwatchToggle");
const stopwatchReset=document.getElementById("stopwatchReset");
stopwatchToggle.addEventListener("click",()=>{
  if(stopwatchStartedAt!==null) return;
  stopwatchStartedAt=performance.now();
  stopwatchTimer=window.setInterval(updateStopwatch,50);
  stopwatchToggle.disabled=true;
  stopwatchReset.disabled=false;
});
stopwatchReset.addEventListener("click",()=>{
  stopwatchElapsed=0;
  stopwatchStartedAt=null;
  if(stopwatchTimer!==null) window.clearInterval(stopwatchTimer);
  stopwatchTimer=null;
  stopwatchToggle.disabled=false;
  stopwatchReset.disabled=true;
  updateStopwatch();
});
updateSidebarClock();
window.setInterval(updateSidebarClock,1000);
updateStopwatch();
document.getElementById("modalCancel").onclick=closeModal;
document.getElementById("modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal()});

load();
