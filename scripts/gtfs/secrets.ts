export type AuthConfig =
  | { type: "none" }
  | { type: "query_param"; param: string; value_secret: string }
  | { type: "header"; header: string; value_secret: string; value_template?: string };

export interface ResolvedAuth {
  url: string;
  headers: Record<string, string>;
}

export class MissingSecretError extends Error {
  constructor(public secretName: string) {
    super(`secret ${secretName} is not set in environment`);
    this.name = "MissingSecretError";
  }
}

function getSecret(env: Record<string, string | undefined>, name: string): string {
  const v = env[name];
  if (v === undefined || v === "") throw new MissingSecretError(name);
  return v;
}

export function resolveAuth(
  baseUrl: string,
  auth: AuthConfig,
  env: Record<string, string | undefined>
): ResolvedAuth {
  if (auth.type === "none") {
    return { url: baseUrl, headers: {} };
  }

  if (auth.type === "query_param") {
    const value = getSecret(env, auth.value_secret);
    const sep = baseUrl.includes("?") ? "&" : "?";
    return {
      url: `${baseUrl}${sep}${encodeURIComponent(auth.param)}=${encodeURIComponent(value)}`,
      headers: {},
    };
  }

  // header
  const secret = getSecret(env, auth.value_secret);
  const value = auth.value_template ? auth.value_template.replace("${SECRET}", secret) : secret;
  return { url: baseUrl, headers: { [auth.header]: value } };
}

export function resolveUrl(urlSecret: string, env: Record<string, string | undefined>): string {
  return getSecret(env, urlSecret);
}
