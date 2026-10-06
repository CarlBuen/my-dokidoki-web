const STORAGE_KEY = "myDokiDoki.v1";
const SELECT_HINT_VERSION = 1;

const state = {
  activeTemplate: "dplate",
  sidebarCollapsed: false,
  sections: { pinned: true, notes: true },
  currentDocId: null,
  draft: emptyDraft(),
  templateDrafts: {},
  pins: [],
  notes: []
};

let savedNoteRange=null;

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

function emptyDraftFor(template){
  if(template==="discplate") return emptyDiscDraft();
  if(template==="soul") return emptySoulDraft();
  return emptyDraft();
}

const options = {
  missionType:["ADC","MDC","RO"],
  vehicleLocation:["Startup","Infield"],
  vehiclePlatform:["APOLLO","LIBERTY","W12"],
  geo:["Atlanta","Austin","Dallas","Denver","Detroit","Houston","Las Vegas","London","Los Angeles","Miami","Mountain View","Nashville","New Orleans","New York","Orlando","Philadelphia","Phoenix","Pittsburgh","San Antonio","San Diego","San Francisco","Seattle","Tampa","Tokyo","Washington DC"],
  endResult:["resolved","resolved_while_on_call","hand_off_to_tech","in_progress_pc_included","in_progress"]
};

function load(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved) Object.assign(state,saved);
  }catch(e){}
  if(state.activeTemplate==="disconnected") state.activeTemplate="discplate";
  const savedDrafts=state.templateDrafts || {};
  state.templateDrafts={
    dplate:{...emptyDraft(),...(savedDrafts.dplate || state.draft || {})},
    discplate:{...emptyDiscDraft(),...(savedDrafts.discplate || {})},
    soul:{...emptySoulDraft(),...(savedDrafts.soul || {})}
  };
  if(state.selectHintVersion!==SELECT_HINT_VERSION){
    ["geo","missionType","vehiclePlatform","vehicleLocation","endResult"].forEach(key=>{
      if(state.templateDrafts.discplate[key]==="N/A") state.templateDrafts.discplate[key]="";
    });
    ["geo","endResult"].forEach(key=>{
      if(state.templateDrafts.soul[key]==="N/A") state.templateDrafts.soul[key]="";
    });
    state.selectHintVersion=SELECT_HINT_VERSION;
  }
  if(["dplate","discplate","soul"].includes(state.activeTemplate)){
    state.draft=state.templateDrafts[state.activeTemplate];
  }else{
    state.draft=state.templateDrafts.dplate;
  }
  persist();
  render();
}
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function sanitizeNoteHtml(html){
  const parsed=new DOMParser().parseFromString(String(html ?? ""),"text/html");
  const allowed=new Set(["B","STRONG","I","EM","U","P","DIV","BR","SPAN","TABLE","COLGROUP","COL","THEAD","TBODY","TR","TH","TD"]);
  function clean(node){
    return Array.from(node.childNodes).map(child=>{
      if(child.nodeType===Node.TEXT_NODE) return esc(child.nodeValue);
      if(child.nodeType!==Node.ELEMENT_NODE) return "";
      if(child.classList.contains("table-resize-handle")) return "";
      const content=clean(child);
      if(!allowed.has(child.tagName)) return content;
      if(child.tagName==="SPAN"){
        const size=child.dataset.size;
        return size && ["small","normal","large"].includes(size)
          ? `<span data-size="${size}">${content}</span>` : content;
      }
      if(child.tagName==="TABLE"){
        const widths=(child.dataset.colWidths || "").split(",").map(Number);
        const rows=(child.dataset.rowHeights || "").split(",").map(Number);
        const widthValue=widths.length && widths.every(n=>Number.isFinite(n) && n>0 && n<=100)
          ? ` data-col-widths="${widths.join(",")}"` : "";
        const rowValue=rows.length && rows.every(n=>Number.isFinite(n) && n>=30 && n<=2000)
          ? ` data-row-heights="${rows.join(",")}"` : "";
        return `<table${widthValue}${rowValue}>${content}</table>`;
      }
      return `<${child.tagName.toLowerCase()}>${content}</${child.tagName.toLowerCase()}>`;
    }).join("");
  }
  return clean(parsed.body);
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
  document.getElementById("sidebar").classList.toggle("collapsed",state.sidebarCollapsed);
  renderSidebar();
  renderTabs();
  renderPanel();
}
function renderSidebar(){
  const p=document.getElementById("pinnedList");
  p.innerHTML=state.sections.pinned ? (state.pins.length ? state.pins.map(doc=>`
    <div class="side-item pin-item" data-pin="${doc.id}">
      <span class="item-icon">P</span>
      <span class="item-title">${doc.template==="soul"?"SOUL":`Car# ${esc(doc.carNumber || "Untitled")}`}</span>
      <button class="delete-pin" data-delete-pin="${doc.id}" title="Delete pinned doc" aria-label="Delete pinned doc">×</button>
    </div>`).join("") : `<div class="empty-list">No pinned docs yet</div>`) : "";

  const n=document.getElementById("notesList");
  n.innerHTML=state.sections.notes ? (state.notes.length ? state.notes.map(note=>`
    <div class="side-item note-item" data-note="${note.id}">
      <span class="item-icon">N</span>
      <span class="item-title">${esc(note.title || "Note")}</span>
      <button class="delete-pin" data-delete-note="${note.id}" title="Delete note" aria-label="Delete note">×</button>
    </div>`).join("") : `<div class="empty-list">No notes yet</div>`) : "";

  document.querySelectorAll(".section-toggle").forEach(btn=>{
    const key=btn.dataset.section;
    btn.classList.toggle("collapsed",!state.sections[key]);
  });
}
function renderTabs(){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.template===state.activeTemplate));
}

function renderPanel(){
  const panel=document.getElementById("documentPanel");
  if(!["dplate","discplate","soul"].includes(state.activeTemplate)){
    panel.className="document-panel coming-soon";
    panel.textContent="Coming Soon";
    return;
  }
  panel.className="document-panel";
  const actions=`
    <div class="actions">
      <button class="action-btn clear-btn" id="clearBtn" title="Clear" aria-label="Clear fields"><img src="icons/clear.png" alt=""></button>
      <button class="action-btn pin-btn" id="pinBtn" title="Pin" aria-label="Pin document"><img src="icons/Pin.png" alt=""></button>
      <button class="action-btn copy-btn" id="copyBtn" title="Copy" aria-label="Copy document"><img src="icons/copy.png" alt=""></button>
    </div>`;
  const carNumber=state.activeTemplate==="soul" ? "" : `
    <div class="dplate-top">
      <div class="car-field">
        <label class="field-label">Car #</label>
        <input class="field-control" data-key="carNumber" value="${esc(state.draft.carNumber)}" />
      </div>
    </div>`;
  const fields=state.activeTemplate==="dplate" ? `

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
  panel.innerHTML=`${carNumber}${fields}${actions}`;
  bindPanel();
  autoSizeAll();
}

function bindPanel(){
  document.querySelectorAll("[data-key]").forEach(el=>{
    el.addEventListener("input",onField);
    el.addEventListener("change",onField);
  });
  document.querySelectorAll("textarea").forEach(el=>el.addEventListener("input",()=>autoSize(el)));
  document.getElementById("clearBtn").onclick=openClear;
  document.getElementById("pinBtn").onclick=pinCurrent;
  document.getElementById("copyBtn").onclick=copyCurrent;
}
function onField(e){
  state.draft[e.target.dataset.key]=e.target.value;
  if(["dplate","discplate","soul"].includes(state.activeTemplate)){
    state.templateDrafts[state.activeTemplate]={...state.draft};
  }
  if(state.currentDocId){
    const doc=state.pins.find(x=>x.id===state.currentDocId);
    if(doc){ doc.data={...state.draft}; doc.carNumber=state.draft.carNumber; }
  }
  persist();
  if(e.target.tagName==="TEXTAREA") autoSize(e.target);
  renderSidebar();
}
function autoSize(el){
  el.style.height="auto";
  const min=el.classList.contains("large")?62:34;
  el.style.height=Math.max(min,el.scrollHeight)+"px";
}
function autoSizeAll(){document.querySelectorAll("textarea").forEach(autoSize)}

function makeId(){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9)}

function pinCurrent(){
  const doc={id:makeId(),template:state.activeTemplate,carNumber:state.draft.carNumber,data:{...state.draft}};
  state.pins.push(doc);
  state.currentDocId=doc.id;
  persist();
  renderSidebar();
}

function openPin(id){
  const doc=state.pins.find(x=>x.id===id);
  if(!doc)return;
  state.activeTemplate=["discplate","soul"].includes(doc.template) ? doc.template : "dplate";
  state.currentDocId=id;
  state.draft={...emptyDraftFor(state.activeTemplate),...doc.data};
  state.templateDrafts[state.activeTemplate]=state.draft;
  persist();
  render();
}

function deletePin(id){
  const doc=state.pins.find(x=>x.id===id);
  state.pins=state.pins.filter(x=>x.id!==id);
  if(state.currentDocId===id){
    state.currentDocId=null;
    state.draft=emptyDraftFor(doc?.template || state.activeTemplate);
    state.templateDrafts[state.activeTemplate]=state.draft;
  }
  persist();render();
}

function createNote(){
  const note={id:makeId(),title:`Note ${state.notes.length+1}`,content:""};
  state.notes.push(note);persist();render();
  openNote(note.id);
}
function openNote(id){
  const note=state.notes.find(x=>x.id===id);if(!note)return;
  const panel=document.getElementById("documentPanel");
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  panel.className="document-panel";
  panel.innerHTML=`<div class="note-editor">
    <input class="field-control" id="noteTitle" value="${esc(note.title)}" placeholder="Note title">
    <div class="note-toolbar" role="toolbar" aria-label="Note formatting">
      <button type="button" data-note-command="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
      <button type="button" data-note-command="italic" title="Italic (Ctrl+I)"><em>I</em></button>
      <button type="button" data-note-command="underline" title="Underline (Ctrl+U)"><u>U</u></button>
      <label class="font-size-control">Size
        <select id="noteFontSize" aria-label="Selected text size">
          <option value="small">Small</option>
          <option value="normal" selected>Normal</option>
          <option value="large">Large</option>
        </select>
      </label>
      <div class="table-tool">
        <button type="button" id="insertNoteTable" title="Insert table" aria-label="Insert table" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"></rect><path d="M3.5 10h17M3.5 14.5h17M9 4.5v15M15 4.5v15"></path></svg>
        </button>
        <div class="table-picker hidden" id="tablePicker" aria-label="Choose table size">
          <div class="table-picker-label" id="tablePickerLabel">Choose table size</div>
          <div class="table-picker-grid" role="group" aria-label="Table rows and columns">
            ${Array.from({length:36},(_,i)=>{
              const rows=Math.floor(i/6)+1,cols=i%6+1;
              return `<button type="button" class="table-picker-cell" data-rows="${rows}" data-cols="${cols}" aria-label="${rows} rows by ${cols} columns"></button>`;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
    <div class="note-content" id="noteContent" contenteditable="true" role="textbox" aria-label="Note content" aria-multiline="true" data-placeholder="Write your note..."></div>
  </div>`;
  const title=document.getElementById("noteTitle"),content=document.getElementById("noteContent");
  content.innerHTML=note.contentHtml
    ? sanitizeNoteHtml(note.contentHtml)
    : esc(note.content || "").replace(/\n/g,"<br>");
  initializeNoteTables(content);
  title.oninput=()=>{note.title=title.value;persist();renderSidebar()};
  content.oninput=()=>{
    initializeNoteTables(content);
    note.contentHtml=sanitizeNoteHtml(content.innerHTML);
    note.content=content.innerText;
    persist();
  };
  content.onkeyup=saveNoteSelection;
  content.onmouseup=saveNoteSelection;
  content.onfocus=saveNoteSelection;
  document.querySelectorAll("[data-note-command]").forEach(button=>{
    button.onmousedown=e=>e.preventDefault();
    button.onclick=()=>{
      content.focus();
      document.execCommand(button.dataset.noteCommand,false);
      saveNoteSelection();
      content.dispatchEvent(new Event("input",{bubbles:true}));
    };
  });
  const fontSize=document.getElementById("noteFontSize");
  fontSize.onmousedown=saveNoteSelection;
  fontSize.onchange=()=>{
    if(!restoreNoteSelection(content)) return;
    const selection=document.getSelection();
    if(!selection || selection.isCollapsed) return;
    const range=selection.getRangeAt(0);
    const span=document.createElement("span");
    span.dataset.size=fontSize.value;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selection.removeAllRanges();
    const caret=document.createRange();
    caret.selectNodeContents(span);
    selection.addRange(caret);
    content.dispatchEvent(new Event("input",{bubbles:true}));
  };
  const tableButton=document.getElementById("insertNoteTable");
  const picker=document.getElementById("tablePicker");
  const pickerLabel=document.getElementById("tablePickerLabel");
  tableButton.onmousedown=saveNoteSelection;
  tableButton.onclick=()=>{
    const opening=picker.classList.contains("hidden");
    picker.classList.toggle("hidden",!opening);
    tableButton.setAttribute("aria-expanded",String(opening));
    if(opening) pickerLabel.textContent="Choose table size";
  };
  picker.querySelectorAll(".table-picker-cell").forEach(cell=>{
    cell.onmouseenter=()=>highlightTableSize(picker,cell.dataset.rows,cell.dataset.cols);
    cell.onfocus=()=>highlightTableSize(picker,cell.dataset.rows,cell.dataset.cols);
    cell.onmousedown=e=>e.preventDefault();
    cell.onclick=()=>{
      const rows=Number(cell.dataset.rows),cols=Number(cell.dataset.cols);
      if(!restoreNoteSelection(content)) content.focus();
      document.execCommand("insertHTML",false,makeNoteTable(rows,cols));
      content.dispatchEvent(new Event("input",{bubbles:true}));
      picker.classList.add("hidden");
      tableButton.setAttribute("aria-expanded","false");
      saveNoteSelection();
    };
  });
  picker.onmouseleave=()=>clearTableSizeHighlight(picker);
}
function highlightTableSize(picker,rows,cols){
  const r=Number(rows),c=Number(cols);
  picker.querySelectorAll(".table-picker-cell").forEach(cell=>{
    cell.classList.toggle("selected",Number(cell.dataset.rows)<=r && Number(cell.dataset.cols)<=c);
  });
  document.getElementById("tablePickerLabel").textContent=`${r} × ${c} table`;
}
function clearTableSizeHighlight(picker){
  if(document.activeElement?.classList.contains("table-picker-cell")) return;
  picker.querySelectorAll(".table-picker-cell").forEach(cell=>cell.classList.remove("selected"));
  document.getElementById("tablePickerLabel").textContent="Choose table size";
}
function makeNoteTable(rows,cols){
  const colgroup=`<colgroup>${Array.from({length:cols},()=>"<col>").join("")}</colgroup>`;
  const body=Array.from({length:rows},()=>`<tr>${Array.from({length:cols},()=>"<td><br></td>").join("")}</tr>`).join("");
  return `<table>${colgroup}<tbody>${body}</tbody></table><p><br></p>`;
}
function initializeNoteTables(editor){
  editor.querySelectorAll("table").forEach(table=>{
    const rows=Array.from(table.rows);
    const cols=Math.max(0,...rows.map(row=>row.cells.length));
    if(!cols || !rows.length) return;

    let colgroup=table.querySelector(":scope > colgroup");
    if(!colgroup){colgroup=document.createElement("colgroup");table.insertBefore(colgroup,table.firstChild)}
    while(colgroup.children.length<cols) colgroup.appendChild(document.createElement("col"));
    while(colgroup.children.length>cols) colgroup.lastElementChild.remove();
    let widths=(table.dataset.colWidths || "").split(",").map(Number);
    if(widths.length!==cols || widths.some(n=>!Number.isFinite(n) || n<=0)){
      widths=Array(cols).fill(100/cols);
      table.dataset.colWidths=widths.join(",");
    }
    Array.from(colgroup.children).forEach((col,index)=>{
      const width=`${widths[index]}%`;
      if(col.style.width!==width) col.style.width=width;
    });
    if(table.style.tableLayout!=="fixed") table.style.tableLayout="fixed";
    if(table.style.width!=="100%") table.style.width="100%";

    const heights=(table.dataset.rowHeights || "").split(",").map(Number);
    rows.forEach((row,rowIndex)=>{
      if(Number.isFinite(heights[rowIndex]) && heights[rowIndex]>=30){
        const height=`${heights[rowIndex]}px`;
        if(row.style.height!==height) row.style.height=height;
      }
      const cells=Array.from(row.cells);
      cells.forEach((cell,colIndex)=>{
        let columnHandle=cell.querySelector(":scope > .column-resize-handle");
        if(colIndex<cells.length-1){
          if(!columnHandle) addTableResizeHandle(cell,"column",colIndex);
          else columnHandle.dataset.index=String(colIndex);
        }else if(columnHandle){
          columnHandle.remove();
        }
      });
      cells.forEach(cell=>{
        if(cell!==cells[cells.length-1]) cell.querySelectorAll(":scope > .row-resize-handle").forEach(handle=>handle.remove());
      });
      if(cells.length){
        let rowHandle=cells[cells.length-1].querySelector(":scope > .row-resize-handle");
        if(!rowHandle) addTableResizeHandle(cells[cells.length-1],"row",rowIndex);
        else rowHandle.dataset.index=String(rowIndex);
      }
    });
  });
}
function addTableResizeHandle(cell,axis,index){
  const handle=document.createElement("span");
  handle.className=`table-resize-handle ${axis}-resize-handle`;
  handle.contentEditable="false";
  handle.dataset.axis=axis;
  handle.dataset.index=String(index);
  handle.setAttribute("role","separator");
  handle.setAttribute("aria-label",`Resize table ${axis}`);
  handle.addEventListener("pointerdown",startTableResize);
  cell.appendChild(handle);
}
function startTableResize(event){
  event.preventDefault();
  event.stopPropagation();
  const handle=event.currentTarget;
  const table=handle.closest("table");
  if(!table)return;
  const axis=handle.dataset.axis,index=Number(handle.dataset.index);
  const rows=Array.from(table.rows);
  const start=axis==="column"?event.clientX:event.clientY;
  const cols=Array.from(table.querySelectorAll(":scope > colgroup > col"));
  const startWidths=cols.map(col=>col.getBoundingClientRect().width);
  const startHeight=axis==="row"?rows[index]?.getBoundingClientRect().height:0;
  const onMove=move=>{
    if(axis==="column"){
      const nextIndex=index+1;
      if(!cols[nextIndex])return;
      const total=startWidths[index]+startWidths[nextIndex];
      const width=Math.max(40,Math.min(total-40,startWidths[index]+move.clientX-start));
      cols[index].style.width=`${width}px`;
      cols[nextIndex].style.width=`${total-width}px`;
    }else if(rows[index]){
      rows[index].style.height=`${Math.max(30,startHeight+move.clientY-start)}px`;
    }
  };
  const onEnd=()=>{
    document.removeEventListener("pointermove",onMove);
    document.removeEventListener("pointerup",onEnd);
    if(axis==="column"){
      const width=table.getBoundingClientRect().width;
      table.dataset.colWidths=cols.map(col=>(col.getBoundingClientRect().width/width*100).toFixed(2)).join(",");
    }else{
      table.dataset.rowHeights=rows.map(row=>Math.max(30,row.getBoundingClientRect().height).toFixed(0)).join(",");
    }
    const editor=table.closest(".note-content");
    if(editor) editor.dispatchEvent(new Event("input",{bubbles:true}));
  };
  document.addEventListener("pointermove",onMove);
  document.addEventListener("pointerup",onEnd,{once:true});
}
function saveNoteSelection(){
  const editor=document.getElementById("noteContent");
  const selection=document.getSelection();
  if(editor && selection?.rangeCount && editor.contains(selection.anchorNode)){
    savedNoteRange=selection.getRangeAt(0).cloneRange();
  }
}
function restoreNoteSelection(editor){
  if(!savedNoteRange || !editor.contains(savedNoteRange.commonAncestorContainer)) return false;
  const selection=document.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedNoteRange);
  return true;
}
function deleteNote(id){
  state.notes=state.notes.filter(x=>x.id!==id);persist();render();
}

function openClear(){
  const templateName=state.activeTemplate.toUpperCase();
  document.getElementById("modalTitle").textContent="You sure ’bout that?";
  document.getElementById("modalText").textContent=`This wipes all current ${templateName} fields. No take-backs!`;
  document.getElementById("modalBackdrop").classList.remove("hidden");
  document.getElementById("modalConfirm").onclick=()=>{
    state.draft=emptyDraftFor(state.activeTemplate);
    state.templateDrafts[state.activeTemplate]=state.draft;
    state.currentDocId=null;persist();closeModal();render();
  };
}
function closeModal(){document.getElementById("modalBackdrop").classList.add("hidden")}

function outputLines(){
  const d=state.draft;
  if(state.activeTemplate==="soul"){
    return [
      ["DESCRIPTION OF THE ISSUE:",d.description,"block"],
      ["TROUBLESHOOTING ATTEMPTED:",d.troubleshooting,"block"],
      ["GEO:",d.geo,"inline"],
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
      ["GEO:",d.geo,"inline"],
      ["Mission Information:",d.missionType,"inline"],
      ["Vehicle type:",d.vehiclePlatform,"inline"],
      ["Location of Vehicle:",d.vehicleLocation,"inline"],
      ["End result:",d.endResult,"inline"],
      ["LDAP:",d.ldap,"block"],
      ["Resourced Use:",d.resourcedUsed,"block"]
    ];
  }
  return [
    ["DESCRIPTION OF THE ISSUE:",d.description,"inline"],
    ["Vehicle SW:",d.vehicleSW,"inline"],
    ["Vehicle Assignment:",d.vehicleAssignment,"inline"],
    ["Vehicle Platform:",d.vehiclePlatform,"inline"],
    ["Mission Type:",d.missionType,"inline"],
    ["Vehicle Location:",d.vehicleLocation,"inline"],
    ["When did the problem happen:",d.problemWhen,"inline"],
    ["What was the car doing:",d.carDoing,"inline"],
    ["TROUBLESHOOTING ATTEMPTED:",null,"heading"],
    ["Previous actions from Ops or Tech:",d.previousActions,"block"],
    ["Troubleshooting steps done by ES:",d.troubleshooting,"block"],
    ["Recommendations / Suggestions provided by ES:",d.recommendations,"inline"],
    ["NRR:",d.nrr,"inline"],
    ["LOG FILE WITH TIMESTAMP:",d.logFile,"inline"],
    ["Geo:",d.geo,"inline"],
    ["End result:",d.endResult,"inline"],
    ["CSAT:",d.csat,"inline"],
    ["LDAP:",d.ldap,"inline"],
    ["Resourced Used:",d.resourcedUsed,"inline"],
    ["Carman:",d.carman,"inline"]
  ];
}

function copyCurrent(){
  const lines=outputLines();
  const plain=lines.map(([label,value,type])=>{
    if(type==="heading") return label;
    if(type==="block") return `${label}\n${value||""}`;
    return `${label} ${value||""}`;
  }).join("\n\n");

  const html=lines.map(([label,value,type])=>{
    if(type==="heading") return `<p><strong>${esc(label)}</strong></p>`;
    if(type==="block") return `<p><strong>${esc(label)}</strong><br>${esc(value||"").replace(/\n/g,"<br>")}</p>`;
    return `<p><strong>${esc(label)}</strong> ${esc(value||"").replace(/\n/g,"<br>")}</p>`;
  }).join("");

  navigator.clipboard.write([
    new ClipboardItem({
      "text/html":new Blob([html],{type:"text/html"}),
      "text/plain":new Blob([plain],{type:"text/plain"})
    })
  ]).catch(()=>navigator.clipboard.writeText(plain));
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
  const note=e.target.closest("[data-note]");
  if(note && !e.target.closest("[data-delete-note]")){openNote(note.dataset.note);return}
  const delNote=e.target.closest("[data-delete-note]");
  if(delNote){deleteNote(delNote.dataset.deleteNote);return}
  const tab=e.target.closest(".tab");
  if(tab){
    const nextTemplate=tab.dataset.template;
    if(["dplate","discplate","soul"].includes(state.activeTemplate)){
      state.templateDrafts[state.activeTemplate]={...state.draft};
    }
    state.activeTemplate=nextTemplate;
    if(["dplate","discplate","soul"].includes(nextTemplate)){
      state.draft={...emptyDraftFor(nextTemplate),...(state.templateDrafts[nextTemplate] || {})};
      state.templateDrafts[nextTemplate]=state.draft;
    }
    state.currentDocId=null;
    persist();render();return;
  }
});
document.getElementById("sidebarToggle").onclick=()=>{
  state.sidebarCollapsed=!state.sidebarCollapsed;persist();
  document.getElementById("sidebar").classList.toggle("collapsed",state.sidebarCollapsed);
};
document.getElementById("newNote").onclick=createNote;
document.getElementById("modalCancel").onclick=closeModal;
document.getElementById("modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal()});

load();
