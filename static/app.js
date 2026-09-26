/**
 * Visual RAG Studio & Chunking Explainer - Application Logic (Black & Emerald Theme)
 */

// Application State
const state = {
  activeTab: 'rag',
  stats: { total_chunks: 0, embedding_model: 'all-MiniLM-L6-v2', embedding_dimensions: 384 },
  documents: [],
  currentChunks: [],
  selectedDocForVisualization: null,
  isAsking: false,
  isUploading: false,
  lastSources: [],
  
  // Compact Visualizer Pagination & Filtering
  vizPage: 1,
  vizPageSize: 6,
  vizFilterText: '',
  vizExpandedChunks: new Set()
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupEventListeners();
  loadStats();
  loadDocuments();
  setupDropZone();
  initSandbox();
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ============================================================================
// Navigation Tabs
// ============================================================================
function switchTab(tabName) {
  state.activeTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('text-emerald-400', isActive);
    btn.classList.toggle('border-emerald-500', isActive);
    btn.classList.toggle('bg-emerald-500/10', isActive);
    btn.classList.toggle('text-slate-400', !isActive);
    btn.classList.toggle('border-transparent', !isActive);
  });

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `tab-${tabName}`);
  });

  if (tabName === 'visualizer') {
    renderVisualizer();
  } else if (tabName === 'kb') {
    loadDocuments();
  }

  initIcons();
}

function setupEventListeners() {
  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Question textarea Ctrl+Enter
  const qInput = document.getElementById('questionInput');
  if (qInput) {
    qInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        askQuestion();
      }
    });
  }

  // Visualizer search filter
  const vizSearch = document.getElementById('vizSearchInput');
  if (vizSearch) {
    vizSearch.addEventListener('input', (e) => {
      state.vizFilterText = e.target.value.toLowerCase().trim();
      state.vizPage = 1;
      renderVisualizer();
    });
  }
}

// ============================================================================
// Toast Notifications
// ============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-[#0b120d] border-emerald-500/40 text-emerald-200',
    success: 'bg-[#0b120d] border-emerald-400/60 text-emerald-300',
    error: 'bg-[#150a0a] border-rose-500/50 text-rose-200',
    warning: 'bg-[#151007] border-amber-500/50 text-amber-200'
  };

  const icons = {
    info: 'info',
    success: 'check-circle',
    error: 'alert-triangle',
    warning: 'alert-circle'
  };

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl transition-all duration-300 transform translate-y-2 opacity-0 text-sm font-medium ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0 text-emerald-400"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  initIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================================
// API Calls: Stats & Documents
// ============================================================================
async function loadStats() {
  try {
    const res = await fetch('/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    const data = await res.json();
    state.stats = data;

    const totalEl = document.getElementById('headerChunkCount');
    if (totalEl) totalEl.innerText = `${data.total_chunks || 0} chunks`;

    const kbCountEl = document.getElementById('kbTotalChunks');
    if (kbCountEl) kbCountEl.innerText = data.total_chunks || 0;
  } catch (err) {
    console.warn('Could not load stats:', err);
  }
}

async function loadDocuments() {
  try {
    const res = await fetch('/documents');
    if (!res.ok) throw new Error('Failed to fetch documents');
    const data = await res.json();
    state.documents = data.documents || [];

    renderDocumentsList();
    renderVisualizerDocSelector();
  } catch (err) {
    console.warn('Could not load documents:', err);
  }
}

function renderDocumentsList() {
  const container = document.getElementById('documentsList');
  const countEl = document.getElementById('kbDocCount');
  if (countEl) countEl.innerText = state.documents.length;

  if (!container) return;

  if (state.documents.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 text-sm">
        <i data-lucide="file-question" class="w-8 h-8 mx-auto mb-2 text-slate-600"></i>
        No documents indexed yet. Upload a PDF or text file to begin!
      </div>
    `;
    initIcons();
    return;
  }

  container.innerHTML = state.documents.map((doc) => {
    const ext = doc.filename.split('.').pop().toLowerCase();
    const icon = ext === 'pdf' ? 'file-text' : 'file-code';

    return `
      <div class="flex items-center justify-between p-3.5 bg-black/60 hover:bg-emerald-950/20 rounded-xl border border-emerald-950/60 transition-all">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-semibold text-slate-200 truncate" title="${doc.filename}">${doc.filename}</p>
            <p class="text-[11px] text-emerald-400/80 font-mono">${doc.chunks} chunks in ChromaDB</p>
          </div>
        </div>
        <button onclick="visualizeSpecificDoc('${doc.filename}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-all">
          <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          <span>Inspect</span>
        </button>
      </div>
    `;
  }).join('');

  initIcons();
}

function renderVisualizerDocSelector() {
  const select = document.getElementById('visualizerDocSelect');
  if (!select) return;

  if (state.documents.length === 0) {
    select.innerHTML = '<option value="">No indexed documents</option>';
    return;
  }

  select.innerHTML = state.documents.map(d => `
    <option value="${d.filename}" ${state.selectedDocForVisualization === d.filename ? 'selected' : ''}>
      ${d.filename} (${d.chunks} chunks)
    </option>
  `).join('');
}

// ============================================================================
// Drag and Drop & Upload Pipeline
// ============================================================================
function setupDropZone() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  if (!dropZone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('border-emerald-500', 'bg-emerald-500/10');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('border-emerald-500', 'bg-emerald-500/10');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileUpload();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileUpload();
    }
  });
}

async function handleFileUpload() {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files.length) return;

  const chunkSize = parseInt(document.getElementById('uploadChunkSize')?.value || '900', 10);
  const overlap = parseInt(document.getElementById('uploadOverlap')?.value || '150', 10);

  const formData = new FormData();
  for (const f of fileInput.files) {
    formData.append('files', f);
  }
  formData.append('chunk_size', chunkSize);
  formData.append('overlap', overlap);

  state.isUploading = true;
  const progressContainer = document.getElementById('uploadProgressContainer');
  const uploadBtn = document.getElementById('uploadTriggerBtn');

  if (uploadBtn) uploadBtn.disabled = true;
  if (progressContainer) progressContainer.classList.remove('hidden');

  updateUploadStage('Extracting document text & page metadata...');

  try {
    const res = await fetch('/upload', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    const data = await res.json();

    if (data.new_chunks && data.new_chunks.length > 0) {
      state.currentChunks = data.new_chunks;
      state.selectedDocForVisualization = data.new_chunks[0].source;
    }

    await loadStats();
    await loadDocuments();

    const successCount = data.results.filter(r => r.status === 'indexed').length;
    const totalChunksIndexed = data.results.reduce((acc, r) => acc + (r.chunks || 0), 0);

    showToast(`Indexed ${successCount} file(s) into ${totalChunksIndexed} chunks!`, 'success');

    // Reset pagination to first page
    state.vizPage = 1;
    switchTab('visualizer');
    renderVisualizer(data.new_chunks);

  } catch (err) {
    console.error('Upload error:', err);
    showToast(`Upload failed: ${err.message}`, 'error');
  } finally {
    state.isUploading = false;
    if (uploadBtn) uploadBtn.disabled = false;
    if (progressContainer) progressContainer.classList.add('hidden');
    fileInput.value = '';
  }
}

function updateUploadStage(message) {
  const textEl = document.getElementById('uploadStageText');
  if (textEl) textEl.innerText = message;
}

// ============================================================================
// Real-Time Chunking Visualizer (Compact & Short Display with Pagination)
// ============================================================================
async function visualizeSpecificDoc(filename) {
  state.selectedDocForVisualization = filename;
  state.vizPage = 1;
  state.vizFilterText = '';
  const searchInput = document.getElementById('vizSearchInput');
  if (searchInput) searchInput.value = '';

  switchTab('visualizer');

  const select = document.getElementById('visualizerDocSelect');
  if (select) select.value = filename;

  try {
    const res = await fetch(`/chunks?source=${encodeURIComponent(filename)}&limit=100`);
    const data = await res.json();
    state.currentChunks = data.chunks || [];
    renderVisualizer(state.currentChunks);
  } catch (e) {
    showToast('Failed to load chunks for document', 'error');
  }
}

function onDocSelectChanged() {
  const select = document.getElementById('visualizerDocSelect');
  if (select && select.value) {
    visualizeSpecificDoc(select.value);
  }
}

function toggleChunkExpand(idx) {
  if (state.vizExpandedChunks.has(idx)) {
    state.vizExpandedChunks.delete(idx);
  } else {
    state.vizExpandedChunks.add(idx);
  }
  renderVisualizer(state.currentChunks);
}

function toggleAllChunks(expand) {
  if (expand) {
    (state.currentChunks || []).forEach((_, i) => state.vizExpandedChunks.add(i + 1));
  } else {
    state.vizExpandedChunks.clear();
  }
  renderVisualizer(state.currentChunks);
}

function changeVizPage(delta) {
  state.vizPage += delta;
  renderVisualizer(state.currentChunks);
}

function setVizPage(page) {
  state.vizPage = page;
  renderVisualizer(state.currentChunks);
}

async function renderVisualizer(chunks = null) {
  const container = document.getElementById('chunksVisualizerContainer');
  if (!container) return;

  if (chunks) {
    state.currentChunks = chunks;
  } else {
    chunks = state.currentChunks;
  }

  // If no chunks in memory, load for active document
  if (!chunks || chunks.length === 0) {
    const currentDoc = state.selectedDocForVisualization || (state.documents[0] ? state.documents[0].filename : null);
    if (!currentDoc) {
      container.innerHTML = `
        <div class="glass-panel p-8 text-center rounded-2xl border-emerald-950/50">
          <div class="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mx-auto mb-3">
            <i data-lucide="layers" class="w-6 h-6"></i>
          </div>
          <h3 class="text-sm font-bold text-slate-200">No Document Selected</h3>
          <p class="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Upload any PDF or select an indexed document to inspect compact chunks with ~150-char overlap preservation.
          </p>
          <button onclick="document.getElementById('fileInput').click()" class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20">
            <i data-lucide="upload" class="w-3.5 h-3.5"></i>
            <span>Upload Document</span>
          </button>
        </div>
      `;
      initIcons();
      return;
    }

    try {
      const res = await fetch(`/chunks?source=${encodeURIComponent(currentDoc)}&limit=100`);
      const data = await res.json();
      state.currentChunks = data.chunks || [];
      chunks = state.currentChunks;
    } catch (e) {
      chunks = [];
    }
  }

  // Filter chunks if search text is present
  let filteredChunks = chunks;
  if (state.vizFilterText) {
    filteredChunks = chunks.filter(c => (c.text || '').toLowerCase().includes(state.vizFilterText));
  }

  // Update header stats
  const totalChars = chunks.reduce((acc, c) => acc + (c.char_count || c.text.length), 0);
  const avgChunkSize = chunks.length > 0 ? Math.round(totalChars / chunks.length) : 0;

  document.getElementById('vizTotalChunks').innerText = chunks.length;
  document.getElementById('vizAvgSize').innerText = `${avgChunkSize} ch`;
  document.getElementById('vizEmbedDim').innerText = '384d Cosine';

  if (filteredChunks.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 text-xs">
        No chunks matching "${escapeHtml(state.vizFilterText)}".
      </div>
    `;
    return;
  }

  // Pagination calculations: show only vizPageSize chunks at once!
  const totalPages = Math.ceil(filteredChunks.length / state.vizPageSize);
  state.vizPage = Math.max(1, Math.min(state.vizPage, totalPages));
  const startIdx = (state.vizPage - 1) * state.vizPageSize;
  const pageChunks = filteredChunks.slice(startIdx, startIdx + state.vizPageSize);

  let html = `
    <!-- Compact Toolbar: Search + Controls -->
    <div class="flex flex-wrap items-center justify-between gap-3 p-3 bg-black/60 rounded-xl border border-emerald-950/60 mb-4 text-xs">
      <div class="flex items-center gap-2">
        <span class="text-slate-400 font-mono text-[11px]">Showing <b>${startIdx + 1}-${Math.min(startIdx + state.vizPageSize, filteredChunks.length)}</b> of <b>${filteredChunks.length}</b> chunks</span>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="toggleAllChunks(false)" class="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-[11px] transition-all">
          Collapse All
        </button>
        <button onclick="toggleAllChunks(true)" class="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-[11px] transition-all">
          Expand All
        </button>
      </div>
    </div>

    <!-- Compact Chunks List -->
    <div class="space-y-3">
  `;

  pageChunks.forEach((chunk, pageOffset) => {
    const globalIdx = chunk.global_index || (startIdx + pageOffset + 1);
    const isExpanded = state.vizExpandedChunks.has(globalIdx);
    const rawText = chunk.text || '';
    const overlapPrefix = chunk.overlap_prefix || '';

    let displayBody = escapeHtml(rawText);
    if (overlapPrefix && displayBody.startsWith(escapeHtml(overlapPrefix))) {
      const prefixEscaped = escapeHtml(overlapPrefix);
      displayBody = `<span class="overlap-highlight font-mono" title="~150ch overlap with Chunk #${globalIdx - 1}">[Shared with Chunk #${globalIdx - 1}: ${prefixEscaped}]</span> ` + displayBody.slice(prefixEscaped.length);
    }

    html += `
      <div class="glass-panel p-3.5 rounded-xl glow-card border-emerald-950/70 transition-all text-xs" id="chunk-card-${globalIdx}">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-6 h-6 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold text-[11px] flex items-center justify-center border border-emerald-500/30 flex-shrink-0">
              #${globalIdx}
            </span>
            <span class="font-semibold text-slate-200 truncate" title="${escapeHtml(chunk.source || '')}">${escapeHtml(chunk.source || 'Doc')}</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-black/60 text-slate-400 border border-slate-800 font-mono flex-shrink-0">
              ${escapeHtml(chunk.location || '')}
            </span>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            ${overlapPrefix ? `
              <span class="text-[10px] px-2 py-0.5 rounded overlap-prefix-tag font-mono flex items-center gap-1">
                ${overlapPrefix.length}ch overlap
              </span>
            ` : ''}
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-black text-slate-400 font-mono">
              ${chunk.char_count || rawText.length}ch
            </span>
            <button onclick="toggleChunkExpand(${globalIdx})" class="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium transition-all">
              ${isExpanded ? 'Collapse ▲' : 'Expand ▾'}
            </button>
          </div>
        </div>

        <!-- Collapsible Chunk Snippet -->
        <div class="${isExpanded ? 'chunk-text-expanded' : 'chunk-text-collapsed'} text-[12px] text-slate-300 font-sans leading-relaxed whitespace-pre-wrap bg-[#050705] p-2.5 rounded-lg border border-emerald-950/40">
          ${displayBody}
        </div>
      </div>
    `;
  });

  html += `</div>`;

  // Pagination Bar
  if (totalPages > 1) {
    html += `
      <div class="flex items-center justify-center gap-2 pt-4 text-xs">
        <button onclick="changeVizPage(-1)" ${state.vizPage === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-emerald-500/20"'} class="px-3 py-1 rounded bg-black border border-emerald-950 text-slate-300 transition-all">
          ◀ Prev
        </button>
        <span class="text-slate-400 font-mono text-xs px-2">Page <b>${state.vizPage}</b> of <b>${totalPages}</b></span>
        <button onclick="changeVizPage(1)" ${state.vizPage === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-emerald-500/20"'} class="px-3 py-1 rounded bg-black border border-emerald-950 text-slate-300 transition-all">
          Next ▶
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
  initIcons();
}

// ============================================================================
// Interactive Chunking Sandbox (Live Playground)
// ============================================================================
function initSandbox() {
  const sliderSize = document.getElementById('sandboxChunkSize');
  const sliderOverlap = document.getElementById('sandboxOverlap');
  const inputTxt = document.getElementById('sandboxText');

  if (!sliderSize || !sliderOverlap || !inputTxt) return;

  const updateValues = () => {
    document.getElementById('sandboxSizeVal').innerText = sliderSize.value;
    document.getElementById('sandboxOverlapVal').innerText = sliderOverlap.value;
    runSandboxChunking();
  };

  sliderSize.addEventListener('input', updateValues);
  sliderOverlap.addEventListener('input', updateValues);

  let debounceTimeout = null;
  inputTxt.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(runSandboxChunking, 350);
  });
}

function loadSandboxSample(type) {
  const samples = {
    ai: `Retrieval-Augmented Generation (RAG) combines dense vector retrieval with large language models to provide grounded answers. By converting reference documentation into semantic embeddings and storing them in an HNSW vector index such as ChromaDB, we can perform cosine distance queries to extract the top-k most semantically relevant paragraphs. Consequently, every factual statement generated by the model can be tagged with verifiable citation markers, drastically reducing hallucinations.`,
    computing: `Soft computing differs from conventional (hard) computing in that it is tolerant of imprecision, uncertainty, partial truth, and approximation. The principal constituents of soft computing are Fuzzy Logic (FL), Neural Networks (NN), and Genetic Algorithms (GA). The guiding principle is to exploit the tolerance for imprecision to achieve tractability, robustness, and low solution cost. Artificial neural networks excel at pattern recognition, while fuzzy systems represent human expert rules.`,
    quantum: `Quantum computing leverages superposition and quantum entanglement to perform mathematical operations at speeds exponential to classical architectures. A classical bit exists in a deterministic state of either 0 or 1, whereas a quantum bit (qubit) can exist in a superposition of both states simultaneously. When qubits become entangled, the state of one particle cannot be described independently of the other, enabling parallel algorithmic evaluation.`
  };

  const inputTxt = document.getElementById('sandboxText');
  if (inputTxt && samples[type]) {
    inputTxt.value = samples[type];
    runSandboxChunking();
  }
}

async function runSandboxChunking() {
  const text = document.getElementById('sandboxText')?.value.trim();
  const chunkSize = parseInt(document.getElementById('sandboxChunkSize')?.value || '500', 10);
  const overlap = parseInt(document.getElementById('sandboxOverlap')?.value || '100', 10);
  const previewContainer = document.getElementById('sandboxPreviewContainer');

  if (!text || !previewContainer) return;

  try {
    const res = await fetch('/preview-chunking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, chunk_size: chunkSize, overlap })
    });

    if (!res.ok) throw new Error('Preview failed');
    const data = await res.json();

    document.getElementById('sandboxTotalChunks').innerText = data.total_chunks;
    document.getElementById('sandboxTotalChars').innerText = data.text_length;

    if (data.chunks.length === 0) {
      previewContainer.innerHTML = '<div class="text-slate-500 text-xs p-3">No text to chunk.</div>';
      return;
    }

    previewContainer.innerHTML = data.chunks.map((c, i) => {
      let body = escapeHtml(c.text);
      if (c.overlap_prefix) {
        const prefixEsc = escapeHtml(c.overlap_prefix);
        body = `<span class="overlap-highlight font-mono">[Shared: ${prefixEsc}]</span> ` + body.slice(prefixEsc.length);
      }

      return `
        <div class="p-3 rounded-lg bg-black/60 border border-emerald-950/60 text-xs">
          <div class="flex items-center justify-between text-[11px] mb-1.5">
            <span class="font-bold text-emerald-400 font-mono">Chunk #${c.index}</span>
            <div class="flex items-center gap-2">
              ${c.overlap_prefix ? `<span class="overlap-prefix-tag text-[10px] px-1.5 py-0.2 rounded font-mono">${c.overlap_prefix.length}ch overlap</span>` : ''}
              <span class="text-slate-400 font-mono text-[10px]">${c.char_count}ch (${c.word_count}w)</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-300 font-mono leading-relaxed bg-[#050705] p-2 rounded border border-emerald-950/30">
            ${body}
          </div>
        </div>
      `;
    }).join('');

    initIcons();
  } catch (err) {
    console.error('Sandbox error:', err);
  }
}

// ============================================================================
// Asking Questions & Interactive Grounding
// ============================================================================
function setPrompt(text) {
  const input = document.getElementById('questionInput');
  if (input) {
    input.value = text;
    askQuestion();
  }
}

async function askQuestion() {
  const input = document.getElementById('questionInput');
  const question = input.value.trim();
  if (!question) {
    showToast('Please type a question first!', 'warning');
    return;
  }

  const askBtn = document.getElementById('askSubmitBtn');
  const answerSection = document.getElementById('answerSection');
  const progressBox = document.getElementById('ragPipelineProgress');
  const answerTextEl = document.getElementById('answerText');
  const sourcesBox = document.getElementById('sourcesBox');
  const confidenceBadge = document.getElementById('confidenceBadge');
  const fallbackBadge = document.getElementById('fallbackBadge');

  if (askBtn) askBtn.disabled = true;
  state.isAsking = true;

  if (answerSection) answerSection.classList.remove('hidden');
  if (progressBox) progressBox.classList.remove('hidden');
  if (answerTextEl) answerTextEl.innerHTML = '';
  if (sourcesBox) sourcesBox.innerHTML = '';
  if (confidenceBadge) confidenceBadge.className = 'hidden';
  if (fallbackBadge) fallbackBadge.className = 'hidden';

  answerSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  animatePipelineSteps();

  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to generate answer');
    }

    const data = await res.json();
    state.lastSources = data.sources || [];

    if (progressBox) progressBox.classList.add('hidden');

    renderConfidenceBadge(data.confidence, data.sufficient_context);

    // Fallback badge
    if (data.used_fallback && fallbackBadge) {
      fallbackBadge.classList.remove('hidden');
      fallbackBadge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30';
      fallbackBadge.innerHTML = `<i data-lucide="globe" class="w-3 h-3"></i> Web Search Fallback Active`;
    }

    // Render Answer Markdown + Linkify Citations
    const formattedAnswer = renderAnswerMarkdown(data.answer);
    if (answerTextEl) {
      answerTextEl.innerHTML = formattedAnswer;
      if (window.hljs) {
        answerTextEl.querySelectorAll('pre code').forEach((block) => {
          hljs.highlightElement(block);
        });
      }
    }

    // Render Grounded Sources (Compact & Short)
    renderSources(data.sources, data.used_fallback);

  } catch (err) {
    if (progressBox) progressBox.classList.add('hidden');
    if (answerTextEl) {
      answerTextEl.innerHTML = `
        <div class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          <div class="font-bold flex items-center gap-1.5 mb-1">
            <i data-lucide="alert-circle" class="w-3.5 h-3.5"></i> Error Generating Answer
          </div>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  } finally {
    state.isAsking = false;
    if (askBtn) askBtn.disabled = false;
    initIcons();
  }
}

function animatePipelineSteps() {
  const steps = [
    { label: 'Computing Query Embedding Vector (MiniLM)...' },
    { label: 'Querying ChromaDB HNSW Index...' },
    { label: 'Evaluating Cosine Similarity Cutoff...' },
    { label: 'Synthesizing Grounded Answer via Groq...' }
  ];

  const labelEl = document.getElementById('pipelineStepLabel');
  let current = 0;

  const interval = setInterval(() => {
    if (!state.isAsking || current >= steps.length) {
      clearInterval(interval);
      return;
    }
    if (labelEl) labelEl.innerText = steps[current].label;
    current++;
  }, 600);
}

function renderConfidenceBadge(confidence, sufficient) {
  const badge = document.getElementById('confidenceBadge');
  if (!badge) return;

  badge.classList.remove('hidden');

  const conf = (confidence || 'low').toLowerCase();
  const configs = {
    high: {
      color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
      icon: 'check-circle-2',
      text: 'High Confidence'
    },
    medium: {
      color: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      icon: 'alert-triangle',
      text: 'Medium Confidence'
    },
    low: {
      color: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
      icon: 'alert-octagon',
      text: sufficient ? 'Low Confidence' : 'Context Insufficient'
    }
  };

  const cfg = configs[conf] || configs.low;
  badge.className = `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.color}`;
  badge.innerHTML = `<i data-lucide="${cfg.icon}" class="w-3 h-3"></i> ${cfg.text}`;
}

function renderAnswerMarkdown(rawAnswer) {
  if (!rawAnswer) return '';

  let html = window.marked ? window.marked.parse(rawAnswer) : rawAnswer;

  // Converts [1] into a clickable interactive pill
  html = html.replace(/\[(\d+)\]/g, (match, num) => {
    return `<button onclick="highlightSource(${num})" class="citation-pill" title="Jump to Source [${num}]">[${num}]</button>`;
  });

  return html;
}

function highlightSource(index) {
  const card = document.getElementById(`source-card-${index}`);
  if (!card) {
    showToast(`Source [${index}] not found`, 'info');
    return;
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  card.classList.add('citation-target-active');
  setTimeout(() => {
    card.classList.remove('citation-target-active');
  }, 2200);
}

// Compact & Short Grounded Sources View (Prevents long scroll down)
function renderSources(sources, usedFallback = false) {
  const container = document.getElementById('sourcesBox');
  if (!container) return;

  if (!sources || sources.length === 0) {
    container.innerHTML = `
      <div class="text-[11px] text-slate-500 italic p-2">No direct citation sources were referenced.</div>
    `;
    return;
  }

  // Cap visible sources to max 4 to keep it short & neat
  const visibleSources = sources.slice(0, 4);

  container.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h4 class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
        <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
        <span>Reference Sources (${sources.length})</span>
      </h4>
      <span class="text-[10px] text-slate-500">Compact View</span>
    </div>

    <!-- Compact Grid with Max Height -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
      ${visibleSources.map(s => {
        const isWeb = s.similarity === null || s.similarity === undefined;
        const simPercent = isWeb ? null : Math.round(s.similarity * 100);

        return `
          <div id="source-card-${s.index}" class="glass-panel p-2.5 rounded-lg border-emerald-950/70 glow-card transition-all text-xs">
            <div class="flex items-center justify-between gap-1 mb-1">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-4 h-4 rounded bg-emerald-500/20 text-emerald-300 font-bold font-mono text-[10px] flex items-center justify-center flex-shrink-0">
                  ${s.index}
                </span>
                <span class="text-[11px] font-semibold text-slate-200 truncate" title="${escapeHtml(s.source)}">
                  ${escapeHtml(s.source)}
                </span>
              </div>
              <span class="text-[10px] text-slate-400 font-mono flex-shrink-0">
                ${isWeb ? 'Web' : escapeHtml(s.location || 'chunk')}
              </span>
            </div>

            <!-- Similarity Bar or Link -->
            ${!isWeb ? `
              <div class="flex items-center justify-between text-[10px] text-slate-400">
                <span>Match: <b class="text-emerald-400 font-mono">${simPercent}%</b></span>
                <div class="w-20 h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div class="h-full bg-emerald-400 rounded-full" style="width: ${Math.min(100, Math.max(10, simPercent))}%"></div>
                </div>
              </div>
            ` : `
              <div class="text-[10px] text-slate-400 truncate">
                <a href="${escapeHtml(s.location)}" target="_blank" class="text-emerald-400 hover:underline flex items-center gap-1">
                  <i data-lucide="external-link" class="w-2.5 h-2.5"></i> ${escapeHtml(s.location)}
                </a>
              </div>
            `}
          </div>
        `;
      }).join('')}
    </div>
  `;

  initIcons();
}

// ============================================================================
// Actions: Copy, Read Aloud, Export, Reset
// ============================================================================
function copyCurrentAnswer() {
  const el = document.getElementById('answerText');
  if (!el || !el.innerText.trim()) {
    showToast('No answer to copy!', 'warning');
    return;
  }

  copyToClipboard(el.innerText);
  showToast('Answer copied to clipboard!', 'success');
}

function exportAnswerMarkdown() {
  const el = document.getElementById('answerText');
  if (!el || !el.innerText.trim()) {
    showToast('No answer to export!', 'warning');
    return;
  }

  const question = document.getElementById('questionInput')?.value.trim() || 'RAG Question';
  const content = `# Question\n${question}\n\n# Answer\n${el.innerText}\n\n---\nGenerated by Visual RAG Studio`;

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rag_answer_${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported as Markdown!', 'success');
}

function speakAnswer() {
  const el = document.getElementById('answerText');
  if (!el || !el.innerText.trim()) return;

  if (!('speechSynthesis' in window)) {
    showToast('Speech synthesis not supported in this browser', 'warning');
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    showToast('Voice stopped', 'info');
    return;
  }

  const cleanText = el.innerText.replace(/\[\d+\]/g, '');
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
  showToast('Reading aloud...', 'info');
}

function openResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.remove('hidden');
}

function closeResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.add('hidden');
}

async function confirmResetKnowledgeBase() {
  closeResetModal();
  try {
    const res = await fetch('/reset', { method: 'POST' });
    state.documents = [];
    state.currentChunks = [];

    await loadStats();
    await loadDocuments();

    const answerSec = document.getElementById('answerSection');
    if (answerSec) answerSec.classList.add('hidden');

    renderVisualizer([]);
    showToast('Knowledge base cleared!', 'success');
  } catch (e) {
    showToast('Failed to reset database', 'error');
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
