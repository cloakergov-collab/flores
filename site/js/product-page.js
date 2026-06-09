window.ProductPage = (function () {
  var state = {
    slug: "",
    product: null,
    quantity: 1,
    selectedColor: null,
    extras: {},
    notes: ""
  };

  function $(id) { return document.getElementById(id); }

  function calcDiscount(oldP, current) {
    if (!oldP || oldP <= current) return 0;
    return Math.round((1 - current / oldP) * 100);
  }

  function totalExtrasCount() {
    return Object.values(state.extras).reduce(function (a, b) { return a + b; }, 0);
  }

  function canAdd() {
    if (state.product.hasColor && !state.selectedColor) return false;
    return true;
  }

  function updateUI() {
    var addBtn = $("btn-add");
    var total = state.product.price * state.quantity;
    $("footer-qty-value").textContent = state.quantity;
    $("btn-add-price").textContent = "R$ " + FloresCart.formatPrice(total);

    if (addBtn) addBtn.disabled = !canAdd();

    if (state.product.hasColor) {
      $("color-counter").textContent = (state.selectedColor ? "1" : "0") + "/1";
      $("color-check").classList.toggle("done", !!state.selectedColor);
    }

    var extrasTotal = totalExtrasCount();
    $("extras-counter").textContent = extrasTotal + "/7";
    $("extras-check").classList.toggle("done", extrasTotal > 0);

    $("notes-count").textContent = state.notes.length + "/140";
    updateCartFab();
  }

  function updateCartFab() {
    var count = FloresCart.getCount();
    var fab = $("cart-fab");
    var badge = $("cart-fab-badge");
    if (!fab) return;
    fab.classList.toggle("visible", count > 0);
    if (badge) badge.textContent = count;
  }

  function showToast(msg) {
    var toast = $("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 2500);
  }

  function toggleSection(id) {
    $(id).classList.toggle("open");
  }

  function renderCart() {
    var items = FloresCart.getItems();
    var body = $("cart-body");
    var footer = $("cart-footer");

    if (items.length === 0) {
      body.innerHTML = '<div class="cart-empty"><p>Seu carrinho está vazio</p></div>';
      footer.style.display = "none";
      return;
    }

    footer.style.display = "block";
    var total = 0;
    body.innerHTML = items.map(function (item) {
      total += item.subtotal;
      var opts = [];
      if (item.color) opts.push(item.color);
      if (item.extras && item.extras.length) opts.push(item.extras.join(", "));
      if (item.notes) opts.push('Obs: "' + item.notes + '"');
      return (
        '<div class="cart-item">' +
          '<img src="../../images/' + item.img + '" alt="' + item.name + '" onerror="this.style.opacity=0.3">' +
          '<div class="cart-item-info">' +
            '<h3>' + item.name + ' × ' + item.quantity + '</h3>' +
            (opts.length ? '<p>' + opts.join(" · ") + '</p>' : '') +
            '<div class="cart-item-price">R$ ' + FloresCart.formatPrice(item.subtotal) + '</div>' +
          '</div>' +
          '<button type="button" class="cart-item-remove" data-remove-id="' + item.id + '" aria-label="Remover ' + item.name + ' do carrinho">✕</button>' +
        '</div>'
      );
    }).join("");

    $("cart-total-value").textContent = "R$ " + FloresCart.formatPrice(total);
  }

  function openCart() {
    renderCart();
    $("cart-overlay").classList.add("open");
    $("cart-drawer").classList.add("open");
  }

  function closeCart() {
    $("cart-overlay").classList.remove("open");
    $("cart-drawer").classList.remove("open");
  }

  function addToCart() {
    if (!canAdd()) {
      showToast("Escolha o tipo de flor");
      $("color-section").classList.add("open");
      return;
    }

    var extrasList = FLORES_EXTRAS
      .filter(function (e) { return (state.extras[e.id] || 0) > 0; })
      .map(function (e) { return e.name + (state.extras[e.id] > 1 ? " ×" + state.extras[e.id] : ""); });

    FloresCart.addItem({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      productId: state.slug,
      name: state.product.name,
      img: state.product.img,
      quantity: state.quantity,
      basePrice: state.product.price,
      subtotal: state.product.price * state.quantity,
      color: state.selectedColor,
      extras: extrasList,
      notes: state.notes.trim()
    });

    showToast("Adicionado ao carrinho!");
    if(typeof fbq==='function'){fbq('track','AddToCart',{value:state.product.price*state.quantity,currency:'BRL',content_name:state.product.name});}

    openCart();
  }

  function bindEvents() {
    $("btn-back").addEventListener("click", function () {
      window.location.href = "../../index.html";
    });

    $("color-header").addEventListener("click", function () { toggleSection("color-section"); });
    $("extras-header").addEventListener("click", function () { toggleSection("extras-section"); });

    document.querySelectorAll('input[name="color"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        state.selectedColor = radio.value;
        updateUI();
      });
    });

    document.querySelectorAll("[data-extra]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.extra;
        var action = btn.dataset.action;
        var current = state.extras[id] || 0;
        if (action === "plus" && totalExtrasCount() < 7) {
          state.extras[id] = current + 1;
        } else if (action === "minus" && current > 0) {
          state.extras[id] = current - 1;
        }
        $("extra-qty-" + id).textContent = state.extras[id] || 0;
        updateUI();
      });
    });

    $("footer-qty-minus").addEventListener("click", function () {
      if (state.quantity > 1) { state.quantity--; updateUI(); }
    });
    $("footer-qty-plus").addEventListener("click", function () {
      state.quantity++; updateUI();
    });

    $("notes-input").addEventListener("input", function (e) {
      state.notes = e.target.value.slice(0, 140);
      e.target.value = state.notes;
      updateUI();
    });

    $("btn-add").addEventListener("click", addToCart);
    $("cart-fab").addEventListener("click", openCart);
    $("cart-close").addEventListener("click", closeCart);
    $("cart-overlay").addEventListener("click", closeCart);
    $("btn-continue").addEventListener("click", closeCart);
    $("btn-checkout").addEventListener("click", function () {
      window.location.href = "../../checkout/index.html";
    });

    $("cart-body").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-remove-id]");
      if (!btn) return;
      FloresCart.removeItem(btn.dataset.removeId);
      showToast("Item removido do carrinho");
    });

    window.addEventListener("flores-cart-updated", function () {
      updateCartFab();
      if ($("cart-drawer").classList.contains("open")) {
        renderCart();
      }
    });
  }

  function init(slug) {
    state.slug = slug;
    state.product = FLORES_PRODUCTS[slug];
    if (!state.product) {
      document.body.innerHTML = "<p style='padding:40px;text-align:center'>Produto não encontrado. <a href='../../index.html'>Voltar</a></p>";
      return;
    }

    FLORES_EXTRAS.forEach(function (e) { state.extras[e.id] = 0; });

    document.title = state.product.name + " — Flores";

    $("product-image").src = "../../images/" + state.product.img;
    $("product-image").alt = state.product.name;
    $("product-name").textContent = state.product.name;
    $("product-description").textContent = state.product.description;
    $("price-old").textContent = "R$ " + FloresCart.formatPrice(state.product.oldPrice);
    $("price-current").textContent = "R$ " + FloresCart.formatPrice(state.product.price);

    var discount = calcDiscount(state.product.oldPrice, state.product.price);
    if (discount > 0) {
      $("discount-badge").textContent = "🔥 " + discount + "% OFF";
      $("discount-badge").style.display = "inline-flex";
    }

    if (!state.product.hasColor) {
      $("color-section").style.display = "none";
    }

    bindEvents();
    updateUI();
    $("color-section").classList.add("open");
  }

  return { init: init };
})();
