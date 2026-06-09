window.FloresCart = (function () {
  var STORAGE_KEY = "flores-pedii-cart";

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("flores-cart-updated", { detail: items }));
  }

  function formatPrice(value) {
    return value.toFixed(2).replace(".", ",");
  }

  function parsePrice(str) {
    return parseFloat(String(str).replace(",", "."));
  }

  return {
    getItems: load,
    getCount: function () {
      return load().reduce(function (sum, item) { return sum + item.quantity; }, 0);
    },
    addItem: function (item) {
      var items = load();
      items.push(item);
      save(items);
    },
    removeItem: function (id) {
      save(load().filter(function (item) { return item.id !== id; }));
    },
    clear: function () {
      save([]);
    },
    formatPrice: formatPrice,
    parsePrice: parsePrice
  };
})();
