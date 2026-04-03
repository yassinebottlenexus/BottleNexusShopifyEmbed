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
  saveBottleNexusStyles,
  syncBottleNexusAppData,
  syncInstalledEmptyPluginActivation,
} from "../bottle-nexus.server";
import {
  sanitizeHomeButtonSettings,
  serializeBottleNexusSettings,
} from "../bottle-nexus.shared";
import styles from "../styles/bottle-nexus-admin.module.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getBottleNexusSettings(session.shop);

  return { settings: serializeBottleNexusSettings(settings) };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") !== "save-styles") {
    const settings = await getBottleNexusSettings(session.shop);

    return {
      status: "error",
      message: "Unknown Home action requested.",
      settings: serializeBottleNexusSettings(settings),
    };
  }

  const settings = await saveBottleNexusStyles(
    session.shop,
    Object.fromEntries(formData),
  );
  const messages = ["Empty Plugin default styles saved."];
  let status = "success";

  try {
    await syncBottleNexusAppData(admin, settings);
  } catch (error) {
    status = "warning";
    messages.push(`Theme extension data could not be synced: ${error.message}`);
  }

  if (settings.emptyPluginInstalledAt) {
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

  return {
    status,
    message: messages.join(" "),
    settings: serializeBottleNexusSettings(settings),
  };
};

export default function Index() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const latestSettings = actionData?.settings ?? settings;
  const [formValues, setFormValues] = useState(latestSettings);
  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "save-styles";

  const previewSettings = sanitizeHomeButtonSettings(formValues);

  useEffect(() => {
    setFormValues(latestSettings);
  }, [latestSettings]);

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

  const previewButtonStyle = {
    backgroundColor: previewSettings.buttonBackground,
    borderRadius: `${previewSettings.buttonRadius}px`,
    color: previewSettings.buttonTextColor,
    fontSize: `${previewSettings.buttonFontSize}px`,
    width: `${previewSettings.buttonWidth}px`,
  };

  return (
    <s-page heading="Empty Plugin activation">
      <p className={styles.pageIntro}>
        Set the default styling that the Empty Plugin activation script should
        use when it is installed into `theme.liquid`. The checkout button
        automatically mirrors the main button background and text color.
      </p>

      <div className={styles.twoColumnGrid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Default button styling</h2>
          <p className={styles.cardText}>
            These values are stored per shop and reused only when the Empty
            Plugin activation script is installed into the shop theme.
          </p>

          {actionData?.message ? (
            <div className={statusClassName}>{actionData.message}</div>
          ) : null}

          <Form method="post">
            <input type="hidden" name="intent" value="save-styles" />

            <div className={styles.formGrid}>
              <label className={`${styles.fieldGroup} ${styles.fullWidthField}`}>
                <span className={styles.fieldLabel}>Button text</span>
                <input
                  className={styles.textInput}
                  type="text"
                  name="buttonText"
                  value={formValues.buttonText}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      buttonText: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Border radius</span>
                <input
                  className={styles.numberInput}
                  type="number"
                  min="0"
                  max="48"
                  name="buttonRadius"
                  value={formValues.buttonRadius}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      buttonRadius: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Font size</span>
                <input
                  className={styles.numberInput}
                  type="number"
                  min="10"
                  max="32"
                  name="buttonFontSize"
                  value={formValues.buttonFontSize}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      buttonFontSize: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Button width</span>
                <input
                  className={styles.numberInput}
                  type="number"
                  min="120"
                  max="480"
                  name="buttonWidth"
                  value={formValues.buttonWidth}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      buttonWidth: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Background color</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  name="buttonBackground"
                  value={previewSettings.buttonBackground}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      buttonBackground: event.target.value,
                    }))
                  }
                />
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Text color</span>
                <input
                  className={styles.colorInput}
                  type="color"
                  name="buttonTextColor"
                  value={previewSettings.buttonTextColor}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      buttonTextColor: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className={styles.buttonRow}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? "Saving styles..." : "Save default styling"}
              </button>
              <a className={styles.linkButton} href="/app/settings">
                Open Brand Token settings
              </a>
            </div>
          </Form>
        </section>

        <section className={styles.previewCanvas}>
          <div className={styles.previewButtonStage}>
            <button
              className={styles.previewButton}
              type="button"
              style={previewButtonStyle}
            >
              {previewSettings.buttonText}
            </button>
          </div>
        </section>
      </div>
    </s-page>
  );
}
