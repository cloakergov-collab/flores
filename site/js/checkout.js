(function () {
  var MIN_HOUR = 8;
  var MAX_HOUR = 23;
  var CARD_SUGGESTIONS = [
    "Feliz Dia dos Namorados, meu amor ❤️",
    "Pra pessoa mais especial da minha vida 🌹",
    "Te amo mais a cada dia que passa 💕",
    "Você é o meu melhor presente 💐",
    "Com todo o meu amor, sempre 💝"
  ];

  var cartItems = [];
  var cartTotal = 0;
  var currentStep = 1;
  var orderOpen = true;
  var selectedUpsellIds = {};

  var UPSELL_STORAGE_KEY = "flores-checkout-upsells";

  var formState = {
    buyerName: "",
    cpf: "",
    phone: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    reference: "",
    isGift: false,
    recipientName: "",
    cardMessage: "",
    deliveryMode: "now",
    deliveryDate: "",
    deliveryTime: ""
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function maskPhone(value) {
    var d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 7) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }

  function maskCPF(value) {
    var d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
    return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
  }

  function maskCEP(value) {
    var d = value.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 5) return d;
    return d.slice(0, 5) + "-" + d.slice(5);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function maxDateISO() {
    var d = new Date();
    d.setDate(d.getDate() + 30);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function buildTimeOptions(selected) {
    var html = '<option value="">Selecione o horário</option>';
    for (var h = MIN_HOUR; h <= MAX_HOUR; h++) {
      ["00", "30"].forEach(function (min) {
        if (h === MAX_HOUR && min === "30") return;
        var val = pad(h) + ":" + min;
        html += '<option value="' + val + '"' + (val === selected ? " selected" : "") + ">" + val + "</option>";
      });
    }
    return html;
  }

  function formatDateBR(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function buildFullAddress() {
    var s = formState;
    var parts = [];
    if (s.street) parts.push(s.street);
    if (s.number) parts.push("nº " + s.number);
    if (s.complement) parts.push(s.complement);
    if (s.neighborhood) parts.push(s.neighborhood);
    if (s.city) parts.push(s.city);
    if (s.state) parts.push(s.state);
    if (s.cep) parts.push("CEP " + maskCEP(s.cep));
    if (s.reference) parts.push("Ref: " + s.reference);
    return parts.join(", ");
  }

  function getRecipientName() {
    if (formState.isGift && formState.recipientName.trim()) {
      return formState.recipientName.trim();
    }
    return formState.buyerName.trim();
  }

  function getDeliveryLabel() {
    if (formState.deliveryMode === "now") {
      return "Receber agora (30–50 min)";
    }
    return formatDateBR(formState.deliveryDate) + " às " + formState.deliveryTime;
  }

  function loadUpsellSelection() {
    try {
      selectedUpsellIds = JSON.parse(sessionStorage.getItem(UPSELL_STORAGE_KEY) || "{}");
    } catch (e) {
      selectedUpsellIds = {};
    }
  }

  function saveUpsellSelection() {
    sessionStorage.setItem(UPSELL_STORAGE_KEY, JSON.stringify(selectedUpsellIds));
  }

  function getCartProductIds() {
    return cartItems.map(function (item) { return item.productId; });
  }

  function getAvailableUpsells() {
    if (!window.FLORES_UPSELLS) return [];
    var inCart = getCartProductIds();
    return FLORES_UPSELLS.filter(function (u) { return inCart.indexOf(u.id) === -1; });
  }

  function getSelectedUpsells() {
    return getAvailableUpsells().filter(function (u) { return !!selectedUpsellIds[u.id]; });
  }

  function toMoneyNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function getItemQuantity(item) {
    var quantity = Number(item && item.quantity);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function getItemUnitPrice(item) {
    var basePrice = Number(item && item.basePrice);
    if (Number.isFinite(basePrice) && basePrice > 0) return basePrice;

    var subtotal = Number(item && item.subtotal);
    var quantity = getItemQuantity(item);
    if (Number.isFinite(subtotal) && subtotal > 0) return subtotal / quantity;

    return 0;
  }

  function getOrderLines() {
    var lines = cartItems.map(function (item) {
      return {
        quantity: item.quantity,
        name: item.name,
        subtotal: item.subtotal,
        isUpsell: false
      };
    });
    getSelectedUpsells().forEach(function (u) {
      lines.push({
        quantity: 1,
        name: u.name,
        subtotal: u.price,
        isUpsell: true
      });
    });
    return lines;
  }

  function recalcTotal() {
    var cartSum = cartItems.reduce(function (s, i) {
      return s + getItemUnitPrice(i) * getItemQuantity(i);
    }, 0);
    var upsellSum = getSelectedUpsells().reduce(function (s, u) { return s + toMoneyNumber(u.price); }, 0);
    cartTotal = cartSum + upsellSum;
  }

  function refreshOrderUI() {
    recalcTotal();
    var card = $("order-card");
    if (card) {
      var wrapper = document.createElement("div");
      wrapper.innerHTML = renderOrderSummary();
      card.replaceWith(wrapper.firstElementChild);
      bindCommonEvents();
    }
    var btnPix = $("btn-pix");
    if (btnPix && btnPix.dataset.loading !== "1") {
      btnPix.textContent = "Gerar PIX — R$ " + FloresCart.formatPrice(cartTotal);
    }
  }

  function toggleUpsell(id, checked) {
    if (checked) selectedUpsellIds[id] = true;
    else delete selectedUpsellIds[id];
    saveUpsellSelection();
    recalcTotal();
    refreshOrderUI();
    var card = document.querySelector('.upsell-card[data-upsell-id="' + id + '"]');
    if (card) card.classList.toggle("selected", checked);
  }

  function showError(msg) {
    var box = $("form-error");
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearError() {
    var box = $("form-error");
    if (box) {
      box.textContent = "";
      box.hidden = true;
    }
  }

  function markField(id, invalid) {
    var el = $(id);
    if (!el) return;
    el.classList.toggle("field-invalid", invalid);
    el.setAttribute("aria-invalid", invalid ? "true" : "false");
  }

  function clearFieldMarks() {
    document.querySelectorAll(".field-invalid").forEach(function (el) {
      el.classList.remove("field-invalid");
      el.setAttribute("aria-invalid", "false");
    });
  }

  function readFormState() {
    var el;
    el = $("buyer-name"); if (el) formState.buyerName = el.value.trim();
    el = $("cpf"); if (el) formState.cpf = el.value.replace(/\D/g, "");
    el = $("phone"); if (el) formState.phone = el.value.replace(/\D/g, "");
    el = $("cep"); if (el) formState.cep = el.value.replace(/\D/g, "");
    el = $("street"); if (el) formState.street = el.value.trim();
    el = $("number"); if (el) formState.number = el.value.trim();
    el = $("complement"); if (el) formState.complement = el.value.trim();
    el = $("neighborhood"); if (el) formState.neighborhood = el.value.trim();
    el = $("city"); if (el) formState.city = el.value.trim();
    el = $("state"); if (el) formState.state = el.value.trim().toUpperCase();
    el = $("reference"); if (el) formState.reference = el.value.trim();
    el = $("is-gift"); if (el) formState.isGift = el.checked;
    el = $("recipient-name"); if (el) formState.recipientName = el.value.trim();
    el = $("card-message"); if (el) formState.cardMessage = el.value.slice(0, 280);
    el = $("delivery-date"); if (el) formState.deliveryDate = el.value;
    el = $("delivery-time"); if (el) formState.deliveryTime = el.value;
    var mode = document.querySelector('input[name="deliveryMode"]:checked');
    if (mode) formState.deliveryMode = mode.value;
  }

  function validateStep(step) {
    clearError();
    clearFieldMarks();
    readFormState();

    var errors = [];
    var fields = [];

    function fail(id, msg) {
      errors.push(msg);
      fields.push(id);
    }

    if (step === 1) {
      if (!formState.buyerName) fail("buyer-name", "Seu nome");
      else if (formState.buyerName.length < 3) fail("buyer-name", "Seu nome (mín. 3 caracteres)");
      if (!formState.cpf) fail("cpf", "CPF");
      else if (formState.cpf.length !== 11) fail("cpf", "CPF válido");
      if (!formState.phone) fail("phone", "WhatsApp");
      else if (formState.phone.length < 10) fail("phone", "WhatsApp válido");
    }

    if (step === 2) {
      if (!formState.cep || formState.cep.length !== 8) fail("cep", "CEP");
      if (!formState.street) fail("street", "Rua");
      if (!formState.number) fail("number", "Número");
      if (!formState.neighborhood) fail("neighborhood", "Bairro");
      if (formState.isGift) {
        if (!formState.recipientName) fail("recipient-name", "Nome de quem vai receber");
        else if (formState.recipientName.length < 2) fail("recipient-name", "Nome do destinatário");
      }
    }

    if (step === 3) {
      if (formState.deliveryMode === "scheduled") {
        if (!formState.deliveryDate) fail("delivery-date", "Dia da entrega");
        else if (formState.deliveryDate < todayISO()) fail("delivery-date", "Data válida");
        if (!formState.deliveryTime) fail("delivery-time", "Horário");
        else if (formState.deliveryDate === todayISO()) {
          var slot = new Date(formState.deliveryDate + "T" + formState.deliveryTime + ":00");
          if (slot <= new Date()) fail("delivery-time", "Horário no futuro");
        }
      }
    }

    fields.forEach(function (id) { markField(id, true); });

    if (errors.length) {
      showError("Preencha os campos: " + errors.join(", ") + ".");
      return false;
    }
    return true;
  }

  function renderStepper() {
    var steps = [
      { n: 1, label: "Pedido" },
      { n: 2, label: "Endereço" },
      { n: 3, label: "Pagamento" }
    ];
    var html = '<div class="checkout-stepper" role="list" aria-label="Etapas do checkout">';
    steps.forEach(function (s, i) {
      var cls = "stepper-item";
      if (s.n < currentStep) cls += " done";
      else if (s.n === currentStep) cls += " active";
      html +=
        '<div class="' + cls + '" role="listitem">' +
          '<div class="stepper-circle">' +
            (s.n < currentStep
              ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>'
              : String(s.n)) +
          "</div>" +
          '<span class="stepper-label">' + s.label + "</span>" +
        "</div>";
      if (i < steps.length - 1) {
        html += '<div class="stepper-line' + (s.n < currentStep ? " done" : "") + '"></div>';
      }
    });
    html += "</div>";
    return html;
  }

  function renderOrderSummary() {
    var lines = getOrderLines();
    var count = lines.reduce(function (s, l) { return s + l.quantity; }, 0);
    var showLinePrices = lines.length > 1;
    var itemsHtml = lines.map(function (line) {
      var priceHtml = showLinePrices
        ? '<span class="order-item-price">R$ ' + FloresCart.formatPrice(line.subtotal) + "</span>"
        : "";
      return (
        '<div class="order-item-row' + (line.isUpsell ? " is-upsell" : "") + '">' +
          '<span class="order-item-qty">' + line.quantity + "x</span>" +
          '<span class="order-item-name">' + escapeHtml(line.name) + "</span>" +
          priceHtml +
        "</div>"
      );
    }).join("");

    var headerTotal = orderOpen
      ? ""
      : '<span class="order-card-total">R$ ' + FloresCart.formatPrice(cartTotal) + "</span>";

    return (
      '<div class="order-card' + (orderOpen ? " open" : "") + '" id="order-card">' +
        '<button type="button" class="order-card-toggle" id="order-toggle" aria-expanded="' + orderOpen + '">' +
          "<h2>Seu pedido (" + count + " " + (count === 1 ? "item" : "itens") + ")</h2>" +
          headerTotal +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>' +
        "</button>" +
        '<div class="order-card-body">' +
          itemsHtml +
          '<div class="order-breakdown">' +
            '<div class="order-breakdown-row"><span>Entrega</span><span class="free">Grátis</span></div>' +
            '<div class="order-breakdown-row total"><span>Total</span><span>R$ ' + FloresCart.formatPrice(cartTotal) + "</span></div>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function renderUpsellSection() {
    var upsells = getAvailableUpsells();
    if (!upsells.length) return "";

    var cards = upsells.map(function (u) {
      var selected = !!selectedUpsellIds[u.id];
      var discount = u.oldPrice > u.price
        ? Math.round((1 - u.price / u.oldPrice) * 100)
        : 0;
      return (
        '<label class="upsell-card' + (selected ? " selected" : "") + '" data-upsell-id="' + u.id + '">' +
          '<input type="checkbox" data-upsell-id="' + u.id + '"' + (selected ? " checked" : "") + ">" +
          '<img src="../images/' + escapeHtml(u.img) + '" alt="' + escapeHtml(u.name) + '" onerror="this.style.opacity=0.3">' +
          '<div class="upsell-info">' +
            "<strong>" + escapeHtml(u.name) + "</strong>" +
            "<span>" + escapeHtml(u.description) + "</span>" +
            '<div class="upsell-prices">' +
              '<span class="price">+ R$ ' + FloresCart.formatPrice(u.price) + "</span>" +
              (u.oldPrice > u.price
                ? '<span class="old">R$ ' + FloresCart.formatPrice(u.oldPrice) + "</span>"
                : "") +
            "</div>" +
          "</div>" +
          (discount > 0 ? '<span class="upsell-tag">-' + discount + "%</span>" : "") +
        "</label>"
      );
    }).join("");

    return (
      '<div class="upsell-section" id="upsell-section">' +
        "<h3>Complete seu presente ✨</h3>" +
        '<p class="upsell-lead">Ofertas exclusivas — o valor já entra no total e no PIX</p>' +
        '<div class="upsell-list">' + cards + "</div>" +
      "</div>"
    );
  }

  function renderStep1() {
    return (
      renderStepper() +
      renderOrderSummary() +
      '<div id="form-error" class="form-error" hidden role="alert"></div>' +
      '<div class="checkout-panel">' +
        '<div class="panel-heading">' +
          '<div class="panel-heading-icon">👤</div>' +
          "<h2>Seus dados</h2>" +
        "</div>" +
        '<div class="form-group"><label for="buyer-name">Seu nome <span class="req">*</span></label>' +
        '<input id="buyer-name" type="text" autocomplete="name" placeholder="Quem está comprando" value="' + escapeHtml(formState.buyerName) + '"></div>' +
        '<div class="form-group"><label for="cpf">CPF <span class="req">*</span></label>' +
        '<input id="cpf" type="text" inputmode="numeric" placeholder="000.000.000-00" value="' + escapeHtml(maskCPF(formState.cpf)) + '"></div>' +
        '<div class="form-group"><label for="phone">WhatsApp <span class="req">*</span></label>' +
        '<input id="phone" type="tel" autocomplete="tel" placeholder="(11) 99999-9999" value="' + escapeHtml(maskPhone(formState.phone)) + '"></div>' +
      "</div>" +
      renderUpsellSection() +
      '<div class="checkout-actions">' +
        '<button type="button" class="btn-primary" id="btn-next">Continuar para endereço →</button>' +
      "</div>"
    );
  }

  function renderStep2() {
    var giftFieldsHidden = formState.isGift ? "" : " hidden";
    var chips = CARD_SUGGESTIONS.map(function (text) {
      return '<button type="button" class="msg-chip" data-msg="' + escapeHtml(text) + '">+ ' + escapeHtml(text) + "</button>";
    }).join("");

    return (
      renderStepper() +
      renderOrderSummary() +
      '<div id="form-error" class="form-error" hidden role="alert"></div>' +
      '<div class="checkout-panel">' +
        '<div class="panel-heading">' +
          '<div class="panel-heading-icon">📍</div>' +
          "<h2>Onde você quer receber?</h2>" +
        "</div>" +
        '<div class="form-group"><label for="cep">CEP <span class="req">*</span></label>' +
        '<input id="cep" type="text" inputmode="numeric" placeholder="00000-000" value="' + escapeHtml(maskCEP(formState.cep)) + '"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="street">Rua</label>' +
          '<input id="street" type="text" placeholder="Nome da rua" value="' + escapeHtml(formState.street) + '"></div>' +
          '<div class="form-group"><label for="number">Número <span class="req">*</span></label>' +
          '<input id="number" type="text" inputmode="numeric" placeholder="123" value="' + escapeHtml(formState.number) + '"></div>' +
        "</div>" +
        '<div class="form-group"><label for="complement">Complemento (opcional)</label>' +
        '<input id="complement" type="text" placeholder="Apto, bloco, etc." value="' + escapeHtml(formState.complement) + '"></div>' +
        '<div class="form-group"><label for="neighborhood">Bairro</label>' +
        '<input id="neighborhood" type="text" placeholder="Bairro" value="' + escapeHtml(formState.neighborhood) + '"></div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label for="city">Cidade</label>' +
          '<input id="city" type="text" placeholder="Cidade" value="' + escapeHtml(formState.city) + '"></div>' +
          '<div class="form-group"><label for="state">Estado</label>' +
          '<input id="state" type="text" inputmode="text" maxlength="2" placeholder="UF" value="' + escapeHtml(formState.state) + '"></div>' +
        "</div>" +
        '<div class="form-group"><label for="reference">Ponto de referência (opcional)</label>' +
        '<input id="reference" type="text" placeholder="Próximo ao mercado, casa azul, etc." value="' + escapeHtml(formState.reference) + '"></div>' +
        '<div class="gift-box">' +
          '<label class="gift-toggle">' +
            '<input type="checkbox" id="is-gift"' + (formState.isGift ? " checked" : "") + ">" +
            '<div class="gift-toggle-text">' +
              "<strong>É um presente? ✨</strong>" +
              "<span>Mande pra alguém especial com uma mensagem personalizada no cartão 🌹</span>" +
            "</div>" +
          "</label>" +
          '<div class="gift-fields"' + giftFieldsHidden + ' id="gift-fields">' +
            '<div class="form-group"><label for="recipient-name">Nome de quem vai receber <span class="req">*</span></label>' +
            '<input id="recipient-name" type="text" placeholder="Ex: Maria da Silva" value="' + escapeHtml(formState.recipientName) + '"></div>' +
            '<div class="form-group">' +
              '<label for="card-message">Mensagem do cartão (opcional)</label>' +
              '<p class="msg-hint">✨ Toque numa sugestão pra usar — ou escreva a sua abaixo</p>' +
              '<div class="msg-suggestions">' + chips + "</div>" +
              '<textarea id="card-message" rows="3" maxlength="280" placeholder="Ou escreva sua própria mensagem aqui...">' + escapeHtml(formState.cardMessage) + "</textarea>" +
              '<div class="msg-counter"><span id="msg-count">' + formState.cardMessage.length + '</span>/280</div>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="checkout-actions">' +
        '<button type="button" class="btn-primary" id="btn-next">Continuar para pagamento →</button>' +
        '<button type="button" class="btn-secondary" id="btn-back-step">← Voltar</button>' +
      "</div>"
    );
  }

  function renderStep3() {
    var scheduleHidden = formState.deliveryMode === "scheduled" ? "" : " hidden";
    return (
      renderStepper() +
      renderOrderSummary() +
      renderUpsellSection() +
      '<div id="form-error" class="form-error" hidden role="alert"></div>' +
      '<div class="checkout-panel">' +
        '<div class="panel-heading-row">' +
          "<h2>Quando você quer receber?</h2>" +
          '<span class="panel-badge">Entrega grátis</span>' +
        "</div>" +
        '<label class="delivery-option' + (formState.deliveryMode === "now" ? " selected" : "") + '">' +
          '<input type="radio" name="deliveryMode" value="now"' + (formState.deliveryMode === "now" ? " checked" : "") + ">" +
          '<span class="delivery-option-icon">⚡</span>' +
          '<span class="delivery-option-text">' +
            "<strong>Receber agora</strong>" +
            "<span>Sai na hora · chega em 30–50 min</span>" +
          "</span>" +
        "</label>" +
        '<label class="delivery-option' + (formState.deliveryMode === "scheduled" ? " selected" : "") + '">' +
          '<input type="radio" name="deliveryMode" value="scheduled"' + (formState.deliveryMode === "scheduled" ? " checked" : "") + ">" +
          '<span class="delivery-option-icon">📅</span>' +
          '<span class="delivery-option-text">' +
            "<strong>Agendar entrega</strong>" +
            "<span>Escolha o dia e o horário de entrega</span>" +
          "</span>" +
        "</label>" +
        '<div class="schedule-fields"' + scheduleHidden + ' id="schedule-fields">' +
          '<div class="form-row-2">' +
            '<div class="form-group"><label for="delivery-date">Dia da entrega</label>' +
            '<input id="delivery-date" type="date" min="' + todayISO() + '" max="' + maxDateISO() + '" value="' + escapeHtml(formState.deliveryDate) + '"></div>' +
            '<div class="form-group"><label for="delivery-time">Horário</label>' +
            '<select id="delivery-time">' + buildTimeOptions(formState.deliveryTime) + "</select></div>" +
          "</div>" +
          '<p class="msg-hint">Entregas das ' + pad(MIN_HOUR) + ":00 às " + pad(MAX_HOUR) + ":00</p>" +
        "</div>" +
      "</div>" +
      '<div class="checkout-actions">' +
        '<button type="button" class="btn-primary" id="btn-pix">Gerar PIX — R$ ' + FloresCart.formatPrice(cartTotal) + "</button>" +
        '<button type="button" class="btn-secondary" id="btn-back-step">← Voltar</button>' +
      "</div>"
    );
  }

  function bindCommonEvents() {
    var toggle = $("order-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        orderOpen = !orderOpen;
        var card = $("order-card");
        if (!card) return;
        card.classList.toggle("open", orderOpen);
        toggle.setAttribute("aria-expanded", orderOpen);
        var totalEl = card.querySelector(".order-card-total");
        if (orderOpen && totalEl) {
          totalEl.remove();
        } else if (!orderOpen && !totalEl) {
          var span = document.createElement("span");
          span.className = "order-card-total";
          span.textContent = "R$ " + FloresCart.formatPrice(cartTotal);
          toggle.insertBefore(span, toggle.querySelector("svg"));
        }
      });
    }
  }

  function bindUpsellEvents() {
    document.querySelectorAll("[data-upsell-id]").forEach(function (el) {
      if (el.tagName !== "INPUT") return;
      el.addEventListener("change", function (e) {
        toggleUpsell(e.target.dataset.upsellId, e.target.checked);
      });
    });
  }

  function bindStep1Events() {
    bindUpsellEvents();
    $("cpf").addEventListener("input", function (e) {
      e.target.value = maskCPF(e.target.value);
    });
    $("phone").addEventListener("input", function (e) {
      e.target.value = maskPhone(e.target.value);
    });
    $("btn-next").addEventListener("click", function () {
      if (!validateStep(1)) return;
      currentStep = 2;
      render();
    });
  }

  function fetchCEP(cep) {
    return fetch("https://viacep.com.br/ws/" + cep + "/json/")
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function bindStep2Events() {
    $("cep").addEventListener("input", function (e) {
      e.target.value = maskCEP(e.target.value);
    });

    $("cep").addEventListener("blur", function (e) {
      var cep = e.target.value.replace(/\D/g, "");
      if (cep.length !== 8) return;
      fetchCEP(cep).then(function (data) {
        if (!data || data.erro) return;
        if (data.logradouro) $("street").value = data.logradouro;
        if (data.bairro) $("neighborhood").value = data.bairro;
        if (data.localidade && $("city")) $("city").value = data.localidade;
        if (data.uf && $("state")) $("state").value = data.uf;
        formState.street = $("street").value;
        formState.neighborhood = $("neighborhood").value;
        if ($("city")) formState.city = $("city").value;
        if ($("state")) formState.state = $("state").value;
      });
    });

    $("is-gift").addEventListener("change", function (e) {
      formState.isGift = e.target.checked;
      $("gift-fields").hidden = !e.target.checked;
    });

    document.querySelectorAll(".msg-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var msg = btn.getAttribute("data-msg");
        $("card-message").value = msg;
        formState.cardMessage = msg;
        $("msg-count").textContent = msg.length;
      });
    });

    $("card-message").addEventListener("input", function (e) {
      formState.cardMessage = e.target.value.slice(0, 280);
      $("msg-count").textContent = formState.cardMessage.length;
    });

    $("btn-next").addEventListener("click", function () {
      if (!validateStep(2)) return;
      currentStep = 3;
      render();
    });

    $("btn-back-step").addEventListener("click", function () {
      readFormState();
      currentStep = 1;
      render();
    });
  }

  function bindStep3Events() {
    bindUpsellEvents();
    document.querySelectorAll('input[name="deliveryMode"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        formState.deliveryMode = radio.value;
        document.querySelectorAll(".delivery-option").forEach(function (el) {
          el.classList.toggle("selected", el.querySelector("input").value === formState.deliveryMode);
        });
        $("schedule-fields").hidden = formState.deliveryMode !== "scheduled";
      });
    });

    $("delivery-date").addEventListener("change", function (e) {
      if (e.target.value && e.target.value < todayISO()) {
        e.target.value = todayISO();
        showError("A data não pode ser anterior a hoje.");
        markField("delivery-date", true);
      }
    });

    $("btn-back-step").addEventListener("click", function () {
      readFormState();
      currentStep = 2;
      render();
    });

    $("btn-pix").addEventListener("click", function () {
      if (!validateStep(3)) return;
      generateOrderPix();
    });
  }

  function render() {
    var el = $("checkout-content");
    readFormState();

    if (currentStep === 1) {
      el.innerHTML = renderStep1();
      bindCommonEvents();
      bindStep1Events();
    } else if (currentStep === 2) {
      el.innerHTML = renderStep2();
      bindCommonEvents();
      bindStep2Events();
    } else if (currentStep === 3) {
      el.innerHTML = renderStep3();
      bindCommonEvents();
      bindStep3Events();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildPixItems() {
    var items = cartItems.map(function (item) {
      return {
        name: item.name,
        price: getItemUnitPrice(item),
        quantity: getItemQuantity(item)
      };
    });
    getSelectedUpsells().forEach(function (u) {
      items.push({
        name: u.name,
        price: toMoneyNumber(u.price),
        quantity: 1
      });
    });
    return items;
  }

  function buildPixTotal() {
    var total = buildPixItems().reduce(function (sum, item) {
      return sum + item.price * item.quantity;
    }, 0);
    return Number.isFinite(total) ? total : 0;
  }

  function buildDeliveryPayload() {
    readFormState();
    var deliveryDate = formState.deliveryMode === "now" ? todayISO() : formState.deliveryDate;
    var deliveryTime = formState.deliveryMode === "now" ? "agora" : formState.deliveryTime;

    return {
      buyerName: formState.buyerName,
      cpf: formState.cpf,
      phone: formState.phone,
      recipientName: getRecipientName(),
      address: buildFullAddress(),
      deliveryMode: formState.deliveryMode,
      deliveryDate: deliveryDate,
      deliveryTime: deliveryTime,
      deliveryLabel: getDeliveryLabel(),
      isGift: formState.isGift,
      cardMessage: formState.cardMessage
    };
  }

  function waitForPixSdk() {
    return new Promise(function (resolve, reject) {
      if (typeof generatePix === "function") {
        resolve();
        return;
      }
      var script = $("pix-sdk-script");
      var done = false;
      function finish(ok, err) {
        if (done) return;
        done = true;
        ok ? resolve() : reject(err);
      }
      if (script) {
        script.addEventListener("load", function () {
          typeof generatePix === "function"
            ? finish(true)
            : finish(false, new Error("SDK PIX indisponível."));
        });
        script.addEventListener("error", function () {
          finish(false, new Error("Falha ao carregar pagamento PIX."));
        });
      }
      setTimeout(function () {
        if (typeof generatePix === "function") finish(true);
        else finish(false, new Error("Tempo esgotado ao carregar PIX."));
      }, 15000);
    });
  }

  function showPixStep(delivery, response) {
    lastOrder = { delivery: delivery, total: cartTotal, transactionId: response.transactionId };
    $("checkout-content").innerHTML =
      renderStepper() +
      '<div class="checkout-panel pix-step">' +
        "<h2 style=\"font-size:20px;font-weight:800;margin-bottom:8px\">Pague com PIX</h2>" +
        '<div class="pix-total">R$ ' + FloresCart.formatPrice(cartTotal) + "</div>" +
        '<div class="pix-delivery-info">' +
          "<strong>Entrega para:</strong> " + escapeHtml(delivery.recipientName) + "<br>" +
          "<strong>Quando:</strong> " + escapeHtml(delivery.deliveryLabel) + "<br>" +
          "<strong>Endereço:</strong> " + escapeHtml(delivery.address) +
          (delivery.isGift && delivery.cardMessage
            ? "<br><strong>Cartão:</strong> " + escapeHtml(delivery.cardMessage)
            : "") +
        "</div>" +
        '<ol class="pix-howto">' +
          "<li>Abra o app do seu banco e escolha <strong>PIX › Pagar com QR Code</strong></li>" +
          "<li>Aponte a câmera para o código ou use o <strong>copia e cola</strong></li>" +
          "<li>Confirme o valor e pronto — a confirmação aqui é automática ✨</li>" +
        "</ol>" +
        (response.qrcodeUrl || response.pixCode
          ? '<div class="pix-qr-frame"><img id="pix-qr" alt="QR Code PIX" src="' +
              escapeHtml(response.qrcodeUrl ||
                ("https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + encodeURIComponent(response.pixCode))) +
              '"></div>'
          : "") +
        '<div class="pix-code-wrap">' +
          "<label>Código PIX (copia e cola)</label>" +
          '<div class="pix-code-row">' +
            '<input id="pix-code" type="text" readonly value="' + escapeHtml(response.pixCode || "") + '">' +
            '<button type="button" class="btn-copy" id="btn-copy-pix">Copiar</button>' +
          "</div>" +
        "</div>" +
        '<div class="pix-expire" id="pix-expire" hidden>O código expira em <strong id="pix-countdown"></strong></div>' +
        '<div class="pix-waiting" id="pix-waiting">' +
          '<span class="pix-spinner" aria-hidden="true"></span>' +
          "<span>Aguardando confirmação do pagamento...</span>" +
        "</div>" +
      "</div>";

    $("btn-copy-pix").addEventListener("click", function () {
      var input = $("pix-code");
      input.select();
      navigator.clipboard.writeText(input.value).then(function () {
        $("btn-copy-pix").textContent = "Copiado!";
        setTimeout(function () { $("btn-copy-pix").textContent = "Copiar"; }, 2000);
      }).catch(function () {
        document.execCommand("copy");
        $("btn-copy-pix").textContent = "Copiado!";
        setTimeout(function () { $("btn-copy-pix").textContent = "Copiar"; }, 2000);
      });
    });

    startPixCountdown(response.expiresAt);
    startPixPolling(response.transactionId);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  var pixPollTimer = null;
  var pixCountdownTimer = null;
  var lastOrder = null;

  function startPixCountdown(expiresAt) {
    if (!expiresAt) return;
    var end = new Date(expiresAt).getTime();
    if (isNaN(end)) return;
    var box = $("pix-expire");
    var out = $("pix-countdown");
    if (!box || !out) return;
    box.hidden = false;
    function tick() {
      var diff = Math.max(0, end - Date.now());
      var totalMin = Math.floor(diff / 60000);
      var hh = Math.floor(totalMin / 60);
      var mm = totalMin % 60;
      var ss = Math.floor((diff % 60000) / 1000);
      out.textContent = (hh > 0 ? hh + "h " : "") + pad(mm) + "min " + pad(ss) + "s";
      if (diff <= 0 && pixCountdownTimer) {
        clearInterval(pixCountdownTimer);
        box.innerHTML = "Código PIX expirado. Gere um novo pedido.";
      }
    }
    tick();
    pixCountdownTimer = setInterval(tick, 1000);
  }

  function showPixApproved() {
    if (pixPollTimer) clearInterval(pixPollTimer);
    if (pixCountdownTimer) clearInterval(pixCountdownTimer);
    var waiting = $("pix-waiting");
    if (waiting) {
      waiting.classList.add("pix-approved");
      waiting.innerHTML = '<span class="pix-check" aria-hidden="true">✓</span>' +
        "<span>Pagamento confirmado!</span>";
    }
    setTimeout(function () { window.paymentApproved(); }, 1400);
  }

  function renderOrderConfirmed(order) {
    var delivery = order.delivery || {};
    var total = typeof order.total === "number" ? order.total : 0;
    var code = order.transactionId
      ? String(order.transactionId).replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase()
      : ("FL" + Date.now().toString().slice(-7));

    $("checkout-content").innerHTML =
      '<div class="checkout-panel order-confirmed">' +
        '<div class="oc-badge"><span class="oc-check" aria-hidden="true">✓</span></div>' +
        '<h1 class="oc-title">Pagamento confirmado!</h1>' +
        '<p class="oc-sub">Recebemos seu pagamento e <strong>já estamos preparando seu pedido</strong> com todo o carinho 🌹</p>' +

        '<div class="oc-steps">' +
          '<div class="oc-step done">' +
            '<span class="oc-dot">✓</span><span class="oc-label">Pagamento aprovado</span>' +
          "</div>" +
          '<div class="oc-step active">' +
            '<span class="oc-dot"><span class="oc-pulse"></span>🌷</span><span class="oc-label">Preparando seu pedido</span>' +
          "</div>" +
          '<div class="oc-step">' +
            '<span class="oc-dot">🛵</span><span class="oc-label">Saiu para entrega</span>' +
          "</div>" +
          '<div class="oc-step">' +
            '<span class="oc-dot">🌹</span><span class="oc-label">Entregue</span>' +
          "</div>" +
        "</div>" +

        '<div class="oc-card">' +
          '<div class="oc-row"><span>Nº do pedido</span><strong>#' + escapeHtml(code) + "</strong></div>" +
          '<div class="oc-row"><span>Entrega para</span><strong>' + escapeHtml(delivery.recipientName || "—") + "</strong></div>" +
          '<div class="oc-row"><span>Quando</span><strong>' + escapeHtml(delivery.deliveryLabel || "—") + "</strong></div>" +
          '<div class="oc-row"><span>Endereço</span><strong>' + escapeHtml(delivery.address || "—") + "</strong></div>" +
          (delivery.isGift && delivery.cardMessage
            ? '<div class="oc-row"><span>Cartão</span><strong>' + escapeHtml(delivery.cardMessage) + "</strong></div>"
            : "") +
          '<div class="oc-row oc-total"><span>Total pago</span><strong>R$ ' + FloresCart.formatPrice(total) + "</strong></div>" +
        "</div>" +

        '<p class="oc-note">Você receberá novidades da entrega por aqui. Qualquer dúvida, é só falar com a gente. 💬</p>' +
        '<a class="btn-primary oc-back" href="../index.html">Voltar à loja</a>' +
      "</div>";

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startPixPolling(transactionId) {
    if (!transactionId) return;
    if (pixPollTimer) clearInterval(pixPollTimer);
    pixPollTimer = setInterval(function () {
      fetch("/api/status?id=" + encodeURIComponent(transactionId))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.paid) showPixApproved();
        })
        .catch(function () { /* tenta de novo no próximo tick */ });
    }, 3000);
  }

  window.paymentApproved = function () {
    var order = lastOrder || {};
    try {
      sessionStorage.removeItem("flores-pending-delivery");
      sessionStorage.removeItem(UPSELL_STORAGE_KEY);
      FloresCart.clear();
    } catch (e) { /* ignora falha de storage */ }
    renderOrderConfirmed(order);
  };

  async function generateOrderPix() {
    var btn = $("btn-pix");
    btn.disabled = true;
    btn.textContent = "Gerando PIX...";

    var delivery = buildDeliveryPayload();

    try {
      var pixTotal = Number(buildPixTotal().toFixed(2));
      if (!Number.isFinite(pixTotal) || pixTotal <= 0) {
        throw new Error("Valor do pedido inválido. Remova e adicione o produto novamente.");
      }

      sessionStorage.setItem("flores-pending-delivery", JSON.stringify(delivery));

      var res = await fetch("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: pixTotal,
          items: buildPixItems(),
          customer: {
            name: formState.buyerName,
            cpf: formState.cpf,
            phone: formState.phone
          },
          address: {
            zipCode: maskCEP(formState.cep),
            street: formState.street,
            number: formState.number,
            complement: formState.complement,
            neighborhood: formState.neighborhood,
            city: formState.city,
            state: formState.state,
            country: "Brasil"
          }
        })
      });
      var response = await res.json();

      if (response && response.success) {
        if(typeof fbq==='function'){fbq('track','Purchase',{value:pixTotal,currency:'BRL'});}
        showPixStep(delivery, response);
        return;
      }

      showError((response && response.error) || "Não foi possível gerar o PIX.");
      btn.disabled = false;
      btn.textContent = "Gerar PIX — R$ " + FloresCart.formatPrice(cartTotal);
    } catch (err) {
      showError(err.message || "Erro ao gerar PIX.");
      btn.disabled = false;
      btn.textContent = "Gerar PIX — R$ " + FloresCart.formatPrice(cartTotal);
    }
  }

  function init() {
    cartItems = FloresCart.getItems();
    loadUpsellSelection();
    if (!cartItems.length) {
      $("checkout-content").innerHTML =
        '<div class="empty-msg"><p>Carrinho vazio</p><a href="../index.html">Ver produtos</a></div>';
      return;
    }
    recalcTotal();
    render();
    if(typeof fbq==='function'){fbq('track','InitiateCheckout',{value:cartTotal,currency:'BRL'});}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
