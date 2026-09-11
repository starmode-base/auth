/**
 * Browser WebAuthn ceremony glue. Converts JSON options from the server to
 * the credential API and serializes results back. Returns null when the user
 * cancels the ceremony.
 */

function isRegistration(
  json: RegistrationResponseJSON | AuthenticationResponseJSON,
): json is RegistrationResponseJSON {
  return "attestationObject" in json.response;
}

function isAuthentication(
  json: RegistrationResponseJSON | AuthenticationResponseJSON,
): json is AuthenticationResponseJSON {
  return "signature" in json.response;
}

export async function createPasskey(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON | null> {
  const credential = await navigator.credentials.create({
    publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
  });

  if (!(credential instanceof PublicKeyCredential)) return null;

  const json = credential.toJSON();
  return isRegistration(json) ? json : null;
}

export async function getPasskey(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON | null> {
  const credential = await navigator.credentials.get({
    publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
  });

  if (!(credential instanceof PublicKeyCredential)) return null;

  const json = credential.toJSON();
  return isAuthentication(json) ? json : null;
}
