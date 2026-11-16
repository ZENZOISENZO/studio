;(function () {

  // ── Create UI elements ────────────────────────────────────
  var btn   = document.createElement('button')
  btn.id    = 'voice-btn'
  btn.className = 'voice-btn'
  btn.setAttribute('aria-label', 'Voice command')
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'

  var toast = document.createElement('div')
  toast.id  = 'voice-toast'
  toast.className = 'voice-toast'

  document.body.appendChild(btn)
  document.body.appendChild(toast)
  btn.addEventListener('click', toggleVoice)

  // ── State ─────────────────────────────────────────────────
  var recognition = null
  var isListening = false
  var toastTimer  = null

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg, type, persist) {
    clearTimeout(toastTimer)
    toast.textContent = msg
    toast.className   = 'voice-toast show ' + (type || '')
    if (!persist) toastTimer = setTimeout(function() { toast.className = 'voice-toast' }, 3500)
  }
  function hideToast() {
    clearTimeout(toastTimer)
    toast.className = 'voice-toast'
  }

  // ── Recording ─────────────────────────────────────────────
  function toggleVoice() {
    isListening ? stopListening() : startListening()
  }

  function startListening() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      showToast('Speech recognition not available on this device', 'error')
      return
    }
    recognition = new SR()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = function() {
      isListening = true
      btn.classList.add('listening')
      showToast('Listening…', 'listening', true)
    }
    recognition.onresult = function(e) {
      var transcript = e.results[0][0].transcript
      stopListening()
      processCommand(transcript)
    }
    recognition.onerror = function(e) {
      stopListening()
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        showToast('Could not hear you. Try again.', 'error')
      } else if (e.error === 'no-speech') {
        hideToast()
      }
    }
    recognition.onend = function() {
      if (isListening) stopListening()
    }
    recognition.start()
  }

  function stopListening() {
    isListening = false
    btn.classList.remove('listening')
    if (recognition) { try { recognition.stop() } catch(_) {} recognition = null }
  }

  // ── Build context (lightweight snapshot for Claude) ───────
  function buildContext() {
    var clients  = typeof getClients  === 'function' ? getClients().map(function(c) { return { id: c.id, name: c.name, company: c.company || '' } }) : []
    var projects = typeof getProjects === 'function' ? getProjects().map(function(p) { return { id: p.id, title: p.title, clientId: p.clientId, status: p.status, amount: p.amount, currency: p.currency, date: p.date } }) : []
    var invoices = typeof getInvoices === 'function' ? getInvoices().slice(0, 25).map(function(i) { return { id: i.id, number: i.number, clientId: i.clientId, projectId: i.projectId, status: i.status, amount: i.amount, currency: i.currency, date: i.date } }) : []
    return { clients: clients, projects: projects, invoices: invoices }
  }

  // ── API call ──────────────────────────────────────────────
  function processCommand(transcript) {
    showToast('“' + transcript + '”', 'processing', true)
    btn.classList.add('processing')

    fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        transcript: transcript,
        context: buildContext(),
        today: new Date().toISOString().slice(0, 10)
      })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d } }) })
    .then(function(r) {
      btn.classList.remove('processing')
      if (!r.ok || r.data.error) {
        showToast(r.data.error || 'Something went wrong', 'error')
        return
      }
      executeAction(r.data)
    })
    .catch(function(e) {
      btn.classList.remove('processing')
      showToast('Connection error. Check your internet.', 'error')
    })
  }

  // ── Execute action from Claude ────────────────────────────
  function executeAction(result) {
    var action  = result.action
    var data    = result.data || {}
    var message = result.message || 'Done'

    try {
      var id, rest, key

      switch (action) {

        case 'add_project':
          if (typeof addProject === 'function') addProject(data)
          break

        case 'update_project':
          if (typeof updateProject === 'function') {
            id = data.id; rest = {}
            for (key in data) { if (key !== 'id') rest[key] = data[key] }
            updateProject(id, rest)
          }
          break

        case 'delete_project':
          if (typeof deleteProject === 'function') deleteProject(data.id)
          break

        case 'add_invoice':
          if (typeof addInvoice === 'function') {
            if (!data.number && typeof nextInvoiceNumber === 'function') data.number = nextInvoiceNumber()
            if (!data.type)   data.type   = 'invoice'
            if (!data.status) data.status = 'draft'
            if (!data.items)  data.items  = []
            addInvoice(data)
          }
          break

        case 'update_invoice':
          if (typeof updateInvoice === 'function') {
            id = data.id; rest = {}
            for (key in data) { if (key !== 'id') rest[key] = data[key] }
            updateInvoice(id, rest)
          }
          break

        case 'delete_invoice':
          if (typeof deleteInvoice === 'function') deleteInvoice(data.id)
          break

        case 'add_client':
          if (typeof addClient === 'function') addClient(data)
          break

        case 'update_client':
          if (typeof updateClient === 'function') {
            id = data.id; rest = {}
            for (key in data) { if (key !== 'id') rest[key] = data[key] }
            updateClient(id, rest)
          }
          break

        case 'delete_client':
          if (typeof deleteClient === 'function') deleteClient(data.id)
          break

        case 'unknown':
          showToast("I didn’t understand that. Try again.", 'error')
          return

        default:
          showToast('Unknown action: ' + action, 'error')
          return
      }

      showToast(message, 'success')

      // Refresh whichever render functions exist on this page
      if (typeof renderTable === 'function') setTimeout(renderTable, 50)
      if (typeof render      === 'function') setTimeout(render, 50)
      if (typeof renderClients === 'function') setTimeout(renderClients, 50)
      if (typeof updateCounts  === 'function') setTimeout(updateCounts, 50)
      if (typeof updateMonthNav === 'function') setTimeout(updateMonthNav, 100)

    } catch (e) {
      showToast('Error: ' + e.message, 'error')
    }
  }

})()
