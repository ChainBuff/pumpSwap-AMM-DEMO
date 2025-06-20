import { Connection, PublicKey } from "@solana/web3.js";

const RPC_ENDPOINT =
  process.env.SOLANA_NODE_RPC_ENDPOINT || "https://solana-rpc.publicnode.com";

const PUMP_AMM_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);
const connection = new Connection(RPC_ENDPOINT, "confirmed");

async function calculateTokenPoolPrice(
  connection: Connection,
  poolBaseTokenAccount: PublicKey,
  poolQuoteTokenAccount: PublicKey
): Promise<number> {
  const [baseBalanceResp, quoteBalanceResp] = await Promise.all([
    connection.getTokenAccountBalance(poolBaseTokenAccount),
    connection.getTokenAccountBalance(poolQuoteTokenAccount),
  ]);

  // Extract the UI amounts (human-readable with decimals)
  const baseAmount = parseFloat(baseBalanceResp.value.uiAmountString || "0");
  const quoteAmount = parseFloat(quoteBalanceResp.value.uiAmountString || "0");

  if (baseAmount === 0) {
    throw new Error("Base token balance is zero");
  }
  console.log("rate:", quoteAmount / baseAmount); //rate: 0.000002271155617142347 1 个代币 = 0.000002271155617142347 SOL
  return quoteAmount / baseAmount;
}

calculateTokenPoolPrice(
  connection,
  new PublicKey("6iStiZfzQd3MMj7v1qMrfDXSPGZEqrJ2J3PsEVgcH9Vz"),
  new PublicKey("7yGtQPNjUgg4uiZa6yALPB8Uni2jXaGD1Srh5n1daikL")
);
