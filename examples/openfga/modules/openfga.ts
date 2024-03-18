import { environment } from "@zuplo/runtime";

export async function checkAccess(tuple: {
  user: string;
  relation: string;
  object: string;
}) {
  const body = {
    tuple_key: tuple,
    authorization_model_id: environment.OPEN_FGA_MODEL_ID,
  };

  // When testing OpenFGA you can use the API without authentication
  // In production, you will need to setup auth or use secure tunnels
  // const authToken = getToken();

  const response = await fetch(
    `${environment.OPENFGA_URL}/stores/${environment.OPENFGA_STORE_ID}/check`,
    {
      method: "POST",
      headers: {
        // Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const result = await response.json();

  if (result.allowed === true) {
    return true;
  } else {
    throw new AuthorizationError(result.code, result.message);
  }
}

export class AuthorizationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
