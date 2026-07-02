// @ts-nocheck
const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_URL = "https://api.stitch.money/graphql";

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.STITCH_CLIENT_ID!,
    client_secret: process.env.STITCH_CLIENT_SECRET!,
    audience: "https://api.stitch.money",
    scope: "client_paymentrequest client_disbursement",
  });

  const res = await fetch(STITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`Stitch auth failed: ${await res.text()}`);

  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function gql(query: string, variables: Record<string, any>) {
  const token = await getAccessToken();
  const res = await fetch(STITCH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Stitch API ${res.status}: ${await res.text()}`);

  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0]?.message || "Stitch GraphQL error");
  return body.data;
}

// ─── Payment Initiation (top-ups + payment link collections) ─────────────────

export async function createPaymentRequest(params: {
  amount: number;
  currency: string;
  reference: string;
  payerReference: string;
  redirectUrl: string;
}): Promise<{ id: string; url: string }> {
  const data = await gql(
    `mutation CreatePaymentRequest($input: PaymentInitiationRequestInput!) {
      clientPaymentInitiationRequestCreate(input: $input) {
        paymentInitiationRequest { id url }
      }
    }`,
    {
      input: {
        amount: { quantity: params.amount.toFixed(2), currency: params.currency },
        payerReference: params.payerReference,
        beneficiaryReference: params.reference,
        externalReference: params.reference,
        beneficiary: {
          bankAccount: {
            name: process.env.BUKKAPAY_ACCOUNT_NAME || "BukkaPay (Pty) Ltd",
            bankId: process.env.BUKKAPAY_BANK_ID || "fnb",
            accountNumber: process.env.BUKKAPAY_ACCOUNT_NUMBER!,
            accountType: "current",
            branchCode: process.env.BUKKAPAY_BRANCH_CODE,
          },
        },
        redirectUrl: params.redirectUrl,
      },
    }
  );
  return data.clientPaymentInitiationRequestCreate.paymentInitiationRequest;
}

export async function getPaymentStatus(paymentRequestId: string): Promise<"pending" | "completed" | "failed"> {
  const data = await gql(
    `query PaymentStatus($id: ID!) {
      node(id: $id) {
        ... on PaymentInitiationRequest {
          status {
            __typename
            ... on PaymentInitiationRequestComplete { amount { quantity } }
            ... on PaymentInitiationRequestFailed { reason }
          }
        }
      }
    }`,
    { id: paymentRequestId }
  );

  const typename = data.node?.status?.__typename;
  if (typename === "PaymentInitiationRequestComplete") return "completed";
  if (typename === "PaymentInitiationRequestFailed") return "failed";
  return "pending";
}

// ─── Disbursements (wallet withdrawals) ──────────────────────────────────────

export async function createDisbursement(params: {
  amount: number;
  currency: string;
  reference: string;
  recipientName: string;
  bankId: string;
  accountNumber: string;
  accountType: "current" | "savings" | "transmission";
}): Promise<{ id: string; status: string }> {
  const data = await gql(
    `mutation CreateDisbursement($input: DisbursementCreateInput!) {
      disbursementCreate(input: $input) {
        disbursement { id status }
      }
    }`,
    {
      input: {
        amount: { quantity: params.amount.toFixed(2), currency: params.currency },
        externalReference: params.reference,
        beneficiary: {
          bankAccount: {
            name: params.recipientName,
            bankId: params.bankId,
            accountNumber: params.accountNumber,
            accountType: params.accountType,
          },
        },
      },
    }
  );
  return data.disbursementCreate.disbursement;
}
