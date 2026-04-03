(function () {
  var SCRIPT_SRC = "https://buybutton.bottlenexus.com/buybutton.min.js";
  var loaderPromise;

  function getBottleNexusClient() {
    if (
      window.bottlenexus &&
      typeof window.bottlenexus.addToCart === "function"
    ) {
      return window.bottlenexus;
    }

    if (
      window.BottleNexus &&
      typeof window.BottleNexus.addToCart === "function"
    ) {
      return window.BottleNexus;
    }

    return null;
  }

  function loadBottleNexusClient() {
    var existingClient = getBottleNexusClient();

    if (existingClient) {
      return Promise.resolve(existingClient);
    }

    if (loaderPromise) {
      return loaderPromise;
    }

    loaderPromise = new Promise(function (resolve, reject) {
      var existingScript = document.querySelector('script[data-bnx-loader="true"]');

      if (existingScript) {
        existingScript.addEventListener("load", function () {
          var loadedClient = getBottleNexusClient();

          if (loadedClient) {
            resolve(loadedClient);
            return;
          }

          reject(new Error("Bottle Nexus client did not expose addToCart."));
        });
        existingScript.addEventListener("error", reject);
        return;
      }

      var script = document.createElement("script");
      script.async = true;
      script.dataset.bnxLoader = "true";
      script.src = SCRIPT_SRC + "?v=" + Date.now();
      script.onload = function () {
        var loadedClient = getBottleNexusClient();

        if (loadedClient) {
          resolve(loadedClient);
          return;
        }

        reject(new Error("Bottle Nexus client did not expose addToCart."));
      };
      script.onerror = reject;
      (document.head || document.body).appendChild(script);
    });

    return loaderPromise;
  }

  function parseProductId(value) {
    var candidate = String(value || "").trim();

    if (/^\d+$/.test(candidate)) {
      return Number(candidate);
    }

    return candidate;
  }

  function parseQuantity(root) {
    var input = root.querySelector("[data-bnx-quantity-input]");

    if (!input) {
      return 1;
    }

    var parsed = Number.parseInt(input.value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      input.value = "1";
      return 1;
    }

    return parsed;
  }

  function changeQuantity(button, delta) {
    var root = button.closest(".bnx-add-to-cart-block");
    var input = root && root.querySelector("[data-bnx-quantity-input]");

    if (!input) {
      return;
    }

    var current = Number.parseInt(input.value, 10);

    if (!Number.isFinite(current) || current < 1) {
      current = 1;
    }

    input.value = String(Math.max(1, current + delta));
  }

  function setButtonState(button, loading) {
    button.disabled = loading;
    button.style.opacity = loading ? "0.7" : "1";
  }

  function clearAnimation(button) {
    if (button._bnxAnimationTimeoutA) {
      window.clearTimeout(button._bnxAnimationTimeoutA);
    }

    if (button._bnxAnimationTimeoutB) {
      window.clearTimeout(button._bnxAnimationTimeoutB);
    }

    button.classList.remove(
      "is-bnx-bounce",
      "is-bnx-shake",
      "is-bnx-zoom",
      "is-bnx-opacity",
    );
  }

  function applyAnimation(button) {
    var label = button.querySelector("[data-bnx-button-label]");
    var defaultText = button.dataset.defaultText || (label && label.textContent) || "";
    var enabled = button.dataset.bnxEnableAnimation === "true";
    var startText = (button.dataset.bnxAnimationStartText || "").trim();
    var endText = (button.dataset.bnxAnimationEndText || "").trim();
    var preset = button.dataset.bnxAnimationPreset || "none";
    var duration = Number.parseInt(button.dataset.bnxAnimationDuration, 10);

    if (!label || !enabled) {
      return;
    }

    if (!Number.isFinite(duration) || duration < 100) {
      duration = 500;
    }

    clearAnimation(button);

    if (startText) {
      label.textContent = startText;
    }

    if (preset !== "none") {
      button.classList.add("is-bnx-" + preset);
    }

    button._bnxAnimationTimeoutA = window.setTimeout(function () {
      button.classList.remove(
        "is-bnx-bounce",
        "is-bnx-shake",
        "is-bnx-zoom",
        "is-bnx-opacity",
      );

      label.textContent = endText || defaultText;
    }, duration);

    button._bnxAnimationTimeoutB = window.setTimeout(function () {
      label.textContent = defaultText;
    }, duration * 2);
  }

  function handleAddToCart(button) {
    var root = button.closest(".bnx-add-to-cart-block");
    var token = button.dataset.token;
    var productId = parseProductId(button.dataset.productId);
    var quantity = root ? parseQuantity(root) : 1;

    if (!token || !productId) {
      return;
    }

    applyAnimation(button);
    setButtonState(button, true);

    loadBottleNexusClient()
      .then(function (client) {
        client.addToCart(productId, token, {
          quantity: quantity,
          donation: "suggest",
          engravingLines: null,
        });
      })
      .catch(function (error) {
        console.error("Bottle Nexus: addToCart failed", error);
      })
      .finally(function () {
        window.setTimeout(function () {
          setButtonState(button, false);
        }, 150);
      });
  }

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    var decrement = event.target.closest("[data-bnx-qty-decrement]");

    if (decrement) {
      event.preventDefault();
      changeQuantity(decrement, -1);
      return;
    }

    var increment = event.target.closest("[data-bnx-qty-increment]");

    if (increment) {
      event.preventDefault();
      changeQuantity(increment, 1);
      return;
    }

    var button = event.target.closest("[data-bnx-add-to-cart-button]");

    if (!button) {
      return;
    }

    event.preventDefault();

    if (button.disabled) {
      return;
    }

    handleAddToCart(button);
  });
})();
