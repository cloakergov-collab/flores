window.FloresLocation = (function () {
  var STORAGE_KEY = "acai-tropical-detected-location";
  var SEEN_KEY = "acai-location-modal-seen";
  var UPDATE_EVENT = "detected-location-updated";
  var MODAL_OPEN_EVENT = "location-modal-open";

  var STATE_CODE_BY_NAME = {
    Acre: "AC", Alagoas: "AL", Amapá: "AP", Amazonas: "AM", Bahia: "BA",
    Ceará: "CE", "Distrito Federal": "DF", "Espírito Santo": "ES", Goiás: "GO",
    Maranhão: "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG", Pará: "PA", Paraíba: "PB", Paraná: "PR",
    Pernambuco: "PE", Piauí: "PI", "Rio de Janeiro": "RJ",
    "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", Rondônia: "RO",
    Roraima: "RR", "Santa Catarina": "SC", "São Paulo": "SP", Sergipe: "SE",
    Tocantins: "TO"
  };

  var STATES = Object.keys(STATE_CODE_BY_NAME).sort(function (a, b) {
    return a.localeCompare(b, "pt-BR");
  });

  var cityCache = {};
  var currentLocation = null;
  var detecting = false;
  var confirmPending = false;

  function isValid(loc) {
    return loc && loc.country === "BR" && loc.city && (loc.state || loc.stateCode);
  }

  function formatLabel(loc) {
    if (!loc) return "Sua região";
    return loc.city + (loc.stateCode ? " - " + loc.stateCode : "");
  }

  function hasSeenConfirm() {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markSeenConfirm() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}
  }

  function getStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save(loc) {
    currentLocation = loc;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: loc }));
    } catch (e) {}
    updateDisplays();
    updateConfirmText();
  }

  function fetchWithTimeout(url, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) {
        clearTimeout(timer);
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        clearTimeout(timer);
        return null;
      });
  }

  function fromIpinfo(data) {
    if (!data) return null;
    var stateName = data.region || null;
    return {
      city: data.city || null,
      state: stateName,
      stateCode: stateName ? (STATE_CODE_BY_NAME[stateName] || null) : null,
      country: data.country || null
    };
  }

  function fromIpapi(data) {
    if (!data) return null;
    return {
      city: data.city || null,
      state: data.region || null,
      stateCode: data.region_code || null,
      country: data.country_code || null
    };
  }

  function detectByIp(timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    var half = Math.floor(timeoutMs * 0.55);
    return fetchWithTimeout("https://ipinfo.io/json", half)
      .then(function (data) {
        var loc = fromIpinfo(data);
        if (isValid(loc)) return loc;
        return fetchWithTimeout("https://ipapi.co/json/", timeoutMs - half)
          .then(fromIpapi)
          .then(function (loc2) { return isValid(loc2) ? loc2 : null; });
      });
  }

  function fetchCities(stateName) {
    if (cityCache[stateName]) {
      return Promise.resolve(cityCache[stateName]);
    }
    var uf = STATE_CODE_BY_NAME[stateName];
    if (!uf) return Promise.resolve([]);
    return fetch(
      "https://servicodados.ibge.gov.br/api/v1/localidades/estados/" + uf + "/municipios"
    )
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        var names = list.map(function (c) { return c.nome; }).sort(function (a, b) {
          return a.localeCompare(b, "pt-BR");
        });
        cityCache[stateName] = names;
        return names;
      })
      .catch(function () { return []; });
  }

  function getActiveLocation() {
    if (isValid(currentLocation)) return currentLocation;
    var stored = getStored();
    if (isValid(stored)) {
      currentLocation = stored;
      return stored;
    }
    return null;
  }

  function getDisplayLabel() {
    if (detecting) return "Detectando...";
    var loc = getActiveLocation();
    return isValid(loc) ? formatLabel(loc) : "Sua região";
  }

  function syncHomeHeaderLocation(label) {
    if (!document.body.classList.contains("flores-home-page")) return;
    label = label || getDisplayLabel();

    document.querySelectorAll('button[aria-label="Trocar localização"]').forEach(function (btn) {
      if (btn.closest("#flores-location-bar") || btn.closest("#flores-location-confirm")) return;
      if (btn.closest("#flores-location-modal")) return;

      var labelSpan = btn.querySelector("[data-flores-home-loc]");
      if (!labelSpan) {
        var directSpans = btn.querySelectorAll(":scope > span");
        for (var i = 0; i < directSpans.length; i++) {
          var span = directSpans[i];
          if (span.classList.contains("ml-0.5") || span.querySelector("svg")) continue;
          labelSpan = span;
          labelSpan.setAttribute("data-flores-home-loc", "1");
          break;
        }
      }
      if (labelSpan && labelSpan.textContent !== label) {
        labelSpan.textContent = label;
      }

      if (!btn.dataset.floresHomeBound) {
        btn.dataset.floresHomeBound = "1";
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          openPickerModal();
        }, true);
      }
    });
  }

  var homeObserverStarted = false;
  function watchHomeHeader() {
    if (homeObserverStarted || !document.body.classList.contains("flores-home-page")) return;
    homeObserverStarted = true;

    var timer = null;
    var observer = new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () { syncHomeHeaderLocation(); }, 120);
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    setInterval(function () { syncHomeHeaderLocation(); }, 2000);
    setTimeout(function () { syncHomeHeaderLocation(); }, 500);
    setTimeout(function () { syncHomeHeaderLocation(); }, 1500);
    setTimeout(function () { syncHomeHeaderLocation(); }, 3000);
  }

  function updateDisplays() {
    var label = getDisplayLabel();
    document.querySelectorAll("[data-flores-location-text]").forEach(function (el) {
      el.textContent = label;
    });
    document.querySelectorAll("[data-flores-location]").forEach(function (el) {
      el.classList.toggle("is-loading", detecting);
      el.classList.toggle("has-location", isValid(getActiveLocation()));
    });
    syncHomeHeaderLocation(label);
  }

  function updateConfirmText() {
    var cityEl = document.getElementById("flores-confirm-city");
    var yesBtn = document.getElementById("flores-confirm-yes");
    if (!cityEl) return;
    if (detecting) {
      cityEl.textContent = "detectando sua região...";
      if (yesBtn) yesBtn.disabled = true;
      return;
    }
    cityEl.textContent = isValid(currentLocation) ? formatLabel(currentLocation) : "sua região";
    if (yesBtn) yesBtn.disabled = !isValid(currentLocation);
  }

  function setBodyLock(locked) {
    document.body.classList.toggle("flores-loc-open", locked);
  }

  function ensureConfirmModal() {
    if (document.getElementById("flores-location-confirm")) return;

    var overlay = document.createElement("div");
    overlay.id = "flores-location-confirm";
    overlay.className = "flores-location-confirm";
    overlay.hidden = true;
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("role", "dialog");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);display:none;align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML =
      '<div class="flores-confirm-dialog" role="document" style="background:#fff;border-radius:20px;width:min(400px,100%);padding:28px 24px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.25);border:1px solid #e7e5e4;">' +
        '<div class="flores-confirm-icon">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>' +
          "</svg>" +
        "</div>" +
        '<h2 id="flores-confirm-title">Confirme sua localização 🌹</h2>' +
        '<p class="flores-confirm-text">' +
          "Você está em <strong id=\"flores-confirm-city\">detectando sua região...</strong>? " +
          "Entregamos na sua região e seu pedido chega em <strong>30 a 50 minutos</strong> (ou agende a data)." +
        "</p>" +
        '<button type="button" class="flores-confirm-yes" id="flores-confirm-yes">Sim, é aqui! Ver a loja 🌹</button>' +
        '<button type="button" class="flores-confirm-change" id="flores-confirm-change">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>' +
          "Não, trocar localização" +
        "</button>" +
      "</div>";

    document.body.appendChild(overlay);

    overlay.querySelector("#flores-confirm-yes").addEventListener("click", function () {
      if (isValid(currentLocation)) save(currentLocation);
      markSeenConfirm();
      closeConfirmModal();
    });

    overlay.querySelector("#flores-confirm-change").addEventListener("click", function () {
      closeConfirmModal();
      openPickerModal();
    });
  }

  function openConfirmModal() {
    ensureConfirmModal();
    updateConfirmText();
    var modal = document.getElementById("flores-location-confirm");
    if (!modal) return;
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    modal.hidden = false;
    modal.removeAttribute("hidden");
    modal.style.display = "flex";
    setBodyLock(true);
  }

  function closeConfirmModal() {
    var modal = document.getElementById("flores-location-confirm");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("hidden", "");
      modal.style.display = "none";
    }
    if (document.getElementById("flores-location-modal") &&
        !document.getElementById("flores-location-modal").hidden) {
      return;
    }
    setBodyLock(false);
  }

  function ensurePickerModal() {
    if (document.getElementById("flores-location-modal")) return;

    var overlay = document.createElement("div");
    overlay.id = "flores-location-modal";
    overlay.className = "flores-location-modal";
    overlay.hidden = true;
    overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.55);display:none;align-items:flex-end;justify-content:center;padding:16px;";
    overlay.innerHTML =
      '<div class="flores-location-dialog" role="dialog" aria-labelledby="flores-loc-title" style="background:#fff;border-radius:20px 20px 16px 16px;width:min(420px,100%);padding:24px 20px 20px;position:relative;box-shadow:0 -8px 40px rgba(0,0,0,0.2);border:1px solid #e7e5e4;">' +
        '<button type="button" class="flores-location-close" id="flores-loc-close" aria-label="Fechar">✕</button>' +
        '<div class="flores-location-icon">📍</div>' +
        '<h2 id="flores-loc-title">Onde você está?</h2>' +
        '<p class="flores-location-sub">Escolha sua cidade para ver entrega na sua região</p>' +
        '<div class="flores-loc-field">' +
          '<label for="flores-loc-state">Estado</label>' +
          '<select id="flores-loc-state"><option value="">Selecione o estado</option></select>' +
        "</div>" +
        '<div class="flores-loc-field">' +
          '<label for="flores-loc-city">Cidade</label>' +
          '<select id="flores-loc-city" disabled><option value="">Selecione a cidade</option></select>' +
        "</div>" +
        '<button type="button" class="flores-loc-save" id="flores-loc-save" disabled>Confirmar localização</button>' +
        '<button type="button" class="flores-loc-detect" id="flores-loc-detect">Usar minha localização automaticamente</button>' +
      "</div>";

    document.body.appendChild(overlay);

    var stateSelect = overlay.querySelector("#flores-loc-state");
    STATES.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name + " (" + STATE_CODE_BY_NAME[name] + ")";
      stateSelect.appendChild(opt);
    });

    stateSelect.addEventListener("change", function () {
      var citySelect = overlay.querySelector("#flores-loc-city");
      var saveBtn = overlay.querySelector("#flores-loc-save");
      citySelect.innerHTML = '<option value="">Carregando cidades...</option>';
      citySelect.disabled = true;
      saveBtn.disabled = true;
      if (!stateSelect.value) {
        citySelect.innerHTML = '<option value="">Selecione a cidade</option>';
        return;
      }
      fetchCities(stateSelect.value).then(function (cities) {
        citySelect.innerHTML = '<option value="">Selecione a cidade</option>';
        cities.forEach(function (city) {
          var opt = document.createElement("option");
          opt.value = city;
          opt.textContent = city;
          citySelect.appendChild(opt);
        });
        citySelect.disabled = false;
      });
    });

    overlay.querySelector("#flores-loc-city").addEventListener("change", function (e) {
      overlay.querySelector("#flores-loc-save").disabled = !e.target.value;
    });

    overlay.querySelector("#flores-loc-save").addEventListener("click", function () {
      var state = stateSelect.value;
      var city = overlay.querySelector("#flores-loc-city").value;
      if (!state || !city) return;
      save({
        city: city,
        state: state,
        stateCode: STATE_CODE_BY_NAME[state],
        country: "BR"
      });
      markSeenConfirm();
      closePickerModal();
    });

    overlay.querySelector("#flores-loc-detect").addEventListener("click", function () {
      var btn = overlay.querySelector("#flores-loc-detect");
      btn.textContent = "Detectando...";
      btn.disabled = true;
      runDetection(true).finally(function () {
        btn.textContent = "Usar minha localização automaticamente";
        btn.disabled = false;
        if (currentLocation) {
          markSeenConfirm();
          closePickerModal();
        }
      });
    });

    overlay.querySelector("#flores-loc-close").addEventListener("click", closePickerModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePickerModal();
    });
  }

  function openPickerModal() {
    ensurePickerModal();
    var modal = document.getElementById("flores-location-modal");
    if (!modal) return;
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    modal.hidden = false;
    modal.removeAttribute("hidden");
    modal.style.display = "flex";
    setBodyLock(true);

    if (currentLocation) {
      var stateSelect = modal.querySelector("#flores-loc-state");
      if (currentLocation.state && stateSelect) {
        stateSelect.value = currentLocation.state;
        stateSelect.dispatchEvent(new Event("change"));
        setTimeout(function () {
          var citySelect = modal.querySelector("#flores-loc-city");
          if (citySelect && currentLocation.city) {
            citySelect.value = currentLocation.city;
            modal.querySelector("#flores-loc-save").disabled = false;
          }
        }, 400);
      }
    }
  }

  function closePickerModal() {
    var modal = document.getElementById("flores-location-modal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("hidden", "");
      modal.style.display = "none";
    }
    setBodyLock(false);
  }

  function removeDuplicateHomeBar() {
    var bar = document.getElementById("flores-location-bar");
    if (bar) bar.remove();
  }

  function bindTriggers() {
    document.querySelectorAll("[data-flores-location]").forEach(function (el) {
      if (el.dataset.floresLocBound) return;
      el.dataset.floresLocBound = "1";
      el.addEventListener("click", function () { openPickerModal(); });
    });
    window.addEventListener(MODAL_OPEN_EVENT, openPickerModal);
  }

  function runDetection(force) {
    if (detecting) return Promise.resolve(currentLocation);
    if (!force && isValid(getStored())) {
      currentLocation = getStored();
      updateDisplays();
      return Promise.resolve(currentLocation);
    }

    detecting = true;
    updateDisplays();
    updateConfirmText();

    return detectByIp(6000).then(function (loc) {
      detecting = false;
      if (isValid(loc)) {
        save(loc);
        return loc;
      }
      currentLocation = getStored();
      updateDisplays();
      updateConfirmText();
      return currentLocation;
    });
  }

  function showWelcomeFlow() {
    if (hasSeenConfirm()) return;

    confirmPending = true;
    ensureConfirmModal();
    openConfirmModal();

    var detectPromise = isValid(getStored())
      ? Promise.resolve(getStored()).then(function (loc) {
          currentLocation = loc;
          updateDisplays();
          updateConfirmText();
          return loc;
        })
      : runDetection(true);

    detectPromise.then(function (loc) {
      updateConfirmText();
      if (!isValid(loc) && confirmPending) {
        closeConfirmModal();
        openPickerModal();
      }
    });
  }

  function init() {
    removeDuplicateHomeBar();
    currentLocation = getStored();
    ensureConfirmModal();
    ensurePickerModal();
    bindTriggers();
    watchHomeHeader();
    updateDisplays();

    if (hasSeenConfirm()) {
      if (!isValid(currentLocation)) {
        runDetection(false);
      }
    } else {
      showWelcomeFlow();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    get: function () { return currentLocation || getStored(); },
    save: save,
    detect: function () { return runDetection(true); },
    openModal: openPickerModal,
    formatLabel: formatLabel
  };
})();
