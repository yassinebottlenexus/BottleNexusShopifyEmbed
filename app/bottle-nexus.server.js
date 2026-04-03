import prisma from "./db.server";
import {
  DEFAULT_HOME_BUTTON_SETTINGS,
  buildBottleNexusOptions,
  sanitizeHomeButtonSettings,
} from "./bottle-nexus.shared";

const APP_METAFIELD_NAMESPACE = "bottle_nexus";
const THEME_FILES_API_VERSION = "unstable";
const THEME_SNIPPET_START = "<!-- Bottle Nexus Empty Plugin activation:start -->";
const THEME_SNIPPET_END = "<!-- Bottle Nexus Empty Plugin activation:end -->";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function indentBlock(value, spaces) {
  const indentation = " ".repeat(spaces);

  return value
    .split("\n")
    .map((line) => `${indentation}${line}`)
    .join("\n");
}

function safeInlineJson(value) {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

async function parseGraphqlResponse(response) {
  const body = await response.json();

  if (body.errors?.length) {
    throw new Error(body.errors[0].message || "Shopify GraphQL request failed.");
  }

  return body;
}

async function adminGraphql(session, query, variables = {}, apiVersion = "2025-10") {
  const response = await fetch(
    `https://${session.shop}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    },
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `Theme GraphQL request failed (${response.status}): ${JSON.stringify(body).slice(0, 400)}`,
    );
  }

  if (body.errors?.length) {
    throw new Error(body.errors[0].message || "Shopify GraphQL request failed.");
  }

  return body;
}

async function currentAppInstallationId(admin) {
  const response = await admin.graphql(`#graphql
    query bottleNexusCurrentInstallation {
      currentAppInstallation {
        id
      }
    }
  `);
  const body = await parseGraphqlResponse(response);
  const installationId = body.data?.currentAppInstallation?.id;

  if (!installationId) {
    throw new Error("Unable to resolve the current Shopify app installation.");
  }

  return installationId;
}

async function fetchMainTheme(admin) {
  const response = await admin.graphql(`#graphql
    query bottleNexusMainTheme {
      themes(first: 1, roles: [MAIN]) {
        nodes {
          id
          name
          role
        }
      }
    }
  `);
  const body = await parseGraphqlResponse(response);
  const theme = body.data?.themes?.nodes?.[0];

  if (!theme) {
    throw new Error("No published theme was found for this store.");
  }

  return {
    graphQlId: theme.id,
    id: theme.id.split("/").pop(),
    name: theme.name,
  };
}

function buildEmptyPluginSnippet(settings) {
  if (!settings.brandToken) {
    throw new Error("Save a Brand Token before installing the Empty Plugin activation.");
  }

  const optionsJson = JSON.stringify(
    buildBottleNexusOptions(settings),
    null,
    2,
  );

  return `${THEME_SNIPPET_START}
<script type="text/javascript">
    (function () {
        window.BottleNexus ? BottleNexusInit() : loadScript();
        function loadScript() {
            var script = document.createElement('script');
            script.async = true;
            script.src = 'https://buybutton.bottlenexus.com/buybutton.min.js?v=' + Date.now();
            (document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(script);
            script.onload = BottleNexusInit;
        }
        function BottleNexusInit() {
            BottleNexus.init().setConfig({
                token: ${safeInlineJson(settings.brandToken)},
                options: ${indentBlock(optionsJson, 16).trimStart()}
            });
            // Don't forget to put cart-trigger class on cart button.
        }
    })();
</script>
${THEME_SNIPPET_END}`;
}

function injectOrReplaceThemeSnippet(themeSource, snippet) {
  const existingSnippetPattern = new RegExp(
    `${escapeRegExp(THEME_SNIPPET_START)}[\\s\\S]*?${escapeRegExp(THEME_SNIPPET_END)}`,
  );

  if (existingSnippetPattern.test(themeSource)) {
    return themeSource.replace(existingSnippetPattern, snippet);
  }

  const headTagMatch = themeSource.match(/<head[^>]*>/i);

  if (!headTagMatch || headTagMatch.index == null) {
    throw new Error("The published theme does not contain a <head> tag to inject into.");
  }

  const insertionIndex = headTagMatch.index + headTagMatch[0].length;

  return `${themeSource.slice(0, insertionIndex)}
${snippet}
${themeSource.slice(insertionIndex)}`;
}

async function fetchThemeFile(admin, themeGraphQlId, filename) {
  const response = await admin.graphql(
    `#graphql
      query bottleNexusThemeFile($themeId: ID!, $filenames: [String!]!) {
        theme(id: $themeId) {
          id
          files(filenames: $filenames, first: 1) {
            nodes {
              filename
              body {
                ... on OnlineStoreThemeFileBodyText {
                  content
                }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        themeId: themeGraphQlId,
        filenames: [filename],
      },
    },
  );
  const body = await parseGraphqlResponse(response);
  const file = body.data?.theme?.files?.nodes?.[0];
  const content = file?.body?.content;

  if (!content) {
    throw new Error(`Shopify did not return text content for ${filename}.`);
  }

  return content;
}

async function upsertThemeFile(session, themeGraphQlId, filename, value) {
  const body = await adminGraphql(
    session,
    `mutation bottleNexusThemeFilesUpsert(
      $files: [OnlineStoreThemeFilesUpsertFileInput!]!,
      $themeId: ID!
    ) {
      themeFilesUpsert(files: $files, themeId: $themeId) {
        upsertedThemeFiles {
          filename
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      themeId: themeGraphQlId,
      files: [
        {
          filename,
          body: {
            type: "TEXT",
            value,
          },
        },
      ],
    },
    THEME_FILES_API_VERSION,
  );
  const userErrors = body.data?.themeFilesUpsert?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors[0].message);
  }

  return body.data?.themeFilesUpsert?.upsertedThemeFiles ?? [];
}

export async function getBottleNexusSettings(shop) {
  return prisma.bottleNexusSettings.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      brandToken: "",
      ...DEFAULT_HOME_BUTTON_SETTINGS,
    },
  });
}

export async function saveBottleNexusStyles(shop, rawSettings) {
  const sanitized = sanitizeHomeButtonSettings(rawSettings);

  return prisma.bottleNexusSettings.upsert({
    where: { shop },
    update: sanitized,
    create: {
      shop,
      brandToken: "",
      ...sanitized,
    },
  });
}

export async function saveBottleNexusBrandToken(shop, brandToken) {
  return prisma.bottleNexusSettings.upsert({
    where: { shop },
    update: {
      brandToken,
    },
    create: {
      shop,
      brandToken,
      ...DEFAULT_HOME_BUTTON_SETTINGS,
    },
  });
}

export async function markEmptyPluginInstalled(shop, themeId) {
  return prisma.bottleNexusSettings.update({
    where: { shop },
    data: {
      emptyPluginThemeId: themeId,
      emptyPluginInstalledAt: new Date(),
    },
  });
}

export async function syncBottleNexusAppData(admin, settings) {
  const installationId = await currentAppInstallationId(admin);
  const options = buildBottleNexusOptions(settings);
  const response = await admin.graphql(
    `#graphql
      mutation bottleNexusMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: installationId,
            namespace: APP_METAFIELD_NAMESPACE,
            key: "brand_token",
            type: "single_line_text_field",
            value: settings.brandToken ?? "",
          },
          {
            ownerId: installationId,
            namespace: APP_METAFIELD_NAMESPACE,
            key: "default_options",
            type: "json",
            value: JSON.stringify(options),
          },
          {
            ownerId: installationId,
            namespace: APP_METAFIELD_NAMESPACE,
            key: "plugin_installed",
            type: "boolean",
            value: settings.emptyPluginInstalledAt ? "true" : "false",
          },
        ],
      },
    },
  );

  const body = await parseGraphqlResponse(response);
  const userErrors = body.data?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(userErrors[0].message);
  }

  return body.data?.metafieldsSet?.metafields ?? [];
}

export async function installEmptyPluginActivation({ admin, session, settings }) {
  const theme = await fetchMainTheme(admin);
  const currentThemeSource = await fetchThemeFile(
    admin,
    theme.graphQlId,
    "layout/theme.liquid",
  );

  const updatedThemeSource = injectOrReplaceThemeSnippet(
    currentThemeSource,
    buildEmptyPluginSnippet(settings),
  );

  await upsertThemeFile(
    session,
    theme.graphQlId,
    "layout/theme.liquid",
    updatedThemeSource,
  );

  return theme;
}

export async function syncInstalledEmptyPluginActivation({
  admin,
  session,
  settings,
}) {
  if (!settings.emptyPluginInstalledAt) {
    return null;
  }

  return installEmptyPluginActivation({ admin, session, settings });
}
