// Change to "http://localhost:5000" for local dev, or your deployed URL
const API_BASE = "https://lexora-ai-ipqj.onrender.com";
// ═══════════════ STATE ═══════════════
const state = {
  docs: [],
  active: null,
  msgs: [],
  busy: false,
  analysis: {
    summaries: null,
    clauses: null,
    risks: null
  }
};


// ═══════════════ PERSISTENCE ═══════════════
function saveDocs() {
  try {
    localStorage.setItem("lexora_docs_v2", JSON.stringify(state.docs));
  } catch (e) {
    // localStorage full — clear and try again
    localStorage.removeItem("lexora_docs_v2");
  }
}

function loadSavedDocs() {
  const saved = localStorage.getItem("lexora_docs_v2");
  if (saved) {
    try {
      state.docs = JSON.parse(saved);
    } catch (e) { state.docs = []; }
  }
}

// ═══════════════ DOM REFS ═══════════════
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
const $overlay = document.getElementById("loadingOverlay");
const $loadTxt = document.getElementById("loadingText");
const $abBar = document.getElementById("analyzeBar");
const $tpActs = document.getElementById("topbarActions");
const $docCnt = document.getElementById("docCount");

// ═══════════════ INIT ═══════════════
loadSavedDocs();
renderDocs();
updateStatus();

// ═══════════════ FILE EVENTS ═══════════════
$fi.addEventListener("change", e => loadFiles(e.target.files));
$dz.addEventListener("dragover", e => { e.preventDefault(); $dz.classList.add("drag-over"); });
$dz.addEventListener("dragleave", () => $dz.classList.remove("drag-over"));
$dz.addEventListener("drop", e => {
  e.preventDefault();
  $dz.classList.remove("drag-over");
  loadFiles(e.dataTransfer.files);
});

$inp.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!state.docs.length) { alert("Upload a document first."); return; }
    send();
  }
});

// Auto-resize textarea
$inp.addEventListener("input", () => {
  $inp.style.height = "auto";
  $inp.style.height = $inp.scrollHeight + "px";
});

// ═══════════════ LOAD FILES ═══════════════
async function loadFiles(files) {
  for (const f of files) {
    const ext = f.name.split(".").pop().toLowerCase();

    if (ext === "pdf" || ext === "docx") {
      const b64 = await readAsBase64(f);
      const doc = {
        id: Date.now() + Math.random(),
        name: f.name,
        size: formatSize(f.size),
        base64: b64,
        content: `[${ext.toUpperCase()} — text extracted server-side]`,
        type: ext
      };
      // extract text via backend
      try {
        const text = await serverParseFile(b64, f.name, ext);
        doc.content = text;
      } catch (e) { /* will fall back to raw send */ }

      state.docs.unshift(doc);
      saveDocs();
      renderDocs();
      setActive(doc);

    } else {
      // Plain text / markdown / csv / docx (best-effort client read)
      const content = await readAsText(f);
      const doc = {
        id: Date.now() + Math.random(),
        name: f.name,
        size: formatSize(f.size),
        content,
        base64: null,
        type: "text"
      };
      state.docs.unshift(doc);
      saveDocs();
      renderDocs();
      setActive(doc);
    }
  }
  // Reset analysis when new docs arrive
  state.analysis = { summaries: null, clauses: null, risks: null };
  clearAnalysisPanels();
}

// ═══════════════ SERVER FILE PARSE ═══════════════
async function serverParseFile(b64, name, ext) {
  // Convert base64 back to a blob and POST to /parse-file
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  
  const mimeType = ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const blob = new Blob([bytes], { type: mimeType });
  const form = new FormData();
  form.append("file", blob, name);

  const res = await fetch(`${API_BASE}/parse-file`, { method: "POST", body: form });
  const data = await res.json();
  return data.text || "";
}

// ═══════════════ HELPERS ═══════════════
function readAsBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsText(file);
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function docIcon(type) {
  const ext = type || "txt";
  if (ext === "pdf") return "📄";
  if (ext === "docx") return "📝";
  return "📃";
}

// ═══════════════ RENDER DOCS ═══════════════
function renderDocs() {
  if (!state.docs.length) {
    $dl.innerHTML = `<div class="empty-docs">No documents yet.<br />Upload to begin.</div>`;
    $abBar.style.display = "none";
    $tpActs.style.display = "none";
    $docCnt.textContent = "0 documents";
    return;
  }

  $dl.innerHTML = state.docs.map(d => {
    const active = state.active && state.active.id === d.id;
    return `
      <div class="doc-item ${active ? "active-doc" : ""}" onclick="setActiveById('${d.id}')">
        <div class="doc-left">
          <span class="doc-icon">${docIcon(d.type)}</span>
          <div class="doc-meta">
            <span class="doc-name" title="${d.name}">${d.name}</span>
            <span class="doc-size">${d.size || ""}</span>
          </div>
        </div>
        <button class="doc-remove" onclick="removeDoc(event,'${d.id}')" title="Remove">✕</button>
      </div>
    `;
  }).join("");

  $abBar.style.display = "block";
  $tpActs.style.display = "flex";
  $docCnt.textContent = `${state.docs.length} document${state.docs.length > 1 ? "s" : ""}`;
}

function removeDoc(e, id) {
  e.stopPropagation();
  state.docs = state.docs.filter(d => d.id != id);
  if (state.active && state.active.id == id) {
    state.active = state.docs[0] || null;
    state.msgs = [];
  }
  state.analysis = { summaries: null, clauses: null, risks: null };
  saveDocs();
  renderDocs();
  renderChat();
  updateStatus();
  clearAnalysisPanels();
}

// ═══════════════ ACTIVE DOC ═══════════════
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
  closeMobileMenu(); // Auto-close drawer on mobile when selecting a doc
}

// ═══════════════ STATUS ═══════════════
function updateStatus() {
  if (state.active) {
    $dot.classList.add("active");
    $st.textContent = "Active —";
    $tag.textContent = state.active.name;
    $st.onclick = null;
    $st.style.cursor = "default";
  } else {
    $dot.classList.remove("active");
    $st.textContent = "No document selected";
    $st.onclick = null;
    $st.style.cursor = "default";
    $tag.textContent = "";
  }
}

// ═══════════════ TABS ═══════════════
function switchTab(name, btn) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}

// ═══════════════ RENDER CHAT ═══════════════
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
        <div class="avatar">${m.role === "user" ? "U" : "L"}</div>
        <div class="bubble">${m.thinking ? thinkingDots() : formatText(m.content)}</div>
      </div>
    `);
  });
  $ca.scrollTop = $ca.scrollHeight;
}

function thinkingDots() {
  return `<div class="thinking-dots"><span></span><span></span><span></span></div>`;
}

function formatText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

// ═══════════════ SEND MESSAGE ═══════════════
async function send() {
  const q = $inp.value.trim();
  if (!q || state.busy || !state.docs.length) return;

  state.msgs.push({ role: "user", content: q });
  $inp.value = "";
  $inp.style.height = "auto";
  state.busy = true;

  // Add thinking bubble
  state.msgs.push({ role: "assistant", content: "", thinking: true });
  renderChat();

  try {
    const docs = state.docs.map(d => ({ name: d.name, text: d.content || "" }));
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, documents: docs })
    });
    const data = await res.json();
    state.msgs.pop(); // Remove thinking bubble
    state.msgs.push({ role: "assistant", content: data.answer });
  } catch (err) {
    state.msgs.pop();
    state.msgs.push({ role: "assistant", content: "⚠️ Server connection failed. Please check your backend is running." });
  }

  state.busy = false;
  renderChat();
}

function quickAction(q) {
  if (!state.docs.length) { alert("Upload a document first."); return; }
  $inp.value = q;
  // Switch to chat tab
  const chatTab = document.querySelector('[data-tab="chat"]');
  switchTab("chat", chatTab);
  send();
}

function useSug(btn) {
  if (!state.docs.length) { alert("Upload a document first."); return; }
  if (!state.active) setActive(state.docs[0]); // fallback if active somehow dropped
  $inp.value = btn.innerText;
  send();
}

// ═══════════════ ANALYZE ALL ═══════════════
async function analyzeAll() {
  if (!state.docs.length) return;

  const btn = document.getElementById("btnAnalyze");
  btn.disabled = true;
  closeMobileMenu(); // Close the menu when analyze starts so user sees the loading state better

  const docs = state.docs.map(d => ({ name: d.name, text: d.content || "" }));

  try {
    // Run all 3 in parallel
    showLoading("Generating summaries…");
    const [sumRes, clRes, rkRes] = await Promise.all([
      fetch(`${API_BASE}/summarize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents: docs }) }),
      fetch(`${API_BASE}/extract-clauses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents: docs }) }),
      fetch(`${API_BASE}/detect-risks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents: docs }) }),
    ]);

    const [sumData, clData, rkData] = await Promise.all([sumRes.json(), clRes.json(), rkRes.json()]);

    state.analysis.summaries = sumData.summaries || [];
    state.analysis.clauses = clData.clauses || [];
    state.analysis.risks = rkData.risk_analysis || [];

    renderSummaries();
    renderClauses();
    renderRisks();

    // Show badges
    document.getElementById("summaryBadge").style.display = "inline";
    document.getElementById("clausesBadge").style.display = "inline";
    document.getElementById("risksBadge").style.display = "inline";

    // Auto-switch to summary tab
    const sumTab = document.querySelector('[data-tab="summary"]');
    switchTab("summary", sumTab);

  } catch (err) {
    console.error("Analysis Error:", err);
    alert("Analysis failed: " + err.message);
  } finally {
    hideLoading();
    btn.disabled = false;
  }
}

// ═══════════════ RENDER SUMMARY ═══════════════
function renderSummaries() {
  const panel = document.getElementById("summaryPanel");
  if (!state.analysis.summaries || !state.analysis.summaries.length) {
    panel.innerHTML = `<div class="analysis-empty"><div class="empty-icon">📋</div><p>No summaries available.</p></div>`;
    return;
  }

  panel.innerHTML = state.analysis.summaries.map(s => `
    <div class="summary-card">
      <div class="summary-doc-name">${esc(s.name || "Document")}</div>
      <div class="summary-type">${esc(s.document_type || "Legal Document")}</div>

      <p class="summary-exec">${esc(s.executive_summary || "No summary available.")}</p>

      ${(s.effective_date || s.expiry_date) ? `
        <div class="summary-date-row">
          ${s.effective_date ? `<div class="date-chip"><span>Effective Date</span>${esc(s.effective_date)}</div>` : ""}
          ${s.expiry_date ? `<div class="date-chip"><span>Expiry Date</span>${esc(s.expiry_date)}</div>` : ""}
        </div>` : ""}

      <div class="summary-grid">
        ${s.parties && s.parties.length ? `
          <div class="summary-section">
            <h4>Parties Involved</h4>
            <ul>${s.parties.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
          </div>` : ""}

        ${s.key_obligations && s.key_obligations.length ? `
          <div class="summary-section">
            <h4>Key Obligations</h4>
            <ul>${s.key_obligations.slice(0, 5).map(o => `<li>${esc(o)}</li>`).join("")}</ul>
          </div>` : ""}

        ${s.important_amounts && s.important_amounts.length ? `
          <div class="summary-section">
            <h4>Amounts &amp; Financials</h4>
            <ul>${s.important_amounts.map(a => `<li>${esc(a)}</li>`).join("")}</ul>
          </div>` : ""}

        ${s.key_deadlines && s.key_deadlines.length ? `
          <div class="summary-section">
            <h4>Key Deadlines</h4>
            <ul>${s.key_deadlines.map(d => `<li>${esc(d)}</li>`).join("")}</ul>
          </div>` : ""}
      </div>

      ${s.red_flags && s.red_flags.length ? `
        <hr class="section-divider">
        <div class="summary-section">
          <h4>⚠️ Red Flags</h4>
          <ul>${s.red_flags.map(f => `<li class="red-flag-item">${esc(f)}</li>`).join("")}</ul>
        </div>` : ""}
    </div>
  `).join("");
}

// ═══════════════ RENDER CLAUSES ═══════════════
const CLAUSE_LABELS = {
  termination: "Termination",
  payment_terms: "Payment Terms",
  liability: "Liability",
  confidentiality: "Confidentiality",
  indemnification: "Indemnification",
  governing_law: "Governing Law",
  dispute_resolution: "Dispute Resolution",
  intellectual_property: "Intellectual Property",
  force_majeure: "Force Majeure",
  non_compete: "Non-Compete",
  warranties: "Warranties",
  amendments: "Amendments"
};

function renderClauses() {
  const panel = document.getElementById("clausesPanel");
  if (!state.analysis.clauses || !state.analysis.clauses.length) {
    panel.innerHTML = `<div class="analysis-empty"><div class="empty-icon">⚖️</div><p>No clauses extracted.</p></div>`;
    return;
  }

  panel.innerHTML = state.analysis.clauses.map(doc => {
    const clauseKeys = Object.keys(CLAUSE_LABELS);
    const cards = clauseKeys.map(key => {
      const value = doc[key];
      const found = value && value !== "null" && value !== null;
      return `
        <div class="clause-card">
          <div class="clause-tag ${found ? "found" : "missing"}">
            ${found ? "✓ Found" : "✗ Missing"}
          </div>
          <div class="clause-name">${CLAUSE_LABELS[key]}</div>
          ${found
          ? `<div class="clause-excerpt">"${esc(value)}"</div>`
          : `<div class="clause-missing-text">Not found in this document</div>`
        }
        </div>
      `;
    }).join("");

    return `
      <div class="clause-doc-header">📄 ${esc(doc.name || "Document")}</div>
      <div class="clauses-grid">${cards}</div>
    `;
  }).join('<hr class="section-divider">');
}

// ═══════════════ RENDER RISKS ═══════════════
function renderRisks() {
  const panel = document.getElementById("risksPanel");
  if (!state.analysis.risks || !state.analysis.risks.length) {
    panel.innerHTML = `<div class="analysis-empty"><div class="empty-icon">🛡️</div><p>No risk data available.</p></div>`;
    return;
  }

  panel.innerHTML = state.analysis.risks.map(doc => {
    const overall = (doc.overall_risk || "LOW").toUpperCase();
    const score = doc.risk_score ?? "—";
    const scoreClass = overall === "HIGH" ? "high" : overall === "MEDIUM" ? "medium" : "low";

    const riskItems = (doc.risks || []).map(r => `
      <div class="risk-item ${r.risk_level || "LOW"}">
        <div class="risk-item-header">
          <span class="risk-clause-type">${esc(r.clause_type || "Clause")}</span>
          <span class="risk-level-pill">${esc(r.risk_level || "LOW")}</span>
        </div>
        ${r.excerpt ? `<div class="risk-excerpt">${esc(r.excerpt)}</div>` : ""}
        <div class="risk-reason">${esc(r.reason || "")}</div>
        ${r.recommendation ? `<div class="risk-recommendation">${esc(r.recommendation)}</div>` : ""}
      </div>
    `).join("");

    const positives = (doc.positive_clauses || []).map(p =>
      `<span class="positive-chip">${esc(p)}</span>`).join("");

    const missing = (doc.missing_standard_clauses || []).map(m =>
      `<span class="missing-chip">${esc(m)}</span>`).join("");

    return `
      <div class="risk-doc-section">
        <div class="risk-header">
          <div class="risk-doc-name">📄 ${esc(doc.name || "Document")}</div>
          <div class="risk-meter">
            <div class="risk-score-circle ${scoreClass}">
              ${score}
              <span class="risk-score-label">/ 100</span>
            </div>
            <div class="risk-overall-badge ${scoreClass}">${overall} RISK</div>
          </div>
        </div>

        <div class="risk-list">${riskItems || `<p style="color:var(--text-muted);font-size:13px;">No specific risks identified.</p>`}</div>

        ${positives ? `
          <div class="risk-positive-section">
            <h4>✅ Protective Clauses</h4>
            <div class="positive-list">${positives}</div>
          </div>` : ""}

        ${missing ? `
          <div class="risk-missing-section">
            <h4>⚠️ Missing Standard Clauses</h4>
            <div class="positive-list">${missing}</div>
          </div>` : ""}
      </div>
    `;
  }).join('<hr class="section-divider">');
}

// ═══════════════ CLEAR PANELS ═══════════════
function clearAnalysisPanels() {
  const emptyHTML = (icon, txt) => `<div class="analysis-empty"><div class="empty-icon">${icon}</div><p>${txt}</p></div>`;
  document.getElementById("summaryPanel").innerHTML = emptyHTML("📋", 'Upload documents and click <strong>Analyze Documents</strong> to generate structured summaries.');
  document.getElementById("clausesPanel").innerHTML = emptyHTML("⚖️", 'Upload documents and click <strong>Analyze Documents</strong> to extract key clauses.');
  document.getElementById("risksPanel").innerHTML = emptyHTML("🛡️", 'Upload documents and click <strong>Analyze Documents</strong> to detect document risks.');
  document.getElementById("summaryBadge").style.display = "none";
  document.getElementById("clausesBadge").style.display = "none";
  document.getElementById("risksBadge").style.display = "none";
}

// ═══════════════ LOADING ═══════════════
function showLoading(text) {
  $loadTxt.textContent = text || "Analyzing documents…";
  $overlay.style.display = "flex";
}

function hideLoading() {
  $overlay.style.display = "none";
}

// ═══════════════ MOBILE MENU ═══════════════
function toggleMobileMenu() {
  const leftPanel = document.getElementById("leftPanel");
  const overlay = document.getElementById("mobileOverlay");
  leftPanel.classList.toggle("open");
  
  if (leftPanel.classList.contains("open")) {
    overlay.classList.add("active");
  } else {
    overlay.classList.remove("active");
  }
}

function closeMobileMenu() {
  const leftPanel = document.getElementById("leftPanel");
  const overlay = document.getElementById("mobileOverlay");
  if (leftPanel) leftPanel.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}