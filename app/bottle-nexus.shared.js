export const DEFAULT_HOME_BUTTON_SETTINGS = Object.freeze({
  buttonRadius: 5,
  buttonFontSize: 16,
  buttonWidth: 250,
  buttonText: "Add to cart",
  buttonTextColor: "#FFFFFF",
  buttonBackground: "#27AE60",
});

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export function normalizeHexColor(value, fallback) {
  const candidate = String(value ?? "").trim().toUpperCase();

  if (/^#[0-9A-F]{6}$/.test(candidate)) {
    return candidate;
  }

  if (/^#[0-9A-F]{8}$/.test(candidate)) {
    return candidate.slice(0, 7);
  }

  return fallback;
}

export function toBottleNexusHex(value, fallback) {
  return `${normalizeHexColor(value, fallback)}FF`;
}

export function sanitizeHomeButtonSettings(raw = {}) {
  return {
    buttonRadius: clampInteger(
      raw.buttonRadius,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonRadius,
      0,
      48,
    ),
    buttonFontSize: clampInteger(
      raw.buttonFontSize,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonFontSize,
      10,
      32,
    ),
    buttonWidth: clampInteger(
      raw.buttonWidth,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonWidth,
      120,
      480,
    ),
    buttonText:
      String(raw.buttonText ?? "").trim() ||
      DEFAULT_HOME_BUTTON_SETTINGS.buttonText,
    buttonTextColor: normalizeHexColor(
      raw.buttonTextColor,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonTextColor,
    ),
    buttonBackground: normalizeHexColor(
      raw.buttonBackground,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonBackground,
    ),
  };
}

export function buildBottleNexusOptions(raw = {}) {
  const settings = sanitizeHomeButtonSettings(raw);

  return {
    iframe: true,
    layout: "basic",
    behavior: "sidebar",
    buttonRadius: settings.buttonRadius,
    buttonFontSize: settings.buttonFontSize,
    buttonWidth: settings.buttonWidth,
    buttonAlignment: "center",
    buttonText: settings.buttonText,
    buttonTextColor: toBottleNexusHex(
      settings.buttonTextColor,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonTextColor,
    ),
    buttonBackground: toBottleNexusHex(
      settings.buttonBackground,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonBackground,
    ),
    initialQuantity: 1,
    cartButtonRadius: settings.buttonRadius,
    cartCheckoutBackgroundColor: toBottleNexusHex(
      settings.buttonBackground,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonBackground,
    ),
    cartCheckoutBackgroundDisabledColor: "#B2B2B2FF",
    cartCheckoutTextColor: toBottleNexusHex(
      settings.buttonTextColor,
      DEFAULT_HOME_BUTTON_SETTINGS.buttonTextColor,
    ),
    cartHeadingText: "Cart",
    cartCheckoutText: "Checkout",
    cartEmptyText: "No products added",
    cartAdditionalInformationText: "",
    cartBackgroundColor: "#FEFEFEFF",
    cartTextColor: "#000000FF",
    showInput: true,
    utm: {
      source: "BuyButton",
    },
    donation: "no_donation",
    styles: {},
  };
}

export function serializeBottleNexusSettings(record) {
  const settings = sanitizeHomeButtonSettings(record);

  return {
    shop: record.shop,
    brandToken: record.brandToken ?? "",
    ...settings,
    emptyPluginThemeId: record.emptyPluginThemeId ?? "",
    emptyPluginInstalledAt: record.emptyPluginInstalledAt
      ? record.emptyPluginInstalledAt.toISOString()
      : null,
  };
}
