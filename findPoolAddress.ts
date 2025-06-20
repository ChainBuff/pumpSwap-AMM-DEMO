/**
 * Solana PUMP AMM Interface
 *
 * This module provides functionality to interact with the PUMP AMM program on Solana, enabling:
 * - Finding market addresses by token mint
 * - Fetching and parsing market data from PUMP AMM pools
 * - Calculating token prices in AMM pools
 * - Creating associated token accounts (ATAs) idempotently
 * - Buying tokens on the PUMP AMM with slippage protection
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
  AccountMeta,
  VersionedTransaction,
  TransactionMessage,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import * as dotenv from "dotenv";

dotenv.config();

// 敞亮配置
const RPC_ENDPOINT =
  process.env.SOLANA_NODE_RPC_ENDPOINT || "https://solana-rpc.publicnode.com";

const PUMP_AMM_PROGRAM_ID = new PublicKey(
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
);

async function getMarketAddressByBaseMint(
  connection: Connection,
  baseMintAddress: PublicKey,
  ammProgramId: PublicKey
): Promise<PublicKey> {
  const baseMintBytes = baseMintAddress.toBuffer();
  const offset = 43;

  const filters: GetProgramAccountsFilter[] = [
    {
      memcmp: {
        offset: offset,
        bytes: bs58.encode(baseMintBytes),
      },
    },
  ];

  const response = await connection.getProgramAccounts(ammProgramId, {
    encoding: "base64",
    filters: filters,
  });

  if (response.length === 0) {
    throw new Error("No market found for the given token mint");
  }
  console.log("Address:", response[0].pubkey);
  return response[0].pubkey;
}
const connection = new Connection(RPC_ENDPOINT, "confirmed");
getMarketAddressByBaseMint(
  connection,
  new PublicKey("3Y7uP2UhEE68dpyAmWfXc7biSQmQqQonCiyDp6KYpump"),
  PUMP_AMM_PROGRAM_ID
).catch((err) => console.error(err));
/*
Address: PublicKey [PublicKey(2MY9H84iFRwNGYfCirQUdt2kdmWUK87akTt1agiAe59c)] {
  _bn: <BN: 141e842c139c3a2b3c2ded9249b9acfbdc224e7bcd57fa51221784a0637516bb>
}*/
