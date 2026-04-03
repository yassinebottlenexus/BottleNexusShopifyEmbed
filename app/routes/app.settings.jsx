import { useEffect, useState } from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getBottleNexusSettings,
  installEmptyPluginActivation,
  markEmptyPluginInstalled,
  saveBottleNexusBrandToken,
  syncBottleNexusAppData,
  syncInstalledEmptyPluginActivation,
} from "../bottle-nexus.server";
import { serializeBottleNexusSettings } from "../bottle-nexus.shared";
import styles from "../styles/bottle-nexus-admin.module.css";

function buildAppBlockEditorUrl(shop, apiKey) {
  const url = new URL(`https://${shop}/admin/themes/current/editor`);

  url.searchParams.set("template", "product");
  url.searchParams.set(
    "addAppBlockId",
    `${apiKey}/bottle-nexus-buy-button`,
  );
  url.searchParams.set("target", "mainSection");

  return url.toString();
}

function buildActionResponse(settings, messages, status = "success") {
  return {
    status,
    message: messages.join(" "),
    settings: serializeBottleNexusSettings(settings),
  };
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getBottleNexusSettings(session.shop);
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";

  return {
    settings: serializeBottleNexusSettings(settings),
    appBlockEditorUrl: buildAppBlockEditorUrl(session.shop, apiKey),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save-token") {
    const brandToken = String(formData.get("brandToken") || "").trim();
    const settings = await saveBottleNexusBrandToken(session.shop, brandToken);
    const messages = [
      brandToken ? "Brand Token saved." : "Brand Token cleared.",
    ];
    let status = "success";

    try {
      await syncBottleNexusAppData(admin, settings);
    } catch (error) {
      status = "warning";
      messages.push(
        `Theme extension data could not be synced: ${error.message}`,
      );
    }

    if (settings.emptyPluginInstalledAt && brandToken) {
      try {
        const theme = await syncInstalledEmptyPluginActivation({
          admin,
          session,
          settings,
        });

        if (theme) {
          messages.push(`Published theme synced in ${theme.name}.`);
        }
      } catch (error) {
        status = "warning";
        messages.push(
          `The published theme loader could not be updated: ${error.message}`,
        );
      }
    }

    if (settings.emptyPluginInstalledAt && !brandToken) {
      status = "warning";
      messages.push(
        "The published theme keeps its last installed token until a new token is saved and installed again.",
      );
    }

    return buildActionResponse(settings, messages, status);
  }

  if (intent === "install-activation") {
    const settings = await getBottleNexusSettings(session.shop);

    if (!settings.brandToken) {
      return {
        status: "error",
        message: "Save a Brand Token before installing the Empty Plugin activation.",
        settings: serializeBottleNexusSettings(settings),
      };
    }

    try {
      const theme = await installEmptyPluginActivation({ admin, session, settings });
      const installedSettings = await markEmptyPluginInstalled(
        session.shop,
        theme.id,
      );
      const messages = [
        `Empty Plugin activation installed in ${theme.name}.`,
      ];
      let status = "success";

      try {
        await syncBottleNexusAppData(admin, installedSettings);
      } catch (error) {
        status = "warning";
        messages.push(
          `Theme extension data could not be updated: ${error.message}`,
        );
      }

      return buildActionResponse(installedSettings, messages, status);
    } catch (error) {
      return {
        status: "error",
        message: `Empty Plugin activation could not be installed: ${error.message}`,
        settings: serializeBottleNexusSettings(settings),
      };
    }
  }

  const settings = await getBottleNexusSettings(session.shop);

  return {
    status: "error",
    message: "Unknown settings action requested.",
    settings: serializeBottleNexusSettings(settings),
  };
};

export default function SettingsPage() {
  const { settings, appBlockEditorUrl } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const currentSettings = actionData?.settings ?? settings;
  const [brandTokenValue, setBrandTokenValue] = useState(
    currentSettings.brandToken,
  );
  const isSavingToken =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "save-token";
  const isInstalling =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "install-activation";

  useEffect(() => {
    setBrandTokenValue(currentSettings.brandToken);
  }, [currentSettings.brandToken]);

  useEffect(() => {
    if (actionData?.message) {
      shopify.toast.show(actionData.message);
    }
  }, [actionData?.message, shopify]);

  const statusClassName =
    actionData?.status === "warning"
      ? `${styles.statusNotice} ${styles.statusWarning}`
      : actionData?.status === "error"
        ? `${styles.statusNotice} ${styles.statusError}`
        : `${styles.statusNotice} ${styles.statusSuccess}`;

  return (
    <s-page heading="Bottle Nexus settings">
      <p className={styles.pageIntro}>
        Save the Brand Token used by Bottle Nexus, install the Empty Plugin
        activation script into `theme.liquid`, and jump straight into the
        Shopify theme editor to place the buy button widget.
      </p>

      <div className={styles.settingsStack}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Brand Token</h2>
          <p className={styles.cardText}>
            This token is stored per shop in Prisma and synced to an app-data
            metafield so the theme widget and the global activation embed can
            both read it without exposing another merchant setup step.
          </p>

          {actionData?.message ? (
            <div className={statusClassName}>{actionData.message}</div>
          ) : null}

          <Form method="post">
            <input type="hidden" name="intent" value="save-token" />

            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Brand Token</span>
              <input
                className={styles.textInput}
                type="text"
                name="brandToken"
                value={brandTokenValue}
                onChange={(event) => setBrandTokenValue(event.target.value)}
                placeholder="Paste the merchant Brand Token"
              />
              <span className={styles.fieldHint}>
                Use the exact token that Bottle Nexus should pass into
                `BottleNexus.init()`.
              </span>
            </label>

            <div className={styles.buttonRow}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isSavingToken}
              >
                {isSavingToken ? "Saving token..." : "Save Brand Token"}
              </button>
              <p className={styles.smallMeta}>
                Current state:{" "}
                {currentSettings.brandToken ? "Token saved" : "Token missing"}
              </p>
            </div>
          </Form>
        </section>

        <div className={styles.twoColumnGrid}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Enable Empty Plugin activation</h2>
            <p className={styles.cardText}>
              This action writes the Bottle Nexus activation script into the
              published theme&apos;s `layout/theme.liquid` file right after the
              opening `&lt;head&gt;` tag. Shopify requires protected-scope
              approval before this can succeed in production.
            </p>

            <div className={styles.microGrid}>
              <p className={styles.smallMeta}>
                Save the Brand Token first, then install the activation. If
                Shopify hasn&apos;t approved the protected scope yet, this step
                will continue to return an access-denied message.
              </p>
            </div>

            <Form method="post">
              <input type="hidden" name="intent" value="install-activation" />

              <div className={styles.buttonRow}>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={!currentSettings.brandToken || isInstalling}
                >
                  {isInstalling
                    ? "Enabling activation..."
                    : "Enable Empty Plugin activation"}
                </button>
                <p className={styles.smallMeta}>
                  Requires a saved Brand Token, `write_themes`, and Shopify
                  protected-scope approval.
                </p>
              </div>
            </Form>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Bottle nexus buy button block</h2>
            <p className={styles.cardText}>
              The theme app extension adds a product block named
              &quot;Bottle nexus buy button&quot;. Merchants can open the
              product template shortcut below and place the widget directly into
              the Online Store editor.
            </p>

            <ol className={styles.detailsList}>
              <li>Save the Brand Token in this page.</li>
              <li>Enable the Empty Plugin activation in `theme.liquid`.</li>
              <li>Open the product template and add the app block.</li>
              <li>Set the Product ID and widget-specific button options.</li>
            </ol>

            <div className={styles.buttonRow}>
              <a
                className={styles.secondaryButton}
                href={appBlockEditorUrl}
                target="_top"
                rel="noreferrer"
              >
                Open Product Template
              </a>
            </div>
          </section>
        </div>
      </div>
    </s-page>
  );
}
