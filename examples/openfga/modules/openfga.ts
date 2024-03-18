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

  const authToken = getAuthorizationToken();

  const response = await fetch(
    `${environment.OPENFGA_URL}/stores/${environment.OPENFGA_STORE_ID}/check`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
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

function getAuthorizationToken() {
  // Depends on your authorization model for OpenFGA
  return "your-code-here";
}

export class AuthorizationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
