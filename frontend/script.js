// ───────── STATE ─────────
const state = {
  docs: [],
  active: null,
  msgs: [],
  busy: false
};

loadSavedDocs();

function saveDocs(){
  localStorage.setItem("lexora_docs", JSON.stringify(state.docs));
}

function loadSavedDocs(){

  const saved = localStorage.getItem("lexora_docs");

  if(saved){
    state.docs = JSON.parse(saved);
  }

}

// ───────── DOM REFS ─────────
const $fi = document.getElementById("fileInput");
const $dz = document.getElementById("dropZone");
const $dl = document.getElementById("docList");
const $ca = document.getElementById("chatArea");
const $inp = document.getElementById("queryInput");
const $btn = document.getElementById("sendBtn");
const $dot = document.getElementById("statusDot");
const $st = document.getElementById("statusText");
const $tag = document.getElementById("docTag");
const $wlc = document.getElementById("welcome");

renderDocs();
updateStatus();

// ───────── FILE EVENTS ─────────
$fi.addEventListener("change", e => load(e.target.files));

$dz.addEventListener("dragover", e => {
  e.preventDefault();
});

$dz.addEventListener("drop", e => {
  e.preventDefault();
  load(e.dataTransfer.files);
});

// ───────── LOAD FILES ─────────
async function load(files) {

  for (const f of files) {

    if (f.type === "application/pdf") {

      const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
          const b64 = e.target.result.split(",")[1];
          resolve(b64);
        };
        reader.readAsDataURL(f);
      });

      const doc = {
        id: Date.now() + Math.random(),
        name: f.name,
        size: formatSize(f.size),
        base64: base64,
        content: null,
        type: "pdf"
      };

    state.docs.unshift(doc);
    saveDocs();
    renderDocs();
    setActive(doc);

    } else {

      const content = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsText(f);
      });

      const doc = {
        id: Date.now() + Math.random(),
        name: f.name,
        size: formatSize(f.size),
        content: content,
        base64: null,
        type: "text"
      };

      state.docs.unshift(doc);
      renderDocs();
      setActive(doc);
    }

  }
}

// ───────── FORMAT SIZE ─────────
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// ───────── RENDER DOCS ─────────
function renderDocs() {

  if (!state.docs.length) {
    $dl.innerHTML =
      `<div class="empty-docs">No documents yet<br>Upload to begin</div>`;
    return;
  }

  $dl.innerHTML = state.docs.map(d => {

    const active = state.active && state.active.id === d.id;

    return `
      <div class="doc-item ${active ? "active-doc" : ""}"
           onclick="setActiveById('${d.id}')">

        <div class="doc-left">
          ${active ? "●" : "○"}
          <span class="doc-name">${d.name}</span>
        </div>

        <button class="doc-remove"
                onclick="removeDoc(event,'${d.id}')">
          ✕
        </button>

      </div>
    `;

  }).join("");

}

function removeDoc(e, id){

  e.stopPropagation();

  state.docs = state.docs.filter(d => d.id != id);

  if(state.active && state.active.id == id){
    state.active = state.docs[0] || null;
    state.msgs = [];
  }
  
  saveDocs();
  renderDocs();
  renderChat();
  updateStatus();
}


// ───────── ACTIVE DOC ─────────
function setActiveById(id) {
  const doc = state.docs.find(d => d.id == id);
  if (doc) setActive(doc);
}

function setActive(doc) {

  state.active = doc;
  state.msgs = [];

  renderDocs();
  renderChat();
  updateStatus();

  $btn.disabled = false;
}

// ───────── STATUS BAR ─────────
function updateStatus() {

  if (state.active) {
    $dot.classList.add("active");
    $st.textContent = "Active —";
    $tag.textContent = state.active.name;
  } else {
    $dot.classList.remove("active");
    $st.textContent = "No document selected";
    $tag.textContent = "";
  }
}

// ───────── RENDER CHAT ─────────
function renderChat() {

  if (!state.msgs.length) {
    $ca.innerHTML = "";
    $ca.appendChild($wlc);
    $wlc.style.display = "";
    return;
  }

  $wlc.style.display = "none";
  $ca.innerHTML = "";

  state.msgs.forEach(m => {

    $ca.insertAdjacentHTML("beforeend", `
      <div class="message ${m.role}">
        <div class="avatar">${m.role === "user" ? "P" : "L"}</div>
        <div class="bubble">${formatText(m.content)}</div>
      </div>
    `);

  });

  $ca.scrollTop = $ca.scrollHeight;
}

// ───────── TEXT FORMAT ─────────
function formatText(text) {
  return text
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

// ───────── SEND MESSAGE ─────────
async function send(){

  const q = $inp.value.trim()

  if(!q || state.busy || !state.docs.length) return

  state.msgs.push({role:"user",content:q})

  $inp.value=""
  state.busy=true

  renderChat()

  try{

    // collect all documents
   const docs = state.docs.map(d => ({
  name: d.name,
  text: d.content ? d.content : "",
  base64: d.base64 ? d.base64 : ""
}))

    const res = await fetch("https://lexora-ai-ipqj.onrender.com/ask",{
  method:"POST",
  headers:{
    "Content-Type":"application/json"
  },
  body:JSON.stringify({
    question:q,
    documents:docs
  })
})

    const data = await res.json()

    state.msgs.push({
      role:"assistant",
      content:data.answer
    })

  }
  catch(err){

    state.msgs.push({
      role:"assistant",
      content:"Server connection failed"
    })

  }

  state.busy=false
  renderChat()
}
// ───────── QUICK SUGGESTION ─────────
function useSug(btn) {

  if (!state.active) {
    alert("Upload a document first");
    return;
  }

  $inp.value = btn.innerText;
  send();
}

function saveDocs(){
  localStorage.setItem("lexora_docs", JSON.stringify(state.docs));
}

function loadSavedDocs(){

  const saved = localStorage.getItem("lexora_docs");

  if(saved){
    state.docs = JSON.parse(saved);
  }

}

$inp.addEventListener("keydown", e => {

  if(e.key === "Enter" && !e.shiftKey){

    e.preventDefault();

    if(!state.docs.length){
      alert("Upload a document first");
      return;
    }

    send();
  }

});