import type { AuthUser, Result } from "@starmode/auth";

export type {
  Auth,
  AuthUser,
  OtpAuthenticateResult,
  OtpEngine,
  OtpStrategy,
  Result,
  SessionAdapter,
  SessionCapabilitySet,
  SessionIdentity,
  SessionKernel,
  SessionNamespace,
  SessionResolver,
  StrategyKernel,
} from "@starmode/auth";
export { makeAuth } from "@starmode/auth";

/**
 * Passkey ceremony inputs, picked from the standard WebAuthn JSON types:
 * exactly the fields verification consumes. Everything outside the signed bytes
 * is unauthenticated and not accepted. The output of
 * PublicKeyCredential.toJSON() satisfies these shapes.
 */
export type PasskeyRegistrationCredential = {
  response: Pick<
    AuthenticatorAttestationResponseJSON,
    "clientDataJSON" | "attestationObject"
  >;
};

/** See PasskeyRegistrationCredential. id locates the stored credential; the signature check binds it. */
export type PasskeyAuthenticationCredential = Pick<
  AuthenticationResponseJSON,
  "id"
> & {
  response: Pick<
    AuthenticatorAssertionResponseJSON,
    "clientDataJSON" | "authenticatorData" | "signature"
  >;
};

/** The three registration workflows have different authority and session consequences */
export type RegistrationIntent = "sign-up" | "vouched" | "add";

/**
 * Registration context carried through the ceremony.
 *
 * sign-up founds a new account. vouched attaches to an existing user the
 * application has verified by its own proof; it is minted by a server-side
 * operation only, never from client input. add attaches to the current
 * session's user.
 */
export type RegistrationContext =
  | {
      intent: "sign-up";
      userId: null;
    }
  | {
      intent: "vouched";
      userId: string;
    }
  | {
      intent: "add";
      userId: string;
    };

/** Registration identity returned by the strategy after verification */
export type RegisteredPasskeyUser = {
  intent: RegistrationIntent;
  userId: string;
};

/**
 * Complete trusted passkey authentication engine.
 *
 * The object owns user provisioning, application policy, WebAuthn, challenge
 * lifecycle, credential persistence, and counter handling. Its operations are
 * called independently because they span separate public workflows and server
 * requests. Credential management is not part of the strategy; the
 * application manages stored credentials directly.
 *
 * Engine operations prove or provision a user but never establish a session.
 * The strategy wrapper owns session establishment for the workflows that
 * authenticate a user.
 *
 * A direct implementation replaces the passkey authentication engine. Helpers
 * may produce this same object from lower-level WebAuthn, challenge, storage,
 * and application-user primitives.
 */
export type PasskeyEngine = {
  createRegistrationOptions: (
    context: RegistrationContext,
  ) => Promise<
    Result<PublicKeyCredentialCreationOptionsJSON, "registration_disabled">
  >;
  verifyRegistration: (args: {
    credential: PasskeyRegistrationCredential;
  }) => Promise<
    Result<
      RegisteredPasskeyUser,
      "registration_disabled" | "challenge_expired" | "verification_failed"
    >
  >;
  createAuthenticationOptions: () => Promise<
    Result<PublicKeyCredentialRequestOptionsJSON, never>
  >;
  verifyAuthentication: (args: {
    credential: PasskeyAuthenticationCredential;
  }) => Promise<
    Result<
      AuthUser,
      | "authentication_disabled"
      | "credential_not_found"
      | "challenge_expired"
      | "verification_failed"
    >
  >;
};

/** Result of completing any public passkey registration workflow */
export type VerifyRegistrationResult<SessionCredential> = Result<
  | {
      intent: "sign-up";
      userId: string;
      session: SessionCredential;
    }
  | {
      intent: "vouched";
      userId: string;
      session: SessionCredential;
    }
  | {
      intent: "add";
      userId: string;
    },
  | "registration_disabled"
  | "challenge_expired"
  | "verification_failed"
  | "not_authenticated"
  | "user_mismatch"
>;

/**
 * Passkey authentication workflows.
 *
 * Operations that use current-user authority receive the presented session
 * token as their first positional argument. The strategy derives userId from
 * that authority and never accepts an arbitrary public userId.
 */
export type PasskeyStrategy<SessionCredential> = {
  /** Begins passkey-first signup */
  createRegistrationOptions: () => Promise<
    Result<PublicKeyCredentialCreationOptionsJSON, "registration_disabled">
  >;
  /**
   * Begins registration for a user the application has verified by its own
   * proof (OTP, invite), with no session in play. Server-side only: the
   * userId must come from the application's verification, never from client
   * input. Completion establishes a session.
   */
  createVouchedRegistrationOptions: (args: {
    userId: string;
  }) => Promise<
    Result<PublicKeyCredentialCreationOptionsJSON, "registration_disabled">
  >;
  /** Begins adding a passkey for the authenticated user */
  createAdditionalRegistrationOptions: (
    token: string | null,
  ) => Promise<
    Result<
      PublicKeyCredentialCreationOptionsJSON,
      "not_authenticated" | "registration_disabled"
    >
  >;
  /** The strategy result determines whether completion signs in or adds */
  verifyRegistration: (
    token: string | null,
    args: { credential: PasskeyRegistrationCredential },
  ) => Promise<VerifyRegistrationResult<SessionCredential>>;
  createAuthenticationOptions: () => Promise<
    Result<PublicKeyCredentialRequestOptionsJSON, never>
  >;
  /** Verifies the assertion and establishes a session */
  verifyAuthentication: (args: {
    credential: PasskeyAuthenticationCredential;
  }) => Promise<
    Result<
      {
        userId: string;
        session: SessionCredential;
      },
      | "authentication_disabled"
      | "credential_not_found"
      | "challenge_expired"
      | "verification_failed"
    >
  >;
};
